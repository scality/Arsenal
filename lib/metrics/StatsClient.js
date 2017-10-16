const async = require('async');

class StatsClient {
    /**
    * @constructor
    * @param {object} redisClient - RedisClient instance
    * @param {number} interval - sampling interval by seconds
    * @param {number} expiry - sampling duration by seconds
    */
    constructor(redisClient, interval, expiry) {
        this._redis = redisClient;
        this._interval = interval;
        this._expiry = expiry;
        return this;
    }

    /*
    * Utility function to use when callback is undefined
    */
    _noop() {}

    /**
    * normalize to the nearest interval
    * @param {object} d - Date instance
    * @return {number} timestamp - normalized to the nearest interval
    */
    _normalizeTimestamp(d) {
        const s = d.getSeconds();
        return d.setSeconds(s - s % this._interval, 0);
    }

    /**
    * set timestamp to the previous interval
    * @param {object} d - Date instance
    * @return {number} timestamp - set to the previous interval
    */
    _setPrevInterval(d) {
        return d.setSeconds(d.getSeconds() - this._interval);
    }

    /**
    * build redis key to get total number of occurrences on the server
    * @param {string} name - key name identifier
    * @param {object} d - Date instance
    * @return {string} key - key for redis
    */
    _buildKey(name, d) {
        return `${name}:${this._normalizeTimestamp(d)}`;
    }

    /**
    * reduce the array of values to a single value
    * typical input looks like [[null, '1'], [null, '2'], [null, null]...]
    * @param {array} arr - Date instance
    * @return {string} key - key for redis
    */
    _getCount(arr) {
        return arr.reduce((prev, a) => {
            let num = parseInt(a[1], 10);
            num = Number.isNaN(num) ? 0 : num;
            return prev + num;
        }, 0);
    }

    /**
    * report/record a new request received on the server
    * @param {string} id - service identifier
    * @param {callback} cb - callback
    * @return {undefined}
    */
    reportNewRequest(id, cb) {
        if (!this._redis) {
            return undefined;
        }
        const callback = cb || this._noop;
        const key = this._buildKey(`${id}:requests`, new Date());
        return this._redis.incrEx(key, this._expiry, callback);
    }

    /**
    * report/record a request that ended up being a 500 on the server
    * @param {string} id - service identifier
    * @param {callback} cb - callback
    * @return {undefined}
    */
    report500(id, cb) {
        if (!this._redis) {
            return undefined;
        }
        const callback = cb || this._noop;
        const key = this._buildKey(`${id}:500s`, new Date());
        return this._redis.incrEx(key, this._expiry, callback);
    }

    /**
    * get stats for the last x seconds, x being the sampling duration
    * @param {object} log - Werelogs request logger
    * @param {string} id - service identifier
    * @param {callback} cb - callback to call with the err/result
    * @return {undefined}
    */
    getStats(log, id, cb) {
        if (!this._redis) {
            return cb(null, {});
        }
        const d = new Date();
        const totalKeys = Math.floor(this._expiry / this._interval);
        const reqsKeys = [];
        const req500sKeys = [];
        for (let i = 0; i < totalKeys; i++) {
            reqsKeys.push(['get', this._buildKey(`${id}:requests`, d)]);
            req500sKeys.push(['get', this._buildKey(`${id}:500s`, d)]);
            this._setPrevInterval(d);
        }
        return async.parallel([
            next => this._redis.batch(reqsKeys, next),
            next => this._redis.batch(req500sKeys, next),
        ], (err, results) => {
            /**
            * Batch result is of the format
            * [ [null, '1'], [null, '2'], [null, '3'] ] where each
            * item is the result of the each batch command
            * Foreach item in the result, index 0 signifies the error and
            * index 1 contains the result
            */
            const statsRes = {
                'requests': 0,
                '500s': 0,
                'sampleDuration': this._expiry,
            };
            if (err) {
                log.error('error getting stats', {
                    error: err,
                    method: 'StatsClient.getStats',
                });
                /**
                * Redis for stats is not a critial component, ignoring
                * any error here as returning an InternalError
                * would be confused with the health of the service
                */
                return cb(null, statsRes);
            }
            statsRes.requests = this._getCount(results[0]);
            statsRes['500s'] = this._getCount(results[1]);
            return cb(null, statsRes);
        });
    }
}

module.exports = StatsClient;
