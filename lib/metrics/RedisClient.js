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
            })
        );
        return this;
    }

    /**
    * scan a pattern and return matching keys
    * @param {string} pattern - string pattern to match with all existing keys
    * @param {number} [count=10] - scan count
    * @param {callback} cb - callback (error, result)
    * @return {undefined}
    */
    scan(pattern, count = 10, cb) {
        const params = { match: pattern, count };
        const keys = [];

        const stream = this._client.scanStream(params);
        stream.on('data', resultKeys => {
            for (let i = 0; i < resultKeys.length; i++) {
                keys.push(resultKeys[i]);
            }
        });
        stream.on('end', () => {
            cb(null, keys);
        });
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
     * increment value of a key by a given amount
     * @param {string} key - key holding the value
     * @param {number} amount - amount to increase by
     * @param {callback} cb - callback
     * @return {undefined}
     */
    incrby(key, amount, cb) {
        return this._client.incrby(key, amount, cb);
    }

    /**
     * decrement value of a key by a given amount
     * @param {string} key - key holding the value
     * @param {number} amount - amount to increase by
     * @param {callback} cb - callback
     * @return {undefined}
     */
    decrby(key, amount, cb) {
        return this._client.decrby(key, amount, cb);
    }

    /**
     * get value stored at key
     * @param {string} key - key holding the value
     * @param {callback} cb - callback
     * @return {undefined}
     */
    get(key, cb) {
        return this._client.get(key, cb);
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

    clear(cb) {
        return this._client.flushdb(cb);
    }

    disconnect(cb) {
        return this._client.quit(cb);
    }

    listClients(cb) {
        return this._client.client('list', cb);
    }
}

module.exports = RedisClient;
