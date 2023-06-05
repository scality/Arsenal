import { scaleMsPerDay } from '../objectUtils';
const msInOneDay = 24 * 60 * 60 * 1000; // Milliseconds in a day.

export default class LifecycleDateTime {
    _transitionOneDayEarlier?: boolean;
    _expireOneDayEarlier?: boolean;
    _timeProgressionFactor?: number;
    _scaledMsPerDay: number;

    constructor(params?: {
        transitionOneDayEarlier: boolean;
        expireOneDayEarlier: boolean;
        timeProgressionFactor: number;
    }) {
        this._transitionOneDayEarlier = params?.transitionOneDayEarlier;
        this._expireOneDayEarlier = params?.expireOneDayEarlier;
        this._timeProgressionFactor = params?.timeProgressionFactor || 1;
        this._scaledMsPerDay = scaleMsPerDay(this._timeProgressionFactor);
    }

    getCurrentDate() {
        const timeTravel = this._expireOneDayEarlier ? msInOneDay : 0;
        return Date.now() + timeTravel;
    }

    /**
     * Helper method to get total Days passed since given date
     * @param date - date object
     * @return Days passed
     */
    findDaysSince(date: Date) {
        const now = this.getCurrentDate();
        const diff = now - date.getTime();
        return Math.floor(diff / this._scaledMsPerDay);
    }

    /**
     * Get the Unix timestamp of the given date.
     * @param date - The date string to convert to a Unix timestamp
     * @return - The Unix timestamp
     */
    getTimestamp(date: string | Date) {
        return new Date(date).getTime();
    }

    /**
     * Find the Unix time at which the transition should occur.
     * @param transition - A transition from the lifecycle transitions
     * @param lastModified - The object's last modified date
     * @return - The normalized transition timestamp
     */
    getTransitionTimestamp(
        transition: { Date?: string; Days?: number },
        lastModified: string,
    ) {
        if (transition.Date !== undefined) {
            return this.getTimestamp(transition.Date);
        }
        if (transition.Days !== undefined) {
            const lastModifiedTime = this.getTimestamp(lastModified);
            const timeTravel = this._transitionOneDayEarlier ? -msInOneDay : 0;
            return lastModifiedTime + (transition.Days * this._scaledMsPerDay) + timeTravel;
        }
    }

    /**
     * Find the Unix time at which the non-current version transition should occur.
     * @param transition - A non-current version transition from the lifecycle non-current version transitions
     * @param lastModified - The object's last modified date
     * @return - The normalized transition timestamp
     */
    getNCVTransitionTimestamp(
        transition: { NoncurrentDays?: number },
        lastModified: string,
    ) {
        if (transition.NoncurrentDays !== undefined) {
            const lastModifiedTime = this.getTimestamp(lastModified);
            const timeTravel = this._transitionOneDayEarlier ? -msInOneDay : 0;
            return lastModifiedTime + (transition.NoncurrentDays * this._scaledMsPerDay) + timeTravel;
        }
    }
}
