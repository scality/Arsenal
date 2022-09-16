export type Ciphered = { cryptoScheme: number; cipheredDataKey: string };
export type BaseLocation = { key: string; dataStoreName: string };
export type Location = BaseLocation & {
    start: number;
    size: number;
    dataStoreETag: string;
    dataStoreVersionId: string;
    blockId?: string;
};
export type ObjectMDLocationData = {
    key: string;
    start: number;
    size: number;
    dataStoreName: string;
    dataStoreETag: string;
    dataStoreVersionId: string;
    blockId?: string;
    cryptoScheme?: number;
    cipheredDataKey?: string;
};
/**
 * Helper class to ease access to a single data location in metadata
 * 'location' array
 */
export default class ObjectMDLocation {
    _data: ObjectMDLocationData;
    /**
     * @constructor
     * @param locationObj - single data location info
     * @param locationObj.key - data backend key
     * @param locationObj.start - index of first data byte of
     *   this part in the full object
     * @param locationObj.size - byte length of data part
     * @param locationObj.dataStoreName - type of data store
     * @param locationObj.dataStoreETag - internal ETag of
     *   data part
     * @param [locationObj.dataStoreVersionId] - versionId,
     *   needed for cloud backends
     * @param [location.cryptoScheme] - if location data is
     * encrypted: the encryption scheme version
     * @param [location.cipheredDataKey] - if location data
     * is encrypted: the base64-encoded ciphered data key
     * @param [locationObj.blockId] - blockId of the part,
     *   set by the Azure Blob Service REST API frontend
     */
    constructor(locationObj: Location | (Location & Ciphered)) {
        this._data = {
            key: locationObj.key,
            start: locationObj.start,
            size: locationObj.size,
            dataStoreName: locationObj.dataStoreName,
            dataStoreETag: locationObj.dataStoreETag,
            dataStoreVersionId: locationObj.dataStoreVersionId,
            blockId: locationObj.blockId,
        };
        if ('cryptoScheme' in locationObj) {
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
     * @param location - single data location info
     * @param location.key - data backend key
     * @param location.dataStoreName - type of data store
     * @param [location.dataStoreVersionId] - data backend version ID
     * @param [location.cryptoScheme] - if location data is
     * encrypted: the encryption scheme version
     * @param [location.cipheredDataKey] - if location data
     * is encrypted: the base64-encoded ciphered data key
     * @return return this
     */
    setDataLocation(location: BaseLocation | (BaseLocation & Ciphered)) {
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

    setPartStart(start: number) {
        this._data.start = start;
        return this;
    }

    getPartSize() {
        return this._data.size;
    }

    setPartSize(size: number) {
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

    setBlockId(blockId: string) {
        this._data.blockId = blockId;
        return this;
    }

    getValue() {
        return this._data;
    }
}
