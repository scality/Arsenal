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
    constructor(ongoingRequest, expiryDate = undefined) {
        this._data = {};
        this.setOngoingRequest(ongoingRequest);
        this.setExpiryDate(expiryDate);
    }

    /**
     *
     * @returns {boolean} ongoing-request
     */
    getOngoingRequest() {
        return this._data['ongoing-request'];
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
        this._data['ongoing-request'] = value;
    }

    /**
     *
     * @returns {Date} expiry-date
     */
    getExpiryDate() {
        return this._data['expiry-date'] || null;
    }

    /**
     *
     * @param {Date} value expiry-date
     * @returns {void}
     * @throws {Error} case of invalid parameter
     */
    setExpiryDate(value) {
        if (!(value instanceof Date)) {
            throw new Error('expiry-date is must be type of Date.');
        }

        this._data['expiry-date'] = value;
    }

    /**
     *
     * @returns {ObjectMDAmzRestore} itself
     */
    getValue() {
        return this._data;
    }
}

module.exports = ObjectMDAmzRestore;
