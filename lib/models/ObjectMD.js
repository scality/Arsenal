const constants = require('../constants');
const VersionIDUtils = require('../versioning/VersionID');

const ObjectMDLocation = require('./ObjectMDLocation');

/**
 * Class to manage metadata object for regular s3 objects (instead of
 * mpuPart metadata for example)
 */
class ObjectMD {

    /**
     * Create a new instance of ObjectMD. Parameter <tt>objMd</tt> is
     * reserved for internal use, users should call
     * {@link ObjectMD.createFromBlob()} to load from a stored
     * metadata blob and check the returned value for errors.
     *
     * @constructor
     * @param {ObjectMD|object} [objMd] - object metadata source,
     *   either an ObjectMD instance or a native JS object parsed from
     *   JSON
     */
    constructor(objMd = undefined) {
        this._initMd();
        if (objMd !== undefined) {
            if (objMd instanceof ObjectMD) {
                this._updateFromObjectMD(objMd);
            } else {
                this._updateFromParsedJSON(objMd);
            }
        } else {
            // set newly-created object md modified time to current time
            this._data['last-modified'] = new Date().toJSON();
        }
        // set latest md model version now that we ensured
        // backward-compat conversion
        this._data['md-model-version'] = constants.mdModelVersion;
    }

    /**
     * create an ObjectMD instance from stored metadata
     *
     * @param {String|Buffer} storedBlob - serialized metadata blob
     * @return {object} a result object containing either a 'result'
     *   property which value is a new ObjectMD instance on success, or
     *   an 'error' property on error
     */
    static createFromBlob(storedBlob) {
        try {
            const objMd = JSON.parse(storedBlob);
            return { result: new ObjectMD(objMd) };
        } catch (err) {
            return { error: err };
        }
    }

    getSerialized() {
        return JSON.stringify(this.getValue());
    }

    _initMd() {
        // initialize md with default values
        this._data = {
            'owner-display-name': '',
            'owner-id': '',
            'cache-control': '',
            'content-disposition': '',
            'content-encoding': '',
            'expires': '',
            'content-length': 0,
            'content-type': '',
            'content-md5': '',
            // simple/no version. will expand once object versioning is
            // introduced
            'x-amz-version-id': 'null',
            'x-amz-server-version-id': '',
            // TODO: Handle this as a utility function for all object puts
            // similar to normalizing request but after checkAuth so
            // string to sign is not impacted.  This is GH Issue#89.
            'x-amz-storage-class': 'STANDARD',
            'x-amz-server-side-encryption': '',
            'x-amz-server-side-encryption-aws-kms-key-id': '',
            'x-amz-server-side-encryption-customer-algorithm': '',
            'x-amz-website-redirect-location': '',
            'acl': {
                Canned: 'private',
                FULL_CONTROL: [],
                WRITE_ACP: [],
                READ: [],
                READ_ACP: [],
            },
            'key': '',
            'location': null,
            'isNull': '',
            'nullVersionId': '',
            'isDeleteMarker': '',
            'versionId': undefined, // If no versionId, it should be undefined
            'tags': {},
            'replicationInfo': {
                status: '',
                content: [],
                destination: '',
                storageClass: '',
                role: '',
                storageType: '',
                dataStoreVersionId: '',
            },
            'dataStoreName': '',
        };
    }

    _updateFromObjectMD(objMd) {
        // We only duplicate selected attributes here, where setters
        // allow to change inner values, and let the others as shallow
        // copies. Since performance is a concern, we want to avoid
        // the JSON.parse(JSON.stringify()) method.

        Object.assign(this._data, objMd._data);
        Object.assign(this._data.replicationInfo,
                      objMd._data.replicationInfo);
    }

    _updateFromParsedJSON(objMd) {
        // objMd is a new JS object created for the purpose, it's safe
        // to just assign its top-level properties.

        Object.assign(this._data, objMd);
        this._convertToLatestModel();
    }

    _convertToLatestModel() {
        // handle backward-compat stuff
        if (typeof(this._data.location) === 'string') {
            this.setLocation([{ key: this._data.location }]);
        }
    }

    /**
     * Set owner display name
     *
     * @param {string} displayName - Owner display name
     * @return {ObjectMD} itself
     */
    setOwnerDisplayName(displayName) {
        this._data['owner-display-name'] = displayName;
        return this;
    }

    /**
     * Returns owner display name
     *
     * @return {string} Onwer display name
     */
    getOwnerDisplayName() {
        return this._data['owner-display-name'];
    }

    /**
     * Set owner id
     *
     * @param {string} id - Owner id
     * @return {ObjectMD} itself
     */
    setOwnerId(id) {
        this._data['owner-id'] = id;
        return this;
    }

    /**
     * Returns owner id
     *
     * @return {string} owner id
     */
    getOwnerId() {
        return this._data['owner-id'];
    }

    /**
     * Set cache control
     *
     * @param {string} cacheControl - Cache control
     * @return {ObjectMD} itself
     */
    setCacheControl(cacheControl) {
        this._data['cache-control'] = cacheControl;
        return this;
    }

    /**
     * Returns cache control
     *
     * @return {string} Cache control
     */
    getCacheControl() {
        return this._data['cache-control'];
    }

    /**
     * Set content disposition
     *
     * @param {string} contentDisposition - Content disposition
     * @return {ObjectMD} itself
     */
    setContentDisposition(contentDisposition) {
        this._data['content-disposition'] = contentDisposition;
        return this;
    }

    /**
     * Returns content disposition
     *
     * @return {string} Content disposition
     */
    getContentDisposition() {
        return this._data['content-disposition'];
    }

    /**
     * Set content encoding
     *
     * @param {string} contentEncoding - Content encoding
     * @return {ObjectMD} itself
     */
    setContentEncoding(contentEncoding) {
        this._data['content-encoding'] = contentEncoding;
        return this;
    }

    /**
     * Returns content encoding
     *
     * @return {string} Content encoding
     */
    getContentEncoding() {
        return this._data['content-encoding'];
    }

    /**
     * Set expiration date
     *
     * @param {string} expires - Expiration date
     * @return {ObjectMD} itself
     */
    setExpires(expires) {
        this._data.expires = expires;
        return this;
    }

    /**
     * Returns expiration date
     *
     * @return {string} Expiration date
     */
    getExpires() {
        return this._data.expires;
    }

    /**
     * Set content length
     *
     * @param {number} contentLength - Content length
     * @return {ObjectMD} itself
     */
    setContentLength(contentLength) {
        this._data['content-length'] = contentLength;
        return this;
    }

    /**
     * Returns content length
     *
     * @return {number} Content length
     */
    getContentLength() {
        return this._data['content-length'];
    }

    /**
     * Set content type
     *
     * @param {string} contentType - Content type
     * @return {ObjectMD} itself
     */
    setContentType(contentType) {
        this._data['content-type'] = contentType;
        return this;
    }

    /**
     * Returns content type
     *
     * @return {string} Content type
     */
    getContentType() {
        return this._data['content-type'];
    }

    /**
     * Set last modified date
     *
     * @param {string} lastModified - Last modified date
     * @return {ObjectMD} itself
     */
    setLastModified(lastModified) {
        this._data['last-modified'] = lastModified;
        return this;
    }

    /**
     * Returns last modified date
     *
     * @return {string} Last modified date
     */
    getLastModified() {
        return this._data['last-modified'];
    }

    /**
     * Set content md5 hash
     *
     * @param {string} contentMd5 - Content md5 hash
     * @return {ObjectMD} itself
     */
    setContentMd5(contentMd5) {
        this._data['content-md5'] = contentMd5;
        return this;
    }

    /**
     * Returns content md5 hash
     *
     * @return {string} content md5 hash
     */
    getContentMd5() {
        return this._data['content-md5'];
    }

    /**
     * Set version id
     *
     * @param {string} versionId - Version id
     * @return {ObjectMD} itself
     */
    setAmzVersionId(versionId) {
        this._data['x-amz-version-id'] = versionId;
        return this;
    }

    /**
     * Returns version id
     *
     * @return {string} Version id
     */
    getAmzVersionId() {
        return this._data['x-amz-version-id'];
    }

    /**
     * Set server version id
     *
     * @param {string} versionId - server version id
     * @return {ObjectMD} itself
     */
    setAmzServerVersionId(versionId) {
        this._data['x-amz-server-version-id'] = versionId;
        return this;
    }

    /**
     * Returns server version id
     *
     * @return {string} server version id
     */
    getAmzServerVersionId() {
        return this._data['x-amz-server-version-id'];
    }

    /**
     * Set storage class
     *
     * @param {string} storageClass - Storage class
     * @return {ObjectMD} itself
     */
    setAmzStorageClass(storageClass) {
        this._data['x-amz-storage-class'] = storageClass;
        return this;
    }

    /**
     * Returns storage class
     *
     * @return {string} Storage class
     */
    getAmzStorageClass() {
        return this._data['x-amz-storage-class'];
    }

    /**
     * Set server side encryption
     *
     * @param {string} serverSideEncryption - Server side encryption
     * @return {ObjectMD} itself
     */
    setAmzServerSideEncryption(serverSideEncryption) {
        this._data['x-amz-server-side-encryption'] = serverSideEncryption;
        return this;
    }

    /**
     * Returns server side encryption
     *
     * @return {string} server side encryption
     */
    getAmzServerSideEncryption() {
        return this._data['x-amz-server-side-encryption'];
    }

    /**
     * Set encryption key id
     *
     * @param {string} keyId - Encryption key id
     * @return {ObjectMD} itself
     */
    setAmzEncryptionKeyId(keyId) {
        this._data['x-amz-server-side-encryption-aws-kms-key-id'] = keyId;
        return this;
    }

    /**
     * Returns encryption key id
     *
     * @return {string} Encryption key id
     */
    getAmzEncryptionKeyId() {
        return this._data['x-amz-server-side-encryption-aws-kms-key-id'];
    }

    /**
     * Set encryption customer algorithm
     *
     * @param {string} algo - Encryption customer algorithm
     * @return {ObjectMD} itself
     */
    setAmzEncryptionCustomerAlgorithm(algo) {
        this._data['x-amz-server-side-encryption-customer-algorithm'] = algo;
        return this;
    }

    /**
     * Returns Encryption customer algorithm
     *
     * @return {string} Encryption customer algorithm
     */
    getAmzEncryptionCustomerAlgorithm() {
        return this._data['x-amz-server-side-encryption-customer-algorithm'];
    }

    /**
     * Set metadata redirectLocation value
     *
     * @param {string} redirectLocation - The website redirect location
     * @return {ObjectMD} itself
     */
    setRedirectLocation(redirectLocation) {
        this._data['x-amz-website-redirect-location'] = redirectLocation;
        return this;
    }

    /**
     * Get metadata redirectLocation value
     *
     * @return {string} Website redirect location
     */
    getRedirectLocation() {
        return this._data['x-amz-website-redirect-location'];
    }

    /**
     * Set access control list
     *
     * @param {object} acl - Access control list
     * @param {string} acl.Canned -
     * @param {string[]} acl.FULL_CONTROL -
     * @param {string[]} acl.WRITE_ACP -
     * @param {string[]} acl.READ -
     * @param {string[]} acl.READ_ACP -
     * @return {ObjectMD} itself
     */
    setAcl(acl) {
        this._data.acl = acl;
        return this;
    }

    /**
     * Returns access control list
     *
     * @return {object} Access control list
     */
    getAcl() {
        return this._data.acl;
    }

    /**
     * Set object key
     *
     * @param {string} key - Object key
     * @return {ObjectMD} itself
     */
    setKey(key) {
        this._data.key = key;
        return this;
    }

    /**
     * Returns object key
     *
     * @return {string} object key
     */
    getKey() {
        return this._data.key;
    }

    /**
     * Set location
     *
     * @param {object[]} location - array of data locations (see
     *   constructor of {@link ObjectMDLocation} for a description of
     *   fields for each array object)
     * @return {ObjectMD} itself
     */
    setLocation(location) {
        if (!Array.isArray(location) || location.length === 0) {
            this._data.location = null;
        } else {
            this._data.location = location;
        }
        return this;
    }

    /**
     * Returns location
     *
     * @return {object[]} location
     */
    getLocation() {
        const { location } = this._data;
        return Array.isArray(location) ? location : [];
    }

    // Object metadata may contain multiple elements for a single part if
    // the part was originally copied from another MPU. Here we reduce the
    // locations array to a single element for each part.
    getReducedLocations() {
        const locations = this.getLocation();
        const reducedLocations = [];
        let partTotal = 0;
        for (let i = 0; i < locations.length; i++) {
            const currPart = new ObjectMDLocation(locations[i]);
            const currPartNum = currPart.getPartNumber();
            let nextPartNum = undefined;
            if (i < locations.length - 1) {
                const nextPart = new ObjectMDLocation(locations[i + 1]);
                nextPartNum = nextPart.getPartNumber();
            }
            partTotal += currPart.getPartSize();
            if (currPartNum !== nextPartNum) {
                currPart.setPartSize(partTotal);
                reducedLocations.push(currPart.getValue());
                partTotal = 0;
            }
        }
        return reducedLocations;
    }

    /**
     * Set metadata isNull value
     *
     * @param {boolean} isNull - Whether new version is null or not
     * @return {ObjectMD} itself
     */
    setIsNull(isNull) {
        this._data.isNull = isNull;
        return this;
    }

    /**
     * Get metadata isNull value
     *
     * @return {boolean} Whether new version is null or not
     */
    getIsNull() {
        return this._data.isNull;
    }

    /**
     * Set metadata nullVersionId value
     *
     * @param {string} nullVersionId - The version id of the null version
     * @return {ObjectMD} itself
     */
    setNullVersionId(nullVersionId) {
        this._data.nullVersionId = nullVersionId;
        return this;
    }

    /**
     * Get metadata nullVersionId value
     *
     * @return {string} The version id of the null version
     */
    getNullVersionId() {
        return this._data.nullVersionId;
    }

    /**
     * Set metadata isDeleteMarker value
     *
     * @param {boolean} isDeleteMarker - Whether object is a delete marker
     * @return {ObjectMD} itself
     */
    setIsDeleteMarker(isDeleteMarker) {
        this._data.isDeleteMarker = isDeleteMarker;
        return this;
    }

    /**
     * Get metadata isDeleteMarker value
     *
     * @return {boolean} Whether object is a delete marker
     */
    getIsDeleteMarker() {
        return this._data.isDeleteMarker;
    }

    /**
     * Set metadata versionId value
     *
     * @param {string} versionId - The object versionId
     * @return {ObjectMD} itself
     */
    setVersionId(versionId) {
        this._data.versionId = versionId;
        return this;
    }

    /**
     * Get metadata versionId value
     *
     * @return {string} The object versionId
     */
    getVersionId() {
        return this._data.versionId;
    }

    /**
     * Get metadata versionId value in encoded form (the one visible
     * to the S3 API user)
     *
     * @return {string} The encoded object versionId
     */
    getEncodedVersionId() {
        return VersionIDUtils.encode(this.getVersionId());
    }

    /**
     * Set tags
     *
     * @param {object} tags - tags object
     * @return {ObjectMD} itself
     */
    setTags(tags) {
        this._data.tags = tags;
        return this;
    }

    /**
     * Returns tags
     *
     * @return {object} tags object
     */
    getTags() {
        return this._data.tags;
    }

    /**
     * Set replication information
     *
     * @param {object} replicationInfo - replication information object
     * @return {ObjectMD} itself
     */
    setReplicationInfo(replicationInfo) {
        const { status, content, destination, storageClass, role,
            storageType, dataStoreVersionId } = replicationInfo;
        this._data.replicationInfo = {
            status,
            content,
            destination,
            storageClass: storageClass || '',
            role,
            storageType: storageType || '',
            dataStoreVersionId: dataStoreVersionId || '',
        };
        return this;
    }

    /**
     * Get replication information
     *
     * @return {object} replication object
     */
    getReplicationInfo() {
        return this._data.replicationInfo;
    }

    setReplicationStatus(status) {
        this._data.replicationInfo.status = status;
        return this;
    }

    setReplicationDataStoreVersionId(versionId) {
        this._data.replicationInfo.dataStoreVersionId = versionId;
        return this;
    }

    getReplicationDataStoreVersionId() {
        return this._data.replicationInfo.dataStoreVersionId;
    }

    getReplicationStatus() {
        return this._data.replicationInfo.status;
    }

    getReplicationContent() {
        return this._data.replicationInfo.content;
    }

    getReplicationRoles() {
        return this._data.replicationInfo.role;
    }

    getReplicationStorageType() {
        return this._data.replicationInfo.storageType;
    }

    getReplicationStorageClass() {
        return this._data.replicationInfo.storageClass;
    }

    getReplicationTargetBucket() {
        const destBucketArn = this._data.replicationInfo.destination;
        return destBucketArn.split(':').slice(-1)[0];
    }

    /**
     * Set dataStoreName
     *
     * @param {string} dataStoreName - name of data backend obj stored in
     * @return {ObjectMD} itself
     */
    setDataStoreName(dataStoreName) {
        this._data.dataStoreName = dataStoreName;
        return this;
    }

    /**
     * Get dataStoreName
     *
     * @return {string} name of data backend obj stored in
     */
    getDataStoreName() {
        return this._data.dataStoreName;
    }

    /**
     * Get dataStoreVersionId
     *
     * @return {string} external backend version id for data
     */
    getDataStoreVersionId() {
        const location = this.getLocation();
        if (!location[0]) {
            return undefined;
        }
        return location[0].dataStoreVersionId;
    }

    /**
     * Set custom meta headers
     *
     * @param {object} metaHeaders - Meta headers
     * @return {ObjectMD} itself
     */
    setUserMetadata(metaHeaders) {
        Object.keys(metaHeaders).forEach(key => {
            if (key.startsWith('x-amz-meta-')) {
                this._data[key] = metaHeaders[key];
            }
        });
        // If a multipart object and the acl is already parsed, we update it
        if (metaHeaders.acl) {
            this.setAcl(metaHeaders.acl);
        }
        return this;
    }

    /**
     * overrideMetadataValues (used for complete MPU and object copy)
     *
     * @param {object} headers - Headers
     * @return {ObjectMD} itself
     */
    overrideMetadataValues(headers) {
        Object.assign(this._data, headers);
        return this;
    }

    /**
     * Returns metadata object
     *
     * @return {object} metadata object
     */
    getValue() {
        return this._data;
    }
}

module.exports = ObjectMD;
