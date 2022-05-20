/**
 * class representing the archive of object metadata.
 *
 * @class
 */
export default class ObjectMDArchive {
    archiveInfo: any;
    // @ts-ignore
    restoreRequestedAt: Date | string;
    // @ts-ignore
    restoreRequestedDays: number;
    // @ts-ignore
    restoreCompletedAt: Date | string;
    // @ts-ignore
    restoreWillExpireAt: Date | string;

    /**
     *
     * @constructor
     * @param archiveInfo contains the archive info set by the TLP and returned by the TLP jobs
     * @param [restoreRequestedAt] set at the time restore request is made by the client
     * @param [restoreRequestedDays] set at the time restore request is made by the client
     * @param [restoreCompletedAt] set at the time of successful restore
     * @param [restoreWillExpireAt] computed and stored at the time of restore
     * @throws case of invalid parameter
     */
    constructor(
        archiveInfo: any,
        restoreRequestedAt?: Date | string,
        restoreRequestedDays?: number,
        restoreCompletedAt?: Date | string,
        restoreWillExpireAt?: Date | string,
    ) {
        this.setArchiveInfo(archiveInfo);
        this.setRestoreRequestedAt(restoreRequestedAt!);
        this.setRestoreRequestedDays(restoreRequestedDays!);
        this.setRestoreCompletedAt(restoreCompletedAt!);
        this.setRestoreWillExpireAt(restoreWillExpireAt!);
    }

    /**
     *
     * @param data archiveInfo
     * @returns true if the provided object is valid
     */
    static isValid(data: {
        archiveInfo: any;
        restoreRequestedAt?: Date;
        restoreRequestedDays?: number;
        restoreCompletedAt?: Date;
        restoreWillExpireAt?: Date;
    }) {
        try {
            // eslint-disable-next-line no-new
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
     * @returns archiveInfo
     */
    getArchiveInfo() {
        return this.archiveInfo;
    }

    /**
     * @param value archiveInfo
     * @throws case of invalid parameter
     */
    setArchiveInfo(value: any) {
        if (!value) {
            throw new Error('archiveInfo is required.');
        } else if (typeof value !== 'object') {
            throw new Error('archiveInfo must be type of object.');
        }
        this.archiveInfo = value;
    }

    /**
     *
     * @returns restoreRequestedAt
     */
    getRestoreRequestedAt() {
        return this.restoreRequestedAt;
    }
    /**
     * @param value restoreRequestedAt
     * @throws case of invalid parameter
     */
    setRestoreRequestedAt(value: Date | string) {
        if (value) {
            const checkWith = (new Date(value)).getTime();
            if (Number.isNaN(Number(checkWith))) {
                throw new Error('restoreRequestedAt must be a valid Date.');
            }
            this.restoreRequestedAt = value;
        }
    }

    /**
     *
     * @returns restoreRequestedDays
     */
    getRestoreRequestedDays() {
        return this.restoreRequestedDays;
    }
    /**
     * @param value restoreRequestedDays
     * @throws case of invalid parameter
     */
    setRestoreRequestedDays(value: number) {
        if (value) {
            if (isNaN(value)) {
                throw new Error('restoreRequestedDays must be type of Number.');
            }
            this.restoreRequestedDays = value;
        }
    }

    /**
     *
     * @returns restoreCompletedAt
     */
    getRestoreCompletedAt() {
        return this.restoreCompletedAt;
    }
    /**
     * @param value restoreCompletedAt
     * @throws case of invalid parameter
     */
    setRestoreCompletedAt(value: Date | string) {
        if (value) {
            if (!this.restoreRequestedAt || !this.restoreRequestedDays) {
                throw new Error('restoreCompletedAt must be set after restoreRequestedAt and restoreRequestedDays.');
            }
            const checkWith = (new Date(value)).getTime();
            if (Number.isNaN(Number(checkWith))) {
                throw new Error('restoreCompletedAt must be a valid Date.');
            }
            this.restoreCompletedAt = value;
        }
    }
    /**
     *
     * @returns restoreWillExpireAt
     */
    getRestoreWillExpireAt() {
        return this.restoreWillExpireAt;
    }
    /**
     * @param value restoreWillExpireAt
     * @throws case of invalid parameter
     */
    setRestoreWillExpireAt(value: Date | string) {
        if (value) {
            if (!this.restoreRequestedAt || !this.restoreRequestedDays) {
                throw new Error('restoreWillExpireAt must be set after restoreRequestedAt and restoreRequestedDays.');
            }
            const checkWith = (new Date(value)).getTime();
            if (Number.isNaN(Number(checkWith))) {
                throw new Error('restoreWillExpireAt must be a valid Date.');
            }
            this.restoreWillExpireAt = value;
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
