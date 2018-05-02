const async = require('async');

const StatsClient = require('./StatsClient');
 /**
 * @class StatsModel
 *
 * @classdesc Extend and overwrite how timestamps are normalized by minutes
 * rather than by seconds
 */
class StatsModel extends StatsClient {

    /**
    * Utility method to convert 2d array rows to columns, and vice versa
    * See also: https://docs.ruby-lang.org/en/2.0.0/Array.html#method-i-zip
    * @param {array} arrays - 2d array of integers
    * @return {array} converted array
    */
    _zip(arrays) {
        if (arrays.length > 0 && arrays.every(a => Array.isArray(a))) {
            return arrays[0].map((_, i) => arrays.map(a => a[i]));
        }
        return [];
    }

    /**
    * normalize to the nearest interval
    * @param {object} d - Date instance
    * @return {number} timestamp - normalized to the nearest interval
    */
    _normalizeTimestamp(d) {
        const m = d.getMinutes();
        return d.setMinutes(m - m % (Math.floor(this._interval / 60)), 0, 0);
    }

    /**
    * override the method to get the count as an array of integers separated
    * by each interval
    * typical input looks like [[null, '1'], [null, '2'], [null, null]...]
    * @param {array} arr - each index contains the result of each batch command
    *   where index 0 signifies the error and index 1 contains the result
    * @return {array} array of integers, ordered from most recent interval to
    *   oldest interval with length of (expiry / interval)
    */
    _getCount(arr) {
        const size = Math.floor(this._expiry / this._interval);
        const array = arr.reduce((store, i) => {
            let num = parseInt(i[1], 10);
            num = Number.isNaN(num) ? 0 : num;
            store.push(num);
            return store;
        }, []);

        if (array.length < size) {
            array.push(...Array(size - array.length).fill(0));
        }
        return array;
    }

    /**
    * wrapper on `getStats` that handles a list of keys
    * override the method to reduce the returned 2d array from `_getCount`
    * @param {object} log - Werelogs request logger
    * @param {array} ids - service identifiers
    * @param {callback} cb - callback to call with the err/result
    * @return {undefined}
    */
    getAllStats(log, ids, cb) {
        if (!this._redis) {
            return cb(null, {});
        }

        const size = Math.floor(this._expiry / this._interval);
        const statsRes = {
            'requests': Array(size).fill(0),
            '500s': Array(size).fill(0),
            'sampleDuration': this._expiry,
        };
        const requests = [];
        const errors = [];

        if (ids.length === 0) {
            return cb(null, statsRes);
        }

        // for now set concurrency to default of 10
        return async.eachLimit(ids, 10, (id, done) => {
            this.getStats(log, id, (err, res) => {
                if (err) {
                    return done(err);
                }
                requests.push(res.requests);
                errors.push(res['500s']);
                return done();
            });
        }, error => {
            if (error) {
                log.error('error getting stats', {
                    error,
                    method: 'StatsModel.getAllStats',
                });
                return cb(null, statsRes);
            }

            statsRes.requests = this._zip(requests).map(arr =>
                arr.reduce((acc, i) => acc + i), 0);
            statsRes['500s'] = this._zip(errors).map(arr =>
                arr.reduce((acc, i) => acc + i), 0);

            return cb(null, statsRes);
        });
    }

    /**
     * normalize date timestamp to the nearest hour
     * @param {Date} d - Date instance
     * @return {number} timestamp - normalized to the nearest hour
     */
    normalizeTimestampByHour(d) {
        return d.setMinutes(0, 0, 0);
    }

    /**
     * get previous hour to date given
     * @param {Date} d - Date instance
     * @return {number} timestamp - one hour prior to date passed
     */
    _getDatePreviousHour(d) {
        return d.setHours(d.getHours() - 1);
    }

    /**
     * normalize to the nearest interval
     * @param {object} d - Date instance
     * @return {number} timestamp - normalized to the nearest interval
     */
    _normalizeTimestamp(d) {
        const m = d.getMinutes();
        return d.setMinutes(m - m % (Math.floor(this._interval / 60)), 0, 0);
    }

    /**
     * override the method to get the result as an array of integers separated
     * by each interval
     * typical input looks like [[null, '1'], [null, '2'], [null, null]...]
     * @param {array} arr - each index contains the result of each batch command
     *   where index 0 signifies the error and index 1 contains the result
     * @return {array} array of integers, ordered from most recent interval to
     *   oldest interval
     */
    _getCount(arr) {
        return arr.reduce((store, i) => {
            let num = parseInt(i[1], 10);
            num = Number.isNaN(num) ? 0 : num;
            store.push(num);
            return store;
        }, []);
    }

    /**
     * get list of sorted set key timestamps
     * @param {number} epoch - epoch time
     * @return {array} array of sorted set key timestamps
     */
    getSortedSetHours(epoch) {
        const timestamps = [];
        let date = this.normalizeTimestampByHour(new Date(epoch));
        while (timestamps.length < 24) {
            timestamps.push(date);
            date = this._getDatePreviousHour(new Date(date));
        }
        return timestamps;
    }

    /**
     * get the normalized hour timestamp for given epoch time
     * @param {number} epoch - epoch time
     * @return {string} normalized hour timestamp for given time
     */
    getSortedSetCurrentHour(epoch) {
        return this.normalizeTimestampByHour(new Date(epoch));
    }

    /**
     * helper method to add element to a sorted set, applying TTL if new set
     * @param {string} key - name of key
     * @param {integer} score - score used to order set
     * @param {string} value - value to store
     * @param {callback} cb - callback
     * @return {undefined}
     */
    addToSortedSet(key, score, value, cb) {
        this._redis.exists(key, (err, resCode) => {
            if (err) {
                return cb(err);
            }
            if (resCode === 0) {
                // milliseconds in a day
                const msInADay = 24 * 60 * 60 * 1000;
                const nearestHour = this.normalizeTimestampByHour(new Date());
                // in seconds
                const ttl = Math.ceil(
                    (msInADay - (Date.now() - nearestHour)) / 1000);
                const cmds = [
                    ['zadd', key, score, value],
                    ['expire', key, ttl],
                ];
                return this._redis.batch(cmds, (err, res) => {
                    if (err) {
                        return cb(err);
                    }
                    const cmdErr = res.find(r => r[0] !== null);
                    if (cmdErr) {
                        return cb(cmdErr);
                    }
                    const successResponse = res[0][1];
                    return cb(null, successResponse);
                });
            }
            return this._redis.zadd(key, score, value, cb);
        });
    }
}

module.exports = StatsModel;
