/*
 * Code based on Yutaka Oishi (Fujifilm) contributions
 * Date: 11 Sep 2020
 */

/**
 * class representing the x-amz-restore of object metadata.
 *
 * @class
 */
export default class ObjectMDAmzRestore {
    'expiry-date': Date | string;
    'ongoing-request': boolean;

    /**
     *
     * @constructor
     * @param ongoingRequest ongoing-request
     * @param [expiryDate] expiry-date
     * @throws case of invalid parameter
     */
    constructor(ongoingRequest: boolean, expiryDate?: Date | string) {
        this.setOngoingRequest(ongoingRequest);
        this.setExpiryDate(expiryDate);
    }

    /**
     *
     * @param data archiveInfo
     * @returns true if the provided object is valid
     */
    static isValid(data: { 'ongoing-request': boolean; 'expiry-date': Date | string }) {
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
     * @returns ongoing-request
     */
    getOngoingRequest() {
        return this['ongoing-request'];
    }

    /**
     *
     * @param value ongoing-request
     * @throws case of invalid parameter
     */
    setOngoingRequest(value?: boolean) {
        if (value === undefined) {
            throw new Error('ongoing-request is required.');
        } else if (typeof value !== 'boolean') {
            throw new Error('ongoing-request must be type of boolean.');
        }
        this['ongoing-request'] = value;
    }

    /**
     *
     * @returns expiry-date
     */
    getExpiryDate() {
        return this['expiry-date'];
    }

    /**
     *
     * @param value expiry-date
     * @throws case of invalid parameter
     */
    setExpiryDate(value?: Date | string) {
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
     * @returns itself
     */
    getValue() {
        return this;
    }
}
