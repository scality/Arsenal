import StatsClient from './StatsClient';

/**
 * @class StatsModel
 *
 * @classdesc Extend and overwrite how timestamps are normalized by minutes
 * rather than by seconds
 */
export default class StatsModel extends StatsClient {
    /**
     * normalize date timestamp to the nearest hour
     * @param d - Date instance
     * @return timestamp - normalized to the nearest hour
     */
    normalizeTimestampByHour(d: Date): number {
        return d.setMinutes(0, 0, 0);
    }

    /**
     * get previous hour to date given
     * @param d - Date instance
     * @return timestamp - one hour prior to date passed
     */
    _getDatePreviousHour(d: Date): number {
        return d.setHours(d.getHours() - 1);
    }

    /**
     * normalize to the nearest interval
     * @param d - Date instance
     * @return timestamp - normalized to the nearest interval
     */
    _normalizeTimestamp(d: Date): number {
        const m = d.getMinutes();
        return d.setMinutes(m - m % (Math.floor(this._interval / 60)), 0, 0);
    }

    /**
     * override the method to get the result as an array of integers separated
     * by each interval
     * typical input looks like [[null, '1'], [null, '2'], [null, null]...]
     * @param arr - each index contains the result of each batch command
     *   where index 0 signifies the error and index 1 contains the result
     * @return array of integers, ordered from most recent interval to
     *   oldest interval
     */
    // @ts-ignore
    // TODO change name or conform to parent class method
    _getCount(arr: [any, string | null][]) {
        return arr.reduce<number[]>((store, i) => {
            let num = parseInt(i[1] ?? '', 10);
            num = Number.isNaN(num) ? 0 : num;
            store.push(num);
            return store;
        }, []);
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
