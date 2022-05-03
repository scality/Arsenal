/**
 * class representing the archive of object metadata.
 *
 * @class
 */
class ObjectMDArchive {
    /**
     *
     * @constructor
     * @param {Object} archiveInfo contains the archive info set by the TLP and returned by the TLP jobs
     * @param {Date} [restoreRequestedAt] set at the time restore request is made by the client
     * @param {Number} [restoreRequestedDays] set at the time restore request is made by the client
     * @param {Date} [restoreCompletedAt] set at the time of successful restore
     * @param {Date} [restoreWillExpireAt] computed and stored at the time of restore
     * @throws {Error} case of invalid parameter
     */
    constructor(
        archiveInfo,
        restoreRequestedAt = undefined,
        restoreRequestedDays = undefined,
        restoreCompletedAt = undefined,
        restoreWillExpireAt = undefined
    ) {
        this.setArchiveInfo(archiveInfo);
        this.setRestoreRequestedAt(restoreRequestedAt);
        this.setRestoreRequestedDays(restoreRequestedDays);
        this.setRestoreCompletedAt(restoreCompletedAt);
        this.setRestoreWillExpireAt(restoreWillExpireAt);
    }

    /**
     *
     * @param {Object} data archiveInfo
     * @returns {boolean} true if the provided object is valid
     */
    static isValid(data) {
        try {
            new ObjectMDArchive(
                data.archiveInfo,
                data.restoreRequestedAt,
                data.restoreRequestedDays,
                data.restoreCompletedAt,
                data.restoreWillExpireAt,
            );
            return true;
        } catch (err) {
            return false;
        }
    }

    /**
     *
     * @returns {Object} archiveInfo
     */
    getArchiveInfo() {
        return this.archiveInfo;
    }

    /**
     * @param {Object} value archiveInfo
     * @returns {void}
     * @throws {Error} case of invalid parameter
     */
    setArchiveInfo(value) {
        if (!value) {
            throw new Error('archiveInfo is required.');
        } else if (typeof value !== 'object') {
            throw new Error('archiveInfo must be type of object.');
        }
        this.archiveInfo = value;
    }

    /**
     *
     * @returns {Date} restoreRequestedAt
     */
    getRestoreRequestedAt() {
        return this.restoreRequestedAt;
    }
    /**
     * @param {Object} value restoreRequestedAt
     * @returns {void}
     * @throws {Error} case of invalid parameter
     */
    setRestoreRequestedAt(value) {
        if (value) {
            if (!(value instanceof Date)) {
                throw new Error('restoreRequestedAt must be type of Date.');
            }
            this.restoreRequestedAt = value;
        }
    }

    /**
     *
     * @returns {Number} restoreRequestedDays
     */
    getRestoreRequestedDays() {
        return this.restoreRequestedDays;
    }
    /**
     * @param {Number} value restoreRequestedDays
     * @returns {void}
     * @throws {Error} case of invalid parameter
     */
    setRestoreRequestedDays(value) {
        if (value) {
            if (isNaN(value)) {
                throw new Error('restoreRequestedDays must be type of Number.');
            }
            this.restoreRequestedDays = value;
        }
    }

    /**
     *
     * @returns {Date} restoreCompletedAt
     */
    getRestoreCompletedAt() {
        return this.restoreCompletedAt;
    }
    /**
     * @param {Date} value restoreCompletedAt
     * @returns {void}
     * @throws {Error} case of invalid parameter
     */
    setRestoreCompletedAt(value) {
        if (value) {
            if (!this.restoreRequestedAt || !this.restoreRequestedDays) {
                throw new Error('restoreCompletedAt must be set after restoreRequestedAt and restoreRequestedDays.');
            }
            if (!(value instanceof Date)) {
                throw new Error('restoreCompletedAt must be type of Date.');
            }
            this.restoreCompletedAt = value;
        }
    }
    /**
     *
     * @returns {Date} restoreWillExpireAt
     */
    getRestoreWillExpireAt() {
        return this.restoreWillExpireAt;
    }
    /**
     * @param {Date} value restoreWillExpireAt
     * @returns {void}
     * @throws {Error} case of invalid parameter
     */
    setRestoreWillExpireAt(value) {
        if (value) {
            if (!this.restoreRequestedAt || !this.restoreRequestedDays) {
                throw new Error('restoreWillExpireAt must be set after restoreRequestedAt and restoreRequestedDays.');
            }
            if (!(value instanceof Date)) {
                throw new Error('restoreWillExpireAt must be type of Date.');
            }
            this.restoreWillExpireAt = value;
        }
    }

    /**
     *
     * @returns {ObjectMDArchive} itself
     */
    getValue() {
        return this;
    }
}

module.exports = ObjectMDArchive;
