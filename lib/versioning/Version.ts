import { VersioningConstants } from './constants';

const VID_SEP = VersioningConstants.VersionId.Separator;
/**
 * Class for manipulating an object version.
 * The format of a version: { isNull, isNull2, isDeleteMarker, versionId, otherInfo }
 *
 * @note Some of these functions are optimized based on string search
 * prior to a full JSON parse/stringify. (Vinh: 18K op/s are achieved
 * with the full stringify/parse cycle, which is too low a number for
 * use with a production setup with Metadata).
 */
export class Version {
    version: {
        isNull?: boolean;
        isNull2?: boolean;
        isDeleteMarker?: boolean;
        versionId?: string;
        isPHD?: boolean;
    };

    /**
     * Create a new version instantiation from its data object.
     * @param version - the data object to instantiate
     * @param version.isNull - is a null version
     * @param version.isNull2 - Whether new version is null or not AND has
     * been put with a Cloudserver handling null keys (i.e. supporting
     * S3C-7352)
     * @param version.isDeleteMarker - is a delete marker
     * @param version.versionId - the version id
     * @constructor
     */
    constructor(version?: {
        isNull?: boolean;
        isNull2?: boolean;
        isDeleteMarker?: boolean;
        versionId?: string;
        isPHD?: boolean;
    }) {
        this.version = version || {};
    }

    /**
     * Parse the version information from a string.
     *
     * @param value - the string to parse
     * @return - the version deserialized from the input string
     */
    static from(value: string) {
        return new Version(value ? JSON.parse(value) : undefined);
    }

    /**
     * [MetaData Internal] Check if a version is a place holder for deletion.
     *
     * @param value - version to check
     * @return - whether this is a PHD version
     */
    static isPHD(value: string) {
        // check if the input is a valid version
        if (!value) {
            return false;
        }
        // look for the keyword 'isPHD' in the value before parsing it;
        // all PHD versions must have this keyword
        if (value.indexOf('isPHD') < 0) {
            return false;
        }
        // parse the value if it has the keyword 'isPHD'
        try {
            return Version.from(value).isPHDVersion();
        } catch (exception) {
            // eslint-disable-line strict
            return false; // nice, Vault
        }
    }

    /**
     * Generate a fixed size serialized place holder for deletion (PHD version).
     * A PHD version is used internally by metadata (VersioningRequestProcessor)
     * to indicate that the master version of an object has been deleted and it
     * needs to be updated by the latest version if any.
     *
     * @param versionId - versionId of the PHD version
     * @return - the serialized version
     */
    static generatePHDVersion(versionId: string) {
        return `{ "isPHD": true, "versionId": "${versionId}" }`;
    }

    /**
     * Appends a key-value pair to a JSON object represented as a string. It intelligently adds
     * a comma if the object is not empty (i.e., not just '{}'). This function assumes the input
     * string is properly formatted as a JSON object.
     *
     * @param {string} stringifiedObject The JSON object as a string to which the key-value pair will be appended.
     * @param {string} key The key to append to the JSON object.
     * @param {string} value The value associated with the key to append to the JSON object.
     * @returns {string} The updated JSON object as a string with the new key-value pair appended.
     * @example
     * _jsonAppend('{"existingKey":"existingValue"}', 'newKey', 'newValue');
     * // returns '{"existingKey":"existingValue","newKey":"newValue"}'
     */
    static _jsonAppend(stringifiedObject: string, key: string, value: string): string {
        // stringifiedObject value has the format of '{...}'
        let index = stringifiedObject.length - 2;
        while (stringifiedObject.charAt(index--) === ' ');
        const comma = stringifiedObject.charAt(index + 1) !== '{';
        return (
            `${stringifiedObject.slice(0, stringifiedObject.length - 1)}` + // eslint-disable-line
            (comma ? ',' : '') +
            `"${key}":"${value}"}`
        );
    }

    /**
     * Put versionId into an object in the (cheap) way of string manipulation,
     * instead of the more expensive alternative parsing and stringification.
     *
     * @param value - stringification of the object to append versionId
     * @param versionId - the versionId to append
     * @return - the object with versionId appended
     */
    static appendVersionId(value: string, versionId: string): string {
        // assuming value has the format of '{...}'
        return Version._jsonAppend(value, 'versionId', versionId);
    }

    /**
    * Updates or appends a `nullVersionId` property to a JSON-formatted string.
    * This function first checks if the `nullVersionId` property already exists within the input string.
    * If it exists, the function updates the `nullVersionId` with the new value provided.
    * If it does not exist, the function appends a `nullVersionId` property with the provided value.
    * 
    * NOTE: This function assumes the input string is in a valid JSON format and handles the `nullVersionId`
    * property as a string value.
    *
    * @static
    * @param {string} value - The JSON-formatted string that may already contain a `nullVersionId` property.
    * @param {string} nullVersionId - The new value for the `nullVersionId` property to be updated or appended.
    * @returns {string} The updated JSON-formatted string with the new `nullVersionId` value.
    */
    static updateOrAppendNullVersionId(value: string, nullVersionId: string): string {
        // Check if "nullVersionId" already exists in the string
        const nullVersionIdPattern = /"nullVersionId":"[^"]*"/;
        const nullVersionIdExists = nullVersionIdPattern.test(value);

        if (nullVersionIdExists) {
            // Replace the existing nullVersionId with the new one
            return value.replace(nullVersionIdPattern, `"nullVersionId":"${nullVersionId}"`);
        } else {
            // Append nullVersionId in the cheap way as before
            return Version._jsonAppend(value, 'nullVersionId', nullVersionId);
        }
    }

    /**
     * [MetaData Internal] Check if a version is a place holder for deletion.
     *
     * @return {boolean} - whether this is a PHD version
     */
    isPHDVersion(): boolean {
        return this.version.isPHD || false;
    }

    /**
     * Check if a version is a null version.
     *
     * @return - stating if the value is a null version
     */
    isNullVersion(): boolean {
        return this.version.isNull ?? false;
    }

    /**
     * Check if a stringified object is a delete marker.
     *
     * @param value - the stringified object to check
     * @return - if the object is a delete marker
     */
    static isDeleteMarker(value: string): boolean {
        const index = value.indexOf('isDeleteMarker');
        if (index < 0) {
            return false;
        }
        // parse the value
        try {
            return Version.from(value).isDeleteMarkerVersion();
        } catch (exception) {
            // eslint-disable-line strict
            return false;
        }
    }

    /**
     * Check if a version is a delete marker.
     *
     * @return - stating if the value is a delete marker
     */
    isDeleteMarkerVersion(): boolean {
        return this.version.isDeleteMarker ?? false;
    }

    /**
     * Get the versionId of the version.
     *
     * @return - the versionId
     */
    getVersionId(): string | undefined {
        return this.version.versionId;
    }

    /**
     * Set the versionId of the version.
     *
     * @param versionId - the versionId
     * @return - the updated version
     */
    setVersionId(versionId: string) {
        this.version.versionId = versionId;
        return this;
    }

    /**
     * Mark a version as a delete marker.
     *
     * @return - the updated version
     */
    setDeleteMarker() {
        this.version.isDeleteMarker = true;
        return this;
    }

    /**
     * Mark a version as a null version.
     *
     * @return - the updated version
     */
    setNullVersion() {
        this.version.isNull = true;
        return this;
    }

    /**
     * Mark that the null version has been put with a Cloudserver handling null keys (i.e. supporting S3C-7352)
     * 
     * @return - the updated version
     */
    setNull2Version() {
        this.version.isNull2 = true;
        return this;
    }

    /**
     * Serialize the version.
     *
     * @return - the serialized version
     */
    toString(): string {
        return JSON.stringify(this.version);
    }
}

export function isMasterKey(key: string) {
    return !key.includes(VID_SEP);
}
