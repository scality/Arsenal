const oneDay = 24 * 60 * 60 * 1000; // Milliseconds in a day.

class LifecycleDateTime {
    constructor(params = {}) {
        this._transitionOneDayEarlier = params.transitionOneDayEarlier;
        this._expireOneDayEarlier = params.expireOneDayEarlier;
    }

    getCurrentDate() {
        const timeTravel = this._expireOneDayEarlier ? oneDay : 0;
        return Date.now() + timeTravel;
    }

    /**
     * Helper method to get total Days passed since given date
     * @param {Date} date - date object
     * @return {number} Days passed
     */
    findDaysSince(date) {
        const now = this.getCurrentDate();
        const diff = now - date;
        return Math.floor(diff / (1000 * 60 * 60 * 24));
    }

    /**
     * Get the Unix timestamp of the given date.
     * @param {string} date - The date string to convert to a Unix timestamp
     * @return {number} - The Unix timestamp
     */
    getTimestamp(date) {
        return new Date(date).getTime();
    }

    /**
     * Find the Unix time at which the transition should occur.
     * @param {object} transition - A transition from the lifecycle transitions
     * @param {string} lastModified - The object's last modified date
     * @return {number|undefined} - The normalized transition timestamp
     */
    getTransitionTimestamp(transition, lastModified) {
        if (transition.Date !== undefined) {
            return this.getTimestamp(transition.Date);
        }
        if (transition.Days !== undefined) {
            const lastModifiedTime = this.getTimestamp(lastModified);
            const timeTravel = this._transitionOneDayEarlier ? -oneDay : 0;

            return lastModifiedTime + (transition.Days * oneDay) + timeTravel;
        }
        return undefined;
    }
}

module.exports = LifecycleDateTime;
