const oneDay = 24 * 60 * 60 * 1000; // Milliseconds in a day.

export default class LifecycleDateTime {
    _transitionOneDayEarlier?: boolean;
    _expireOneDayEarlier?: boolean;

    constructor(params?: {
        transitionOneDayEarlier: boolean;
        expireOneDayEarlier: boolean;
    }) {
        this._transitionOneDayEarlier = params?.transitionOneDayEarlier;
        this._expireOneDayEarlier = params?.expireOneDayEarlier;
    }

    getCurrentDate() {
        const timeTravel = this._expireOneDayEarlier ? oneDay : 0;
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
        return Math.floor(diff / (1000 * 60 * 60 * 24));
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
            const timeTravel = this._transitionOneDayEarlier ? -oneDay : 0;
            return lastModifiedTime + (transition.Days * oneDay) + timeTravel;
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
            const timeTravel = this._transitionOneDayEarlier ? -oneDay : 0;
            return lastModifiedTime + (transition.NoncurrentDays * oneDay) + timeTravel;
        }
    }
}
