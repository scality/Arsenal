/**
 * Helper class to ease access to a single data location in metadata
 * 'location' array
 */
class ObjectMDLocation {

    /**
     * @constructor
     * @param {object} locationObj - single data location info
     * @param {string} locationObj.key - data backend key
     * @param {number} locationObj.start - index of first data byte of
     *   this part in the full object
     * @param {number} locationObj.size - byte length of data part
     * @param {string} locationObj.dataStoreName - type of data store
     * @param {string} locationObj.dataStoreETag - internal ETag of
     *   data part
     * @param {string} [locationObj.dataStoreVersionId] - versionId,
     *   needed for cloud backends
     * @param {number} [location.cryptoScheme] - if location data is
     * encrypted: the encryption scheme version
     * @param {string} [location.cipheredDataKey] - if location data
     * is encrypted: the base64-encoded ciphered data key
     * @param {string} [locationObj.blockId] - blockId of the part,
     *   set by the Azure Blob Service REST API frontend
     */
    constructor(locationObj) {
        this._data = {
            key: locationObj.key,
            start: locationObj.start,
            size: locationObj.size,
            dataStoreName: locationObj.dataStoreName,
            dataStoreETag: locationObj.dataStoreETag,
            dataStoreVersionId: locationObj.dataStoreVersionId,
            blockId: locationObj.blockId,
        };
        if (locationObj.cryptoScheme) {
            this._data.cryptoScheme = locationObj.cryptoScheme;
            this._data.cipheredDataKey = locationObj.cipheredDataKey;
        }
    }

    getKey() {
        return this._data.key;
    }

    getDataStoreName() {
        return this._data.dataStoreName;
    }

    /**
     * Update data location with new info
     *
     * @param {object} location - single data location info
     * @param {string} location.key - data backend key
     * @param {string} location.dataStoreName - type of data store
     * @param {string} [location.dataStoreVersionId] - data backend version ID
     * @param {number} [location.cryptoScheme] - if location data is
     * encrypted: the encryption scheme version
     * @param {string} [location.cipheredDataKey] - if location data
     * is encrypted: the base64-encoded ciphered data key
     * @return {ObjectMDLocation} return this
     */
    setDataLocation(location) {
        [
            'key',
            'dataStoreName',
            'dataStoreVersionId',
            'cryptoScheme',
            'cipheredDataKey',
        ].forEach(attrName => {
            if (location[attrName] !== undefined) {
                this._data[attrName] = location[attrName];
            } else {
                delete this._data[attrName];
            }
        });
        return this;
    }

    getDataStoreETag() {
        return this._data.dataStoreETag;
    }

    getDataStoreVersionId() {
        return this._data.dataStoreVersionId;
    }

    getPartNumber() {
        return Number.parseInt(this._data.dataStoreETag.split(':')[0], 10);
    }

    getPartETag() {
        return this._data.dataStoreETag.split(':')[1];
    }

    getPartStart() {
        return this._data.start;
    }

    getPartSize() {
        return this._data.size;
    }

    setPartSize(size) {
        this._data.size = size;
        return this;
    }

    getCryptoScheme() {
        return this._data.cryptoScheme;
    }

    getCipheredDataKey() {
        return this._data.cipheredDataKey;
    }

    getBlockId() {
        return this._data.blockId;
    }

    setBlockId(blockId) {
        this._data.blockId = blockId;
        return this;
    }

    getValue() {
        return this._data;
    }
}

module.exports = ObjectMDLocation;
