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

    /** increment value of a key by 1 and set a ttl */
    incrEx(key: string, expiry: number, cb: Callback) {
        const exp = expiry.toString();
        return this._client
            .multi([['incr', key], ['expire', key, exp]])
            .exec(cb);
    }

    /** increment value of a key by a given amount and set a ttl */
    incrbyEx(key: string, amount: number, expiry: number, cb: Callback) {
        const am = amount.toString();
        const exp = expiry.toString();
        return this._client
            .multi([['incrby', key, am], ['expire', key, exp]])
            .exec(cb);
    }

    /** execute a batch of commands */
    batch(cmds: string[][], cb: Callback) {
        return this._client.pipeline(cmds).exec(cb);
    }

    /**
     * Checks if a key exists
     * @param cb - callback
     *   If cb response returns 0, key does not exist.
     *   If cb response returns 1, key exists.
     */
    exists(key: string, cb: Callback) {
        return this._client.exists(key, cb);
    }

    /**
     * Add a value and its score to a sorted set. If no sorted set exists, this
     * will create a new one for the given key.
     * @param score - score used to order set
     */
    zadd(key: string, score: number, value: string, cb: Callback) {
        return this._client.zadd(key, score, value, cb);
    }

    /**
     * Get number of elements in a sorted set.
     * Note: using this on a key that does not exist will return 0.
     * Note: using this on an existing key that isn't a sorted set will
     * return an error WRONGTYPE.
     */
    zcard(key: string, cb: Callback) {
        return this._client.zcard(key, cb);
    }

    /**
     * Get the score for given value in a sorted set
     * Note: using this on a key that does not exist will return nil.
     * Note: using this on a value that does not exist in a valid sorted set key
     *       will return nil.
     */
     zscore(key: string, value: string, cb: Callback) {
        return this._client.zscore(key, value, cb);
    }

    /**
     * Remove a value from a sorted set
     * @param value - value within sorted set. Can specify multiple values within an array
     * @param {function} cb - callback
     *   The cb response returns number of values removed
     */
    zrem(key: string, value: string | string[], cb: Callback) {
        return this._client.zrem(key, value, cb);
    }

    /**
     * Get specified range of elements in a sorted set
     * @param start - start index (inclusive)
     * @param end - end index (inclusive) (can use -1)
     */
    zrange(key: string, start: number, end: number, cb: Callback) {
        return this._client.zrange(key, start, end, cb);
    }

    /**
     * Get range of elements in a sorted set based off score
     * @param min - min score value (inclusive)
     *   (can use "-inf")
     * @param max - max score value (inclusive)
     *   (can use "+inf")
     */
    zrangebyscore(
        key: string,
        min: number | string,
        max: number | string,
        cb: Callback,
    ) {
        return this._client.zrangebyscore(key, min, max, cb);
    }

    clear(cb: Callback) {
        return this._client.flushdb(cb);
    }

    disconnect() {
        this._client.disconnect();
    }
}
