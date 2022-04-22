const Redis = require('ioredis');

class RedisClient {
    /**
    * @constructor
    * @param {Object} config - config
    * @param {string} config.host - Redis host
    * @param {number} config.port - Redis port
    * @param {string} config.password - Redis password
    * @param {werelogs.Logger} logger - logger instance
    */
    constructor(config, logger) {
        this._client = new Redis(config);
        this._client.on('error', err =>
            logger.trace('error from redis', {
                error: err,
                method: 'RedisClient.constructor',
                redisHost: config.host,
                redisPort: config.port,
            }),
        );
        return this;
    }

    /**
    * increment value of a key by 1 and set a ttl
    * @param {string} key - key holding the value
    * @param {number} expiry - expiry in seconds
    * @param {callback} cb - callback
    * @return {undefined}
    */
    incrEx(key, expiry, cb) {
        return this._client
            .multi([['incr', key], ['expire', key, expiry]])
            .exec(cb);
    }

    /**
     * increment value of a key by a given amount and set a ttl
     * @param {string} key - key holding the value
     * @param {number} amount - amount to increase by
     * @param {number} expiry - expiry in seconds
     * @param {callback} cb - callback
     * @return {undefined}
     */
    incrbyEx(key, amount, expiry, cb) {
        return this._client
            .multi([['incrby', key, amount], ['expire', key, expiry]])
            .exec(cb);
    }

    /**
    * execute a batch of commands
    * @param {string[]} cmds - list of commands
    * @param {callback} cb - callback
    * @return {undefined}
    */
    batch(cmds, cb) {
        return this._client.pipeline(cmds).exec(cb);
    }

    /**
     * Checks if a key exists
     * @param {string} key - name of key
     * @param {function} cb - callback
     *   If cb response returns 0, key does not exist.
     *   If cb response returns 1, key exists.
     * @return {undefined}
     */
    exists(key, cb) {
        return this._client.exists(key, cb);
    }

    /**
     * Add a value and its score to a sorted set. If no sorted set exists, this
     * will create a new one for the given key.
     * @param {string} key - name of key
     * @param {integer} score - score used to order set
     * @param {string} value - value to store
     * @param {callback} cb - callback
     * @return {undefined}
     */
    zadd(key, score, value, cb) {
        return this._client.zadd(key, score, value, cb);
    }

    /**
     * Get number of elements in a sorted set.
     * Note: using this on a key that does not exist will return 0.
     * Note: using this on an existing key that isn't a sorted set will
     * return an error WRONGTYPE.
     * @param {string} key - name of key
     * @param {function} cb - callback
     * @return {undefined}
     */
    zcard(key, cb) {
        return this._client.zcard(key, cb);
    }

    /**
     * Get the score for given value in a sorted set
     * Note: using this on a key that does not exist will return nil.
     * Note: using this on a value that does not exist in a valid sorted set key
     *       will return nil.
     * @param {string} key - name of key
     * @param {string} value - value within sorted set
     * @param {function} cb - callback
     * @return {undefined}
     */
    zscore(key, value, cb) {
        return this._client.zscore(key, value, cb);
    }

    /**
     * Remove a value from a sorted set
     * @param {string} key - name of key
     * @param {string|array} value - value within sorted set. Can specify
     *   multiple values within an array
     * @param {function} cb - callback
     *   The cb response returns number of values removed
     * @return {undefined}
     */
    zrem(key, value, cb) {
        return this._client.zrem(key, value, cb);
    }

    /**
     * Get specified range of elements in a sorted set
     * @param {string} key - name of key
     * @param {integer} start - start index (inclusive)
     * @param {integer} end - end index (inclusive) (can use -1)
     * @param {function} cb - callback
     * @return {undefined}
     */
    zrange(key, start, end, cb) {
        return this._client.zrange(key, start, end, cb);
    }

    /**
     * Get range of elements in a sorted set based off score
     * @param {string} key - name of key
     * @param {integer|string} min - min score value (inclusive)
     *   (can use "-inf")
     * @param {integer|string} max - max score value (inclusive)
     *   (can use "+inf")
     * @param {function} cb - callback
     * @return {undefined}
     */
    zrangebyscore(key, min, max, cb) {
        return this._client.zrangebyscore(key, min, max, cb);
    }

    clear(cb) {
        return this._client.flushdb(cb);
    }

    disconnect() {
        this._client.disconnect();
    }
}

module.exports = RedisClient;
