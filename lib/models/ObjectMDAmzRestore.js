/*
 * Code based on Yutaka Oishi (Fujifilm) contributions
 * Date: 11 Sep 2020
 */

/**
 * class representing the x-amz-restore of object metadata.
 *
 * @class
 */
class ObjectMDAmzRestore {
    /**
     *
     * @constructor
     * @param {boolean} ongoingRequest ongoing-request
     * @param {Date} [expiryDate] expiry-date
     * @throws {Error} case of invalid parameter
     */
    constructor(ongoingRequest, expiryDate) {
        this.setOngoingRequest(ongoingRequest);
        this.setExpiryDate(expiryDate);
    }

    /**
     *
     * @param {Object} data archiveInfo
     * @returns {boolean} true if the provided object is valid
     */
    static isValid(data) {
        try {
            // eslint-disable-next-line no-new
            new ObjectMDAmzRestore(data['ongoing-request'], data['expiry-date']);
            return true;
        } catch (err) {
            return false;
        }
    }

    /**
     *
     * @returns {boolean} ongoing-request
     */
    getOngoingRequest() {
        return this['ongoing-request'];
    }

    /**
     *
     * @param {boolean} value ongoing-request
     * @returns {void}
     * @throws {Error} case of invalid parameter
     */
    setOngoingRequest(value) {
        if (value === undefined) {
            throw new Error('ongoing-request is required.');
        } else if (typeof value !== 'boolean') {
            throw new Error('ongoing-request must be type of boolean.');
        }
        this['ongoing-request'] = value;
    }

    /**
     *
     * @returns {Date} expiry-date
     */
    getExpiryDate() {
        return this['expiry-date'];
    }

    /**
     *
     * @param {Date} value expiry-date
     * @returns {void}
     * @throws {Error} case of invalid parameter
     */
    setExpiryDate(value) {
        if (value) {
            const checkWith = (new Date(value)).getTime();
            if (Number.isNaN(Number(checkWith))) {
                throw new Error('expiry-date is must be a valid Date.');
            }
            this['expiry-date'] = value;
        }
    }

    /**
     *
     * @returns {ObjectMDAmzRestore} itself
     */
    getValue() {
        return this;
    }
}

module.exports = ObjectMDAmzRestore;
