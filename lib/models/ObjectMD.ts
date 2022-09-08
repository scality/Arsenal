import * as crypto from 'crypto';
import * as constants from '../constants';
import * as VersionIDUtils from '../versioning/VersionID';
import ObjectMDLocation, {
    ObjectMDLocationData,
    Location,
} from './ObjectMDLocation';
import ObjectMDAmzRestore from './ObjectMDAmzRestore';
import ObjectMDArchive from './ObjectMDArchive';

export type ACL = {
    Canned: string;
    FULL_CONTROL: string[];
    WRITE_ACP: string[];
    READ: string[];
    READ_ACP: string[];
};

export type Backend = {
    site: string;
    status: string;
    dataStoreVersionId: string;
};

export type ReplicationInfo = {
    status: string;
    backends: Backend[];
    content: string[];
    destination: string;
    storageClass: string;
    role: string;
    storageType: string;
    dataStoreVersionId: string;
    isNFS: boolean | null;
};

export type ObjectMDData = {
    'owner-display-name': string;
    'owner-id': string;
    'cache-control': string;
    'content-disposition': string;
    'content-language': string;
    'content-encoding': string;
    'creation-time'?: string;
    'last-modified'?: string;
    expires: string;
    'content-length': number;
    'content-type': string;
    'content-md5': string;
    'x-amz-version-id': 'null' | string;
    'x-amz-server-version-id': string;
    'x-amz-restore'?: ObjectMDAmzRestore;
    archive?: ObjectMDArchive;
    'x-amz-storage-class': string;
    'x-amz-server-side-encryption': string;
    'x-amz-server-side-encryption-aws-kms-key-id': string;
    'x-amz-server-side-encryption-customer-algorithm': string;
    'x-amz-website-redirect-location': string;
    'x-amz-scal-transition-in-progress'?: boolean;
    azureInfo?: any;
    acl: ACL;
    key: string;
    location: null | Location[];
    // versionId, isNull, nullVersionId and isDeleteMarker
    // should be undefined when not set explicitly
    isNull?: boolean;
    nullVersionId?: string;
    nullUploadId?: string;
    isDeleteMarker?: boolean;
    versionId?: string;
    uploadId?: string;
    legalHold?: boolean;
    retentionMode?: string;
    retentionDate?: string;
    tags: {};
    replicationInfo: ReplicationInfo;
    dataStoreName: string;
    originOp: string;
    microVersionId?: string;
    // Deletion flag
    // Used for keeping object metadata in the oplog event
    // In case of a deletion the flag is first updated before
    // deleting the object
    deleted: boolean;
    // PHD flag indicates whether the object is a temporary placeholder.
    // This is the case when the latest version of an object gets deleted
    // the master is set as a placeholder and gets updated with the new latest
    // version data after a certain amount of time.
    isPHD: boolean;
};

/**
 * Class to manage metadata object for regular s3 objects (instead of
 * mpuPart metadata for example)
 */
export default class ObjectMD {
    _data: ObjectMDData;

    /**
     * Create a new instance of ObjectMD. Parameter <tt>objMd</tt> is
     * reserved for internal use, users should call
     * {@link ObjectMD.createFromBlob()} to load from a stored
     * metadata blob and check the returned value for errors.
     *
     * @constructor
     * @param [objMd] - object metadata source,
     *   either an ObjectMD instance or a native JS object parsed from
     *   JSON
     */
    constructor(objMd?: Object | ObjectMD) {
        this._data = this._initMd();
        if (objMd !== undefined) {
            if (objMd instanceof ObjectMD) {
                this._updateFromObjectMD(objMd);
            } else {
                this._updateFromParsedJSON(objMd);
            }
            if (!this._data['creation-time']) {
                const lastModified = this.getLastModified();
                if (lastModified) {
                    this.setCreationTime(lastModified);
                }
            }
        } else {
            // set newly-created object md modified time to current time
            const dt = new Date().toJSON();
            this.setLastModified(dt);
            this.setCreationTime(dt);
        }
        // set latest md model version now that we ensured
        // backward-compat conversion
        this._data['md-model-version'] = constants.mdModelVersion;
    }

    /**
     * create an ObjectMD instance from stored metadata
     *
     * @param storedBlob - serialized metadata blob
     * @return a result object containing either a 'result'
     *   property which value is a new ObjectMD instance on success, or
     *   an 'error' property on error
     */
    static createFromBlob(storedBlob: string | Buffer) {
        try {
            const objMd = JSON.parse(storedBlob.toString());
            return { result: new ObjectMD(objMd) };
        } catch (err) {
            return { error: err };
        }
    }

    /**
     * Returns metadata attributes for the current model
     *
     * @return object with keys of existing attributes
     * and value set to true
     */
    static getAttributes() {
        const sample = new ObjectMD();
        const attributes: { [key in keyof ObjectMDData]?: true } = {};
        Object.keys(sample.getValue()).forEach((key) => {
            attributes[key] = true;
        });
        return attributes;
    }

    getSerialized() {
        return JSON.stringify(this.getValue());
    }

    _initMd(): ObjectMDData {
        // initialize md with default values
        return {
            'owner-display-name': '',
            'owner-id': '',
            'cache-control': '',
            'content-disposition': '',
            'content-encoding': '',
            expires: '',
            'content-length': 0,
            'content-type': '',
            'content-md5': '',
            'content-language': '',
            'creation-time': undefined,
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
            'x-amz-scal-transition-in-progress': false,
            acl: {
                Canned: 'private',
                FULL_CONTROL: [],
                WRITE_ACP: [],
                READ: [],
                READ_ACP: [],
            },
            key: '',
            location: null,
            azureInfo: undefined,
            // versionId, isNull, nullVersionId and isDeleteMarker
            // should be undefined when not set explicitly
            isNull: undefined,
            nullVersionId: undefined,
            nullUploadId: undefined,
            isDeleteMarker: undefined,
            versionId: undefined,
            uploadId: undefined,
            tags: {},
            replicationInfo: {
                status: '',
                backends: [],
                content: [],
                destination: '',
                storageClass: '',
                role: '',
                storageType: '',
                dataStoreVersionId: '',
                isNFS: null,
            },
            dataStoreName: '',
            originOp: '',
            deleted: false,
            isPHD: false,
        };
    }

    _updateFromObjectMD(objMd: ObjectMD) {
        // We only duplicate selected attributes here, where setters
        // allow to change inner values, and let the others as shallow
        // copies. Since performance is a concern, we want to avoid
        // the JSON.parse(JSON.stringify()) method.

        Object.assign(this._data, objMd._data);
        Object.assign(this._data.replicationInfo, objMd._data.replicationInfo);
    }

    _updateFromParsedJSON(objMd: Object) {
        // objMd is a new JS object created for the purpose, it's safe
        // to just assign its top-level properties.

        Object.assign(this._data, objMd);
        this._convertToLatestModel();
    }

    _convertToLatestModel() {
        // handle backward-compat stuff
        if (typeof this._data.location === 'string') {
            // @ts-ignore
            this.setLocation([{ key: this._data.location }]);
        }
    }

    /**
     * Set owner display name
     *
     * @param displayName - Owner display name
     * @return itself
     */
    setOwnerDisplayName(displayName: string) {
        this._data['owner-display-name'] = displayName;
        return this;
    }

    /**
     * Returns owner display name
     *
     * @return Onwer display name
     */
    getOwnerDisplayName() {
        return this._data['owner-display-name'];
    }

    /**
     * Set owner id
     *
     * @param id - Owner id
     * @return itself
     */
    setOwnerId(id: string) {
        this._data['owner-id'] = id;
        return this;
    }

    /**
     * Returns owner id
     *
     * @return owner id
     */
    getOwnerId() {
        return this._data['owner-id'];
    }

    /**
     * Set cache control
     *
     * @param cacheControl - Cache control
     * @return itself
     */
    setCacheControl(cacheControl: string) {
        this._data['cache-control'] = cacheControl;
        return this;
    }

    /**
     * Returns cache control
     *
     * @return Cache control
     */
    getCacheControl() {
        return this._data['cache-control'];
    }

    /**
     * Set content disposition
     *
     * @param contentDisposition - Content disposition
     * @return itself
     */
    setContentDisposition(contentDisposition: string) {
        this._data['content-disposition'] = contentDisposition;
        return this;
    }

    /**
     * Returns content disposition
     *
     * @return Content disposition
     */
    getContentDisposition() {
        return this._data['content-disposition'];
    }

    /**
     * Set content encoding
     *
     * @param contentEncoding - Content encoding
     * @return itself
     */
    setContentEncoding(contentEncoding: string) {
        this._data['content-encoding'] = contentEncoding;
        return this;
    }

    /**
     * Returns content encoding
     *
     * @return Content encoding
     */
    getContentEncoding() {
        return this._data['content-encoding'];
    }

    /**
     * Set expiration date
     *
     * @param expires - Expiration date
     * @return itself
     */
    setExpires(expires: string) {
        this._data.expires = expires;
        return this;
    }

    /**
     * Returns expiration date
     *
     * @return Expiration date
     */
    getExpires() {
        return this._data.expires;
    }

    /**
     * Set content length
     *
     * @param contentLength - Content length
     * @return itself
     */
    setContentLength(contentLength: number) {
        this._data['content-length'] = contentLength;
        return this;
    }

    /**
     * Returns content length
     *
     * @return Content length
     */
    getContentLength() {
        return this._data['content-length'];
    }

    /**
     * Set content type
     *
     * @param contentType - Content type
     * @return itself
     */
    setContentType(contentType: string) {
        this._data['content-type'] = contentType;
        return this;
    }

    /**
     * Returns content type
     *
     * @return Content type
     */
    getContentType() {
        return this._data['content-type'];
    }

    /**
     * Set last modified date
     *
     * @param lastModified - Last modified date
     * @return itself
     */
    setLastModified(lastModified: string) {
        this._data['last-modified'] = lastModified;
        return this;
    }

    /**
     * Returns last modified date
     *
     * @return Last modified date
     */
    getLastModified() {
        return this._data['last-modified'];
    }

    /**
     * Set content md5 hash
     *
     * @param contentMd5 - Content md5 hash
     * @return itself
     */
    setContentMd5(contentMd5: string) {
        this._data['content-md5'] = contentMd5;
        return this;
    }

    /**
     * Returns content md5 hash
     *
     * @return content md5 hash
     */
    getContentMd5() {
        return this._data['content-md5'];
    }

    /**
     * Set content-language
     *
     * @param contentLanguage - content-language
     * @return itself
     */
    setContentLanguage(contentLanguage: string) {
        this._data['content-language'] = contentLanguage;
        return this;
    }

    /**
     * Returns content-language
     *
     * @return content-language
     */
    getContentLanguage() {
        return this._data['content-language'];
    }

    /**
     * Set Creation Date
     *
     * @param creationTime - Creation Date
     * @return itself
     */
    setCreationTime(creationTime: string) {
        this._data['creation-time'] = creationTime;
        return this;
    }

    /**
     * Returns Creation Date
     *
     * @return Creation Date
     */
    getCreationTime() {
        // If creation-time is not set fallback to LastModified
        if (!this._data['creation-time']) {
            return this.getLastModified();
        }
        return this._data['creation-time'];
    }

    /**
     * Set version id
     *
     * @param versionId - Version id
     * @return itself
     */
    setAmzVersionId(versionId: string) {
        this._data['x-amz-version-id'] = versionId;
        return this;
    }

    /**
     * Returns version id
     *
     * @return Version id
     */
    getAmzVersionId() {
        return this._data['x-amz-version-id'];
    }

    /**
     * Set server version id
     *
     * @param versionId - server version id
     * @return itself
     */
    setAmzServerVersionId(versionId: string) {
        this._data['x-amz-server-version-id'] = versionId;
        return this;
    }

    /**
     * Returns server version id
     *
     * @return server version id
     */
    getAmzServerVersionId() {
        return this._data['x-amz-server-version-id'];
    }

    /**
     * Set storage class
     *
     * @param storageClass - Storage class
     * @return itself
     */
    setAmzStorageClass(storageClass: string) {
        this._data['x-amz-storage-class'] = storageClass;
        return this;
    }

    /**
     * Returns storage class
     *
     * @return Storage class
     */
    getAmzStorageClass() {
        return this._data['x-amz-storage-class'];
    }

    /**
     * Set server side encryption
     *
     * @param serverSideEncryption - Server side encryption
     * @return itself
     */
    setAmzServerSideEncryption(serverSideEncryption: string) {
        this._data['x-amz-server-side-encryption'] = serverSideEncryption;
        return this;
    }

    /**
     * Returns server side encryption
     *
     * @return server side encryption
     */
    getAmzServerSideEncryption() {
        return this._data['x-amz-server-side-encryption'];
    }

    /**
     * Set encryption key id
     *
     * @param keyId - Encryption key id
     * @return itself
     */
    setAmzEncryptionKeyId(keyId: string) {
        this._data['x-amz-server-side-encryption-aws-kms-key-id'] = keyId;
        return this;
    }

    /**
     * Returns encryption key id
     *
     * @return Encryption key id
     */
    getAmzEncryptionKeyId() {
        return this._data['x-amz-server-side-encryption-aws-kms-key-id'];
    }

    /**
     * Set encryption customer algorithm
     *
     * @param algo - Encryption customer algorithm
     * @return itself
     */
    setAmzEncryptionCustomerAlgorithm(algo: string) {
        this._data['x-amz-server-side-encryption-customer-algorithm'] = algo;
        return this;
    }

    /**
     * Returns Encryption customer algorithm
     *
     * @return Encryption customer algorithm
     */
    getAmzEncryptionCustomerAlgorithm() {
        return this._data['x-amz-server-side-encryption-customer-algorithm'];
    }

    /**
     * Set metadata redirectLocation value
     *
     * @param redirectLocation - The website redirect location
     * @return itself
     */
    setRedirectLocation(redirectLocation: string) {
        this._data['x-amz-website-redirect-location'] = redirectLocation;
        return this;
    }

    /**
     * Get metadata redirectLocation value
     *
     * @return Website redirect location
     */
    getRedirectLocation() {
        return this._data['x-amz-website-redirect-location'];
    }

    /**
     * Set metadata transition in progress value
     *
     * @param inProgress - True if transition is in progress, false otherwise
     * @return itself
     */
    setTransitionInProgress(inProgress: boolean) {
        this._data['x-amz-scal-transition-in-progress'] = inProgress;
        return this;
    }

    /**
     * Get metadata transition in progress value
     *
     * @return True if transition is in progress, false otherwise
     */
    getTransitionInProgress() {
        return this._data['x-amz-scal-transition-in-progress'];
    }

    /**
     * Set access control list
     *
     * @param acl - Access control list
     * @param acl.Canned -
     * @param acl.FULL_CONTROL -
     * @param acl.WRITE_ACP -
     * @param acl.READ -
     * @param acl.READ_ACP -
     * @return itself
     */
    setAcl(acl: ACL) {
        this._data.acl = acl;
        return this;
    }

    /**
     * Returns access control list
     *
     * @return Access control list
     */
    getAcl() {
        return this._data.acl;
    }

    /**
     * Set object key
     *
     * @param key - Object key
     * @return itself
     */
    setKey(key: string) {
        this._data.key = key;
        return this;
    }

    /**
     * Returns object key
     *
     * @return object key
     */
    getKey() {
        return this._data.key;
    }

    /**
     * Set location
     *
     * @param location - array of data locations (see
     *   constructor of {@link ObjectMDLocation} for a description of
     *   fields for each array object)
     * @return itself
     */
    setLocation(location: Location[]) {
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
     * @return location
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
        const reducedLocations: ObjectMDLocationData[] = [];
        let partTotal = 0;
        let start: number;
        for (let i = 0; i < locations.length; i++) {
            const currPart = new ObjectMDLocation(locations[i]);
            if (i === 0) {
                start = currPart.getPartStart();
            }
            const currPartNum = currPart.getPartNumber();
            let nextPartNum: number | undefined = undefined;
            if (i < locations.length - 1) {
                const nextPart = new ObjectMDLocation(locations[i + 1]);
                nextPartNum = nextPart.getPartNumber();
            }
            partTotal += currPart.getPartSize();
            if (currPartNum !== nextPartNum) {
                currPart.setPartSize(partTotal);
                // @ts-ignore
                currPart.setPartStart(start);
                reducedLocations.push(currPart.getValue());
                // @ts-ignore
                start += partTotal;
                partTotal = 0;
            }
        }
        return reducedLocations;
    }

    /**
     * Set the Azure specific information
     * @param azureInfo - a plain JS structure representing the
     *   Azure specific information for a Blob or a Container (see constructor
     *   of {@link ObjectMDAzureInfo} for a description of the fields of this
     *   structure
     * @return itself
     */
    setAzureInfo(azureInfo: any) {
        this._data.azureInfo = azureInfo;
        return this;
    }

    /**
     * Get the Azure specific information
     * @return a plain JS structure representing the Azure specific
     *   information for a Blob or a Container an suitable for the constructor
     *   of {@link ObjectMDAzureInfo}.
     */
    getAzureInfo() {
        return this._data.azureInfo;
    }

    /**
     * Set metadata isNull value
     *
     * @param isNull - Whether new version is null or not
     * @return itself
     */
    setIsNull(isNull: boolean) {
        this._data.isNull = isNull;
        return this;
    }

    /**
     * Get metadata isNull value
     *
     * @return Whether new version is null or not
     */
    getIsNull() {
        return this._data.isNull || false;
    }

    /**
     * Set metadata nullVersionId value
     *
     * @param nullVersionId - The version id of the null version
     * @return itself
     */
    setNullVersionId(nullVersionId: string) {
        this._data.nullVersionId = nullVersionId;
        return this;
    }

    /**
     * Get metadata nullVersionId value
     *
     * @return The version id of the null version
     */
    getNullVersionId() {
        return this._data.nullVersionId;
    }

    /**
     * Set metadata nullUploadId value
     *
     * @param nullUploadId - The upload ID used to complete
     * the MPU of the null version
     * @return itself
     */
    setNullUploadId(nullUploadId: string) {
        this._data.nullUploadId = nullUploadId;
        return this;
    }

    /**
     * Get metadata nullUploadId value
     *
     * @return The object nullUploadId
     */
    getNullUploadId() {
        return this._data.nullUploadId;
    }

    /**
     * Set metadata isDeleteMarker value
     *
     * @param isDeleteMarker - Whether object is a delete marker
     * @return itself
     */
    setIsDeleteMarker(isDeleteMarker: boolean) {
        this._data.isDeleteMarker = isDeleteMarker;
        return this;
    }

    /**
     * Get metadata isDeleteMarker value
     *
     * @return Whether object is a delete marker
     */
    getIsDeleteMarker() {
        return this._data.isDeleteMarker || false;
    }

    /**
     * Get if the object is a multipart upload (MPU)
     *
     * The function checks the "content-md5" field: if it contains a
     * dash ('-') it is a MPU, as the content-md5 string ends with
     * "-[nbparts]" for MPUs.
     *
     * @return Whether object is a multipart upload
     */
    isMultipartUpload() {
        return this.getContentMd5().includes('-');
    }

    /**
     * Set metadata versionId value
     *
     * @param versionId - The object versionId
     * @return itself
     */
    setVersionId(versionId: string) {
        this._data.versionId = versionId;
        return this;
    }

    /**
     * Get metadata versionId value
     *
     * @return The object versionId
     */
    getVersionId() {
        return this._data.versionId;
    }

    /**
     * Get metadata versionId value in encoded form (the one visible
     * to the S3 API user)
     *
     * @return The encoded object versionId
     */
    getEncodedVersionId() {
        const versionId = this.getVersionId();
        if (versionId) {
            return VersionIDUtils.encode(versionId);
        }
    }

    /**
     * Set metadata uploadId value
     *
     * @param uploadId - The upload ID used to complete the MPU object
     * @return itself
     */
    setUploadId(uploadId: string) {
        this._data.uploadId = uploadId;
        return this;
    }

    /**
     * Get metadata uploadId value
     *
     * @return The object uploadId
     */
    getUploadId() {
        return this._data.uploadId;
    }

    /**
     * Set tags
     *
     * @param tags - tags object
     * @return itself
     */
    setTags(tags: any) {
        this._data.tags = tags;
        return this;
    }

    /**
     * Returns tags
     *
     * @return tags object
     */
    getTags() {
        return this._data.tags;
    }

    getUserMetadata() {
        const metaHeaders = {};
        const data = this.getValue();
        Object.keys(data).forEach(key => {
            if (key.startsWith('x-amz-meta-')) {
                metaHeaders[key] = data[key];
            }
        });
        if (Object.keys(metaHeaders).length > 0) {
            return JSON.stringify(metaHeaders);
        }
        return undefined;
    }

    /**
     * Set replication information
     *
     * @param replicationInfo - replication information object
     * @return itself
     */
    setReplicationInfo(replicationInfo: {
        status: string;
        backends: Backend[];
        content: string[];
        destination: string;
        storageClass?: string;
        role: string;
        storageType?: string;
        dataStoreVersionId?: string;
        isNFS?: boolean;
    }) {
        const {
            status,
            backends,
            content,
            destination,
            storageClass,
            role,
            storageType,
            dataStoreVersionId,
            isNFS,
        } = replicationInfo;
        this._data.replicationInfo = {
            status,
            backends,
            content,
            destination,
            storageClass: storageClass || '',
            role,
            storageType: storageType || '',
            dataStoreVersionId: dataStoreVersionId || '',
            isNFS: isNFS || null,
        };
        return this;
    }

    /**
     * Get replication information
     *
     * @return replication object
     */
    getReplicationInfo() {
        return this._data.replicationInfo;
    }

    setReplicationStatus(status: string) {
        this._data.replicationInfo.status = status;
        return this;
    }

    /**
     * Set whether the replication is occurring from an NFS bucket.
     * @param isNFS - Whether replication from an NFS bucket
     * @return itself
     */
    setReplicationIsNFS(isNFS: boolean) {
        this._data.replicationInfo.isNFS = isNFS;
        return this;
    }

    /**
     * Get whether the replication is occurring from an NFS bucket.
     * @return Whether replication from an NFS bucket
     */
    getReplicationIsNFS() {
        return this._data.replicationInfo.isNFS;
    }

    setReplicationSiteStatus(site: string, status: string) {
        const backend = this._data.replicationInfo.backends.find(
            (o) => o.site === site
        );
        if (backend) {
            backend.status = status;
        }
        return this;
    }

    getReplicationSiteStatus(site: string) {
        const backend = this._data.replicationInfo.backends.find(
            (o) => o.site === site
        );
        if (backend) {
            return backend.status;
        }
        return undefined;
    }

    setReplicationDataStoreVersionId(versionId: string) {
        this._data.replicationInfo.dataStoreVersionId = versionId;
        return this;
    }

    setReplicationSiteDataStoreVersionId(site: string, versionId: string) {
        const backend = this._data.replicationInfo.backends.find(
            (o) => o.site === site
        );
        if (backend) {
            backend.dataStoreVersionId = versionId;
        }
        return this;
    }

    getReplicationSiteDataStoreVersionId(site: string) {
        const backend = this._data.replicationInfo.backends.find(
            (o) => o.site === site
        );
        if (backend) {
            return backend.dataStoreVersionId;
        }
        return undefined;
    }

    setReplicationBackends(backends: Backend[]) {
        this._data.replicationInfo.backends = backends;
        return this;
    }

    setReplicationStorageType(storageType: string) {
        this._data.replicationInfo.storageType = storageType;
        return this;
    }

    setReplicationStorageClass(storageClass: string) {
        this._data.replicationInfo.storageClass = storageClass;
        return this;
    }

    getReplicationDataStoreVersionId() {
        return this._data.replicationInfo.dataStoreVersionId;
    }

    getReplicationStatus() {
        return this._data.replicationInfo.status;
    }

    getReplicationBackends() {
        return this._data.replicationInfo.backends;
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
     * @param dataStoreName - name of data backend obj stored in
     * @return itself
     */
    setDataStoreName(dataStoreName: string) {
        this._data.dataStoreName = dataStoreName;
        return this;
    }

    /**
     * Get dataStoreName
     *
     * @return name of data backend obj stored in
     */
    getDataStoreName() {
        return this._data.dataStoreName;
    }

    /**
     * Get dataStoreVersionId
     *
     * @return external backend version id for data
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
     * @param metaHeaders - Meta headers
     * @return itself
     */
    setUserMetadata(metaHeaders: any) {
        Object.keys(metaHeaders).forEach((key) => {
            if (key.startsWith('x-amz-meta-')) {
                this._data[key] = metaHeaders[key];
            } else if (key.startsWith('x-ms-meta-')) {
                const _key = key.replace('x-ms-meta-', 'x-amz-meta-');
                this._data[_key] = metaHeaders[key];
            }
        });
        // If a multipart object and the acl is already parsed, we update it
        if (metaHeaders.acl) {
            this.setAcl(metaHeaders.acl);
        }
        return this;
    }

    /**
     * Clear all existing meta headers (used for Azure)
     *
     * @return itself
     */
    clearMetadataValues() {
        Object.keys(this._data).forEach(key => {
            if (key.startsWith('x-amz-meta')) {
                delete this._data[key];
            }
        });
        return this;
    }

    /**
     * overrideMetadataValues (used for complete MPU and object copy)
     *
     * @param headers - Headers
     * @return itself
     */
    overrideMetadataValues(headers: any) {
        Object.assign(this._data, headers);
        return this;
    }

    /**
     * Create or update the microVersionId field
     *
     * This field can be used to force an update in MongoDB. This can
     * be needed in the following cases:
     *
     * - in case no other metadata field changes
     *
     * - to detect a change when fields change but object version does
     *   not change e.g. when ingesting a putObjectTagging coming from
     *   S3C to Zenko
     *
     * - to manage conflicts during concurrent updates, using
     *   conditions on the microVersionId field.
     *
     * It's a field of 16 hexadecimal characters randomly generated
     *
     * @return itself
     */
    updateMicroVersionId() {
        this._data.microVersionId = crypto.randomBytes(8).toString('hex');
    }

    /**
     * Get the microVersionId field, or null if not set
     *
     * @return the microVersionId field if exists, or {null} if it does not exist
     */
    getMicroVersionId() {
        return this._data.microVersionId || null;
    }

    /**
     * Set object legal hold status
     * @param legalHold - true if legal hold is 'ON' false if 'OFF'
     * @return itself
     */
    setLegalHold(legalHold: boolean) {
        this._data.legalHold = legalHold || false;
        return this;
    }

    /**
     * Get object legal hold status
     * @return legal hold status
     */
    getLegalHold() {
        return this._data.legalHold || false;
    }

    /**
     * Set object retention mode
     * @param mode - should be one of 'GOVERNANCE', 'COMPLIANCE'
     * @return itself
     */
    setRetentionMode(mode: string) {
        this._data.retentionMode = mode;
        return this;
    }

    /**
     * Set object retention retain until date
     * @param date - date in ISO-8601 format
     * @return itself
     */
    setRetentionDate(date: string) {
        this._data.retentionDate = date;
        return this;
    }

    /**
     * Returns object retention mode
     * @return retention mode string
     */
    getRetentionMode() {
        return this._data.retentionMode;
    }

    /**
     * Returns object retention retain until date
     * @return retention date string
     */
    getRetentionDate() {
        return this._data.retentionDate;
    }

    /**
     * Set origin operation for object
     * @param op - name of origin operation
     * @return itself
     */
    setOriginOp(op: string) {
        this._data.originOp = op;
        return this;
    }

    /**
     * Returns origin operation of object
     * @return origin operation string
     */
    getOriginOp() {
        return this._data.originOp;
    }

    /**
     * Returns metadata object
     *
     * @return metadata object
     */
    getValue() {
        return this._data;
    }

    /**
     * Get x-amz-restore
     *
     * @returns x-amz-restore
     */
    getAmzRestore() {
        return this._data['x-amz-restore'];
    }

    /**
     * Set x-amz-restore
     *
     * @param value x-amz-restore object
     * @returns itself
     * @throws case of invalid parameter
     */
    setAmzRestore(value?: ObjectMDAmzRestore) {
        if (value) {
            // Accept object instance of ObjectMDAmzRestore and Object
            if (!(value instanceof ObjectMDAmzRestore) && !ObjectMDAmzRestore.isValid(value)) {
                throw new Error('x-amz-restore must be type of ObjectMDAmzRestore.');
            }
            this._data['x-amz-restore'] = value;
        } else {
            delete this._data['x-amz-restore'];
        }
        return this;
    }

    /**
     * Get archive
     *
     * @returns archive
     */
    getArchive() {
        return this._data.archive;
    }

    /**
     * Set archive
     *
     * @param value archive object
     * @returns itself
     * @throws case of invalid parameter
     */
    setArchive(value: ObjectMDArchive) {
        if (value) {
            // Accept object instance of ObjectMDArchive and Object
            if (!(value instanceof ObjectMDArchive) && !ObjectMDArchive.isValid(value)) {
                throw new Error('archive is must be type of ObjectMDArchive.');
            }
            this._data.archive = value;
        } else {
            delete this._data.archive;
        }
        return this;
    }

    /**
    * Set deleted flag
    * @param {Boolean} value deleted object
    * @return {ObjectMD}
    */
    setDeleted(value) {
        this._data.deleted = value;
        return this;
    }

    /**
    * Get deleted flag
    * @return {Boolean}
    */
    getDeleted() {
        return this._data.deleted;
    }

    /**
    * Set isPHD flag
    * @param {Boolean} value isPHD value
    * @return {ObjectMD}
    */
    setIsPHD(value) {
        this._data.isPHD = value;
        return this;
    }

    /**
    * Get isPHD flag
    * @return {Boolean}
    */
    getIsPHD() {
        return this._data.isPHD;
    }
}
