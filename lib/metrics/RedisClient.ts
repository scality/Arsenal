import Redis from 'ioredis';
import { Logger } from 'werelogs';

export type Config = { host: string; port: number; password: string };
export type Callback = (error: Error | null, value?: any) => void;

export default class RedisClient {
    _client: Redis.Redis;

    constructor(config: Config, logger: Logger) {
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
    * @param pattern - string pattern to match with all existing keys
    * @param [count=10] - scan count
    * @param cb - callback (error, result)
    */
    scan(pattern: string, count = 10, cb: Callback) {
        const params = { match: pattern, count };
        const keys: any[] = [];

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

    /** increment value of a key by 1 and set a ttl
     * @param key - key holding the value
     * @param expiry - expiry in seconds
     * @param cb - callback
     */
    incrEx(key: string, expiry: number, cb: Callback) {
        const exp = expiry.toString();
        return this._client
            .multi([['incr', key], ['expire', key, exp]])
            .exec(cb);
    }

    /**
     * increment value of a key by a given amount
     * @param key - key holding the value
     * @param amount - amount to increase by
     * @param cb - callback
     */
    incrby(key: string, amount: number, cb: Callback) {
        return this._client.incrby(key, amount, cb);
    }

    /** increment value of a key by a given amount and set a ttl
     * @param key - key holding the value
     * @param amount - amount to increase by
     * @param expiry - expiry in seconds
     * @param cb - callback
     */
    incrbyEx(key: string, amount: number, expiry: number, cb: Callback) {
        const am = amount.toString();
        const exp = expiry.toString();
        return this._client
            .multi([['incrby', key, am], ['expire', key, exp]])
            .exec(cb);
    }

    /**
     * decrement value of a key by a given amount
     * @param key - key holding the value
     * @param amount - amount to increase by
     * @param cb - callback
     */
    decrby(key: string, amount: number, cb: Callback) {
        return this._client.decrby(key, amount, cb);
    }

    /**
    * execute a batch of commands
    * @param cmds - list of commands
    * @param cb - callback
    * @return
    */
    batch(cmds: string[][], cb: Callback) {
        return this._client.pipeline(cmds).exec(cb);
    }

    /**
     * Checks if a key exists
     * @param key - name of key
     * @param cb - callback
     *   If cb response returns 0, key does not exist.
     *   If cb response returns 1, key exists.
     */
    exists(key: string, cb: Callback) {
        return this._client.exists(key, cb);
    }

    /**
     * get value stored at key
     * @param key - key holding the value
     * @param cb - callback
     */
    get(key: string, cb: Callback) {
        return this._client.get(key, cb);
    }

    /**
     * Add a value and its score to a sorted set. If no sorted set exists, this
     * will create a new one for the given key.
     * @param key - name of key
     * @param score - score used to order set
     * @param value - value to store
     * @param cb - callback
     */
    zadd(key: string, score: number, value: string, cb: Callback) {
        return this._client.zadd(key, score, value, cb);
    }

    /**
     * Get number of elements in a sorted set.
     * Note: using this on a key that does not exist will return 0.
     * Note: using this on an existing key that isn't a sorted set will
     * return an error WRONGTYPE.
     * @param key - name of key
     * @param cb - callback
     */
    zcard(key: string, cb: Callback) {
        return this._client.zcard(key, cb);
    }

    /**
     * Get the score for given value in a sorted set
     * Note: using this on a key that does not exist will return nil.
     * Note: using this on a value that does not exist in a valid sorted set key
     *       will return nil.
     * @param key - name of key
     * @param value - value within sorted set
     * @param cb - callback
     */
     zscore(key: string, value: string, cb: Callback) {
        return this._client.zscore(key, value, cb);
    }

    /**
     * Remove a value from a sorted set
     * @param key - name of key
     * @param value - value within sorted set. Can specify
     *   multiple values within an array
     * @param cb - callback
     *   The cb response returns number of values removed
     */
    zrem(key: string, value: string | string[], cb: Callback) {
        return this._client.zrem(key, value, cb);
    }

    /**
     * Get specified range of elements in a sorted set
     * @param key - name of key
     * @param start - start index (inclusive)
     * @param end - end index (inclusive) (can use -1)
     * @param cb - callback
     */
    zrange(key: string, start: number, end: number, cb: Callback) {
        return this._client.zrange(key, start, end, cb);
    }

    /**
     * Get range of elements in a sorted set based off score
     * @param key - name of key
     * @param min - min score value (inclusive)
     *   (can use "-inf")
     * @param max - max score value (inclusive)
     *   (can use "+inf")
     * @param cb - callback
     */
    zrangebyscore(
        key: string,
        min: number | string,
        max: number | string,
        cb: Callback,
    ) {
        return this._client.zrangebyscore(key, min, max, cb);
    }

    /**
     * get TTL or expiration in seconds
     * @param key - name of key
     * @param cb - callback
     */
    ttl(key: string, cb: Callback) {
        return this._client.ttl(key, cb);
    }

    clear(cb: Callback) {
        return this._client.flushdb(cb);
    }

    disconnect() {
        this._client.disconnect();
    }

    listClients(cb: Callback) {
        return this._client.client('list', cb);
    }
}
