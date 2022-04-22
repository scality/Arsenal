import StatsClient from './StatsClient';
import { Logger } from 'werelogs';

export type Callback = (error: Error | null, value?: any) => void;

/**
 * @class StatsModel
 *
 * @classdesc Extend and overwrite how timestamps are normalized by minutes
 * rather than by seconds
 */
export default class StatsModel extends StatsClient {
    /**
    * Utility method to convert 2d array rows to columns, and vice versa
    * See also: https://docs.ruby-lang.org/en/2.0.0/Array.html#method-i-zip
    * @param arrays - 2d array of integers
    * @return converted array
    */
    _zip(arrays: number[][]) {
        if (arrays.length > 0 && arrays.every(a => Array.isArray(a))) {
            return arrays[0].map((_, i) => arrays.map(a => a[i]));
        }
        return [];
    }

    /**
    * normalize to the nearest interval
    * @param d - Date instance
    * @return timestamp - normalized to the nearest interval
    */
    _normalizeTimestamp(d: Date) {
        const m = d.getMinutes();
        return d.setMinutes(m - m % (Math.floor(this._interval / 60)), 0, 0);
    }

    /**
    * override the method to get the count as an array of integers separated
    * by each interval
    * typical input looks like [[null, '1'], [null, '2'], [null, null]...]
    * @param arr - each index contains the result of each batch command
    *   where index 0 signifies the error and index 1 contains the result
    * @return array of integers, ordered from most recent interval to
    *   oldest interval with length of (expiry / interval)
    */
    // @ts-expect-errors
    _getCount(arr: [any, string | null][]): number[] {
        const size = Math.floor(this._expiry / this._interval);
        const array = arr.reduce((store, i) => {
            let num = parseInt(i[1] ?? '', 10);
            num = Number.isNaN(num) ? 0 : num;
            store.push(num);
            return store;
        }, [] as number[]);

        if (array.length < size) {
            array.push(...Array(size - array.length).fill(0));
        }
        return array;
    }

    /**
    * wrapper on `getStats` that handles a list of keys
    * override the method to reduce the returned 2d array from `_getCount`
    * @param log - Werelogs request logger
    * @param ids - service identifiers
    * @param cb - callback to call with the err/result
    */
    getAllStats(log: Logger, ids: string[], cb: Callback) {
        if (!this._redis) {
            return cb(null, {});
        }

        const size = Math.floor(this._expiry / this._interval);
        const statsRes = {
            'requests': Array(size).fill(0),
            '500s': Array(size).fill(0),
            'sampleDuration': this._expiry,
        };
        const requests: any[] = [];
        const errors: any[] = [];

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
     * Handles getting a list of global keys.
     * @param ids - Service identifiers
     * @param log - Werelogs request logger
     * @param cb - Callback
     */
    getAllGlobalStats(ids: string[], log: Logger, cb: Callback) {
        const reqsKeys = ids.map(key => (['get', key]));
        return this._redis.batch(reqsKeys, (err, res) => {
            const statsRes = { requests: 0 };
            if (err) {
                log.error('error getting metrics', {
                    error: err,
                    method: 'StatsClient.getAllGlobalStats',
                });
                return cb(null, statsRes);
            }
            statsRes.requests = res.reduce((sum, curr) => {
                const [cmdErr, val] = curr;
                if (cmdErr) {
                    // Log any individual request errors from the batch request.
                    log.error('error getting metrics', {
                        error: cmdErr,
                        method: 'StatsClient.getAllGlobalStats',
                    });
                }
                return sum + (Number.parseInt(val, 10) || 0);
            }, 0);
            return cb(null, statsRes);
        });
    }

    /**
     * normalize date timestamp to the nearest hour
     * @param d - Date instance
     * @return timestamp - normalized to the nearest hour
     */
    normalizeTimestampByHour(d: Date) {
        return d.setMinutes(0, 0, 0);
    }

    /**
     * get previous hour to date given
     * @param d - Date instance
     * @return timestamp - one hour prior to date passed
     */
    _getDatePreviousHour(d: Date) {
        return d.setHours(d.getHours() - 1);
    }

    /**
     * get list of sorted set key timestamps
     * @param epoch - epoch time
     * @return array of sorted set key timestamps
     */
    getSortedSetHours(epoch: number) {
        const timestamps: number[] = [];
        let date = this.normalizeTimestampByHour(new Date(epoch));
        while (timestamps.length < 24) {
            timestamps.push(date);
            date = this._getDatePreviousHour(new Date(date));
        }
        return timestamps;
    }

    /**
     * get the normalized hour timestamp for given epoch time
     * @param epoch - epoch time
     * @return normalized hour timestamp for given time
     */
    getSortedSetCurrentHour(epoch: number) {
        return this.normalizeTimestampByHour(new Date(epoch));
    }

    /**
     * helper method to add element to a sorted set, applying TTL if new set
     * @param key - name of key
     * @param score - score used to order set
     * @param value - value to store
     * @param cb - callback
     */
    addToSortedSet(
        key: string,
        score: number,
        value: string,
        cb: (error: Error | null, value?: any) => void,
    ) {
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
                    ['zadd', key, score.toString(), value],
                    ['expire', key, ttl.toString()],
                ];
                return this._redis.batch(cmds, (err, res) => {
                    if (err) {
                        return cb(err);
                    }
                    const cmdErr = res.find((r: any) => r[0] !== null);
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
