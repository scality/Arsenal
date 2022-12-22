import assert from 'assert';
import uuid from 'uuid/v4';

import { WebsiteConfiguration } from './WebsiteConfiguration';
import ReplicationConfiguration from './ReplicationConfiguration';
import LifecycleConfiguration from './LifecycleConfiguration';
import ObjectLockConfiguration from './ObjectLockConfiguration';
import BucketPolicy from './BucketPolicy';
import NotificationConfiguration from './NotificationConfiguration';
import { ACL as OACL } from './ObjectMD';
import { areTagsValid, BucketTag } from '../s3middleware/tagging';

// WHEN UPDATING THIS NUMBER, UPDATE BucketInfoModelVersion.md CHANGELOG
// BucketInfoModelVersion.md can be found in documentation/ at the root
// of this repository
const modelVersion = 14;

export type CORS = {
    id: string;
    allowedMethods: string[];
    allowedOrigins: string[];
    allowedHeaders: string[];
    maxAgeSeconds: number;
    exposeHeaders: string[];
}[];

export type SSE = {
    cryptoScheme: number;
    algorithm: string;
    masterKeyId: string;
    configuredMasterKeyId: string;
    mandatory: boolean;
};

export type VersioningConfiguration = {
    Status: string;
    MfaDelete: any;
};

export type DataReport = {
    enabled: boolean,
    CapacityInfo?: {
        Capacity: number,
        Available: number,
        Used: number,
    },
};

export type ACL = OACL & { WRITE: string[] }

export default class BucketInfo {
    _acl: ACL;
    _name: string;
    _owner: string;
    _ownerDisplayName: string;
    _creationDate: string;
    _mdBucketModelVersion: number;
    _transient: boolean;
    _deleted: boolean;
    _serverSideEncryption: SSE;
    _versioningConfiguration: VersioningConfiguration;
    _locationConstraint: string | null;
    _websiteConfiguration?: WebsiteConfiguration | null;
    _cors: CORS | null;
    _replicationConfiguration?: any;
    _lifecycleConfiguration?: any;
    _bucketPolicy?: any;
    _uid?: string;
    _objectLockEnabled?: boolean;
    _objectLockConfiguration?: any;
    _notificationConfiguration?: any;
    _tags?: Array<BucketTag>;
    _readLocationConstraint: string | null;
    _isNFS: boolean | null;
    _azureInfo: any | null;
    _ingestion: { status: 'enabled' | 'disabled' } | null;
    _dataReport: DataReport | null;

    /**
    * Represents all bucket information.
    * @constructor
    * @param name - bucket name
    * @param owner - bucket owner's name
    * @param ownerDisplayName - owner's display name
    * @param creationDate - creation date of bucket
    * @param mdBucketModelVersion - bucket model version
    * @param [acl] - bucket ACLs (no need to copy
    * ACL object since referenced object will not be used outside of
    * BucketInfo instance)
    * @param transient - flag indicating whether bucket is transient
    * @param deleted - flag indicating whether attempt to delete
    * @param serverSideEncryption - sse information for this bucket
    * @param serverSideEncryption.cryptoScheme -
    * cryptoScheme used
    * @param serverSideEncryption.algorithm -
    * algorithm to use
    * @param serverSideEncryption.masterKeyId -
    * key to get master key
    * @param serverSideEncryption.configuredMasterKeyId -
    * custom KMS key id specified by user
    * @param serverSideEncryption.mandatory -
    * true for mandatory encryption
    * bucket has been made
    * @param versioningConfiguration - versioning configuration
    * @param versioningConfiguration.Status - versioning status
    * @param versioningConfiguration.MfaDelete - versioning mfa delete
    * @param locationConstraint - locationConstraint for bucket that
    * also includes the ingestion flag
    * @param [websiteConfiguration] - website
    * configuration
    * @param [cors] - collection of CORS rules to apply
    * @param [cors[].id] - optional ID to identify rule
    * @param cors[].allowedMethods - methods allowed for CORS request
    * @param cors[].allowedOrigins - origins allowed for CORS request
    * @param [cors[].allowedHeaders] - headers allowed in an OPTIONS
    * request via the Access-Control-Request-Headers header
    * @param [cors[].maxAgeSeconds] - seconds browsers should cache
    * OPTIONS response
    * @param [cors[].exposeHeaders] - headers expose to applications
    * @param [replicationConfiguration] - replication configuration
    * @param [lifecycleConfiguration] - lifecycle configuration
    * @param [bucketPolicy] - bucket policy
    * @param [uid] - unique identifier for the bucket, necessary
    * @param readLocationConstraint - readLocationConstraint for bucket
    * addition for use with lifecycle operations
    * @param [isNFS] - whether the bucket is on NFS
    * @param [ingestionConfig] - object for ingestion status: en/dis
    * @param [azureInfo] - Azure storage account specific info
    * @param [objectLockEnabled] - true when object lock enabled
    * @param [objectLockConfiguration] - object lock configuration
    * @param [notificationConfiguration] - bucket notification configuration
    * @param [tags] - bucket tag set
    * @param [dataReport] - dataReport for the bucket
    */
    constructor(
        name: string,
        owner: string,
        ownerDisplayName: string,
        creationDate: string,
        mdBucketModelVersion: number,
        acl: ACL | undefined,
        transient: boolean,
        deleted: boolean,
        serverSideEncryption: SSE,
        versioningConfiguration: VersioningConfiguration,
        locationConstraint: string,
        websiteConfiguration?: WebsiteConfiguration | null,
        cors?: CORS,
        replicationConfiguration?: any,
        lifecycleConfiguration?: any,
        bucketPolicy?: any,
        uid?: string,
        readLocationConstraint?: string,
        isNFS?: boolean,
        ingestionConfig?: { status: 'enabled' | 'disabled' },
        azureInfo?: any,
        objectLockEnabled?: boolean,
        objectLockConfiguration?: any,
        notificationConfiguration?: any,
        tags?: Array<BucketTag> | [],
        dataReport?: DataReport,
    ) {
        assert.strictEqual(typeof name, 'string');
        assert.strictEqual(typeof owner, 'string');
        assert.strictEqual(typeof ownerDisplayName, 'string');
        assert.strictEqual(typeof creationDate, 'string');
        if (mdBucketModelVersion) {
            assert.strictEqual(typeof mdBucketModelVersion, 'number');
        }
        if (acl) {
            assert.strictEqual(typeof acl, 'object');
            assert(Array.isArray(acl.FULL_CONTROL));
            assert(Array.isArray(acl.WRITE));
            assert(Array.isArray(acl.WRITE_ACP));
            assert(Array.isArray(acl.READ));
            assert(Array.isArray(acl.READ_ACP));
        }
        if (serverSideEncryption) {
            assert.strictEqual(typeof serverSideEncryption, 'object');
            const { cryptoScheme, algorithm, masterKeyId,
                configuredMasterKeyId, mandatory } = serverSideEncryption;
            assert.strictEqual(typeof cryptoScheme, 'number');
            assert.strictEqual(typeof algorithm, 'string');
            assert.strictEqual(typeof masterKeyId, 'string');
            assert.strictEqual(typeof mandatory, 'boolean');
            if (configuredMasterKeyId !== undefined) {
                assert.strictEqual(typeof configuredMasterKeyId, 'string');
            }
        }
        if (versioningConfiguration) {
            assert.strictEqual(typeof versioningConfiguration, 'object');
            const { Status, MfaDelete } = versioningConfiguration;
            assert(Status === undefined ||
                Status === 'Enabled' ||
                Status === 'Suspended');
            assert(MfaDelete === undefined ||
                MfaDelete === 'Enabled' ||
                MfaDelete === 'Disabled');
        }
        if (locationConstraint) {
            assert.strictEqual(typeof locationConstraint, 'string');
        }
        if (ingestionConfig) {
            assert.strictEqual(typeof ingestionConfig, 'object');
        }
        if (azureInfo) {
            assert.strictEqual(typeof azureInfo, 'object');
        }
        if (readLocationConstraint) {
            assert.strictEqual(typeof readLocationConstraint, 'string');
        }
        if (websiteConfiguration) {
            assert(websiteConfiguration instanceof WebsiteConfiguration);
            const indexDocument = websiteConfiguration.getIndexDocument();
            const errorDocument = websiteConfiguration.getErrorDocument();
            const redirectAllRequestsTo = websiteConfiguration.getRedirectAllRequestsTo();
            const routingRules = websiteConfiguration.getRoutingRules();
            assert(indexDocument === undefined ||
                typeof indexDocument === 'string');
            assert(errorDocument === undefined ||
                typeof errorDocument === 'string');
            assert(redirectAllRequestsTo === undefined ||
                typeof redirectAllRequestsTo === 'object');
            assert(routingRules === undefined ||
                Array.isArray(routingRules));
        }
        if (cors) {
            assert(Array.isArray(cors));
        }
        if (replicationConfiguration) {
            ReplicationConfiguration.validateConfig(replicationConfiguration);
        }
        if (lifecycleConfiguration) {
            LifecycleConfiguration.validateConfig(lifecycleConfiguration);
        }
        if (bucketPolicy) {
            BucketPolicy.validatePolicy(bucketPolicy);
        }
        if (uid) {
            assert.strictEqual(typeof uid, 'string');
            assert.strictEqual(uid.length, 36);
        }
        if (objectLockConfiguration) {
            ObjectLockConfiguration.validateConfig(objectLockConfiguration);
        }
        if (notificationConfiguration) {
            NotificationConfiguration.validateConfig(notificationConfiguration);
        }
        const aclInstance: ACL = acl || {
            Canned: 'private',
            FULL_CONTROL: [],
            WRITE: [],
            WRITE_ACP: [],
            READ: [],
            READ_ACP: [],
        };

        if (tags === undefined) {
            tags = [] as BucketTag[];
        }
        assert.strictEqual(areTagsValid(tags), true);

        // IF UPDATING PROPERTIES, INCREMENT MODELVERSION NUMBER ABOVE
        this._acl = aclInstance;
        this._name = name;
        this._owner = owner;
        this._ownerDisplayName = ownerDisplayName;
        this._creationDate = creationDate;
        this._mdBucketModelVersion = mdBucketModelVersion || 0;
        this._transient = transient || false;
        this._deleted = deleted || false;
        this._serverSideEncryption = serverSideEncryption || null;
        this._versioningConfiguration = versioningConfiguration || null;
        this._locationConstraint = locationConstraint || null;
        this._readLocationConstraint = readLocationConstraint || null;
        this._websiteConfiguration = websiteConfiguration || null;
        this._replicationConfiguration = replicationConfiguration || null;
        this._cors = cors || null;
        this._lifecycleConfiguration = lifecycleConfiguration || null;
        this._bucketPolicy = bucketPolicy || null;
        this._uid = uid || uuid();
        this._isNFS = isNFS || null;
        this._ingestion = ingestionConfig || null;
        this._azureInfo = azureInfo || null;
        this._objectLockEnabled = objectLockEnabled || false;
        this._objectLockConfiguration = objectLockConfiguration || null;
        this._notificationConfiguration = notificationConfiguration || null;
        this._tags = tags;
        this._dataReport = dataReport || null;
        return this;
    }

    /**
    * Serialize the object
    * @return - stringified object
    */
    serialize() {
        const bucketInfos = {
            acl: this._acl,
            name: this._name,
            owner: this._owner,
            ownerDisplayName: this._ownerDisplayName,
            creationDate: this._creationDate,
            mdBucketModelVersion: this._mdBucketModelVersion,
            transient: this._transient,
            deleted: this._deleted,
            serverSideEncryption: this._serverSideEncryption,
            versioningConfiguration: this._versioningConfiguration,
            locationConstraint: this._locationConstraint,
            readLocationConstraint: this._readLocationConstraint,
            websiteConfiguration: undefined,
            cors: this._cors,
            replicationConfiguration: this._replicationConfiguration,
            lifecycleConfiguration: this._lifecycleConfiguration,
            bucketPolicy: this._bucketPolicy,
            uid: this._uid,
            isNFS: this._isNFS,
            ingestion: this._ingestion,
            azureInfo: this._azureInfo,
            objectLockEnabled: this._objectLockEnabled,
            objectLockConfiguration: this._objectLockConfiguration,
            notificationConfiguration: this._notificationConfiguration,
            tags: this._tags,
            dataReport: this._dataReport,
        };
        const final = this._websiteConfiguration
            ? {
                  ...bucketInfos,
                  websiteConfiguration: this._websiteConfiguration.getConfig(),
              }
            : bucketInfos;
        return JSON.stringify(final);
    }
    /**
     * deSerialize the JSON string
     * @param stringBucket - the stringified bucket
     * @return - parsed string
     */
    static deSerialize(stringBucket: string) {
        const obj = JSON.parse(stringBucket);
        const websiteConfig = obj.websiteConfiguration ?
            new WebsiteConfiguration(obj.websiteConfiguration) : null;
        return new BucketInfo(obj.name, obj.owner, obj.ownerDisplayName,
            obj.creationDate, obj.mdBucketModelVersion, obj.acl,
            obj.transient, obj.deleted, obj.serverSideEncryption,
            obj.versioningConfiguration, obj.locationConstraint, websiteConfig,
            obj.cors, obj.replicationConfiguration, obj.lifecycleConfiguration,
            obj.bucketPolicy, obj.uid, obj.readLocationConstraint, obj.isNFS,
            obj.ingestion, obj.azureInfo, obj.objectLockEnabled,
            obj.objectLockConfiguration, obj.notificationConfiguration, obj.tags,
            obj.dataReport);
    }

    /**
     * Returns the current model version for the data structure
     * @return - the current model version set above in the file
     */
    static currentModelVersion() {
        return modelVersion;
    }

    /**
     * Create a BucketInfo from an object
     *
     * @param data - object containing data
     * @return Return an BucketInfo
     */
    static fromObj(data: any) {
        return new BucketInfo(data._name, data._owner, data._ownerDisplayName,
            data._creationDate, data._mdBucketModelVersion, data._acl,
            data._transient, data._deleted, data._serverSideEncryption,
            data._versioningConfiguration, data._locationConstraint,
            data._websiteConfiguration, data._cors,
            data._replicationConfiguration, data._lifecycleConfiguration,
            data._bucketPolicy, data._uid, data._readLocationConstraint,
            data._isNFS, data._ingestion, data._azureInfo,
            data._objectLockEnabled, data._objectLockConfiguration,
            data._notificationConfiguration, data._tags, data._dataReport);
    }

    /**
    * Get the ACLs.
    * @return acl
    */
    getAcl() {
        return this._acl;
    }
    /**
    * Set the canned acl's.
    * @param cannedACL - canned ACL being set
    * @return - bucket info instance
    */
    setCannedAcl(cannedACL: string) {
        this._acl.Canned = cannedACL;
        return this;
    }
    /**
    * Set a specific ACL.
    * @param canonicalID - id for account being given access
    * @param typeOfGrant - type of grant being granted
    * @return - bucket info instance
    */
    setSpecificAcl(canonicalID: string, typeOfGrant: string) {
        this._acl[typeOfGrant].push(canonicalID);
        return this;
    }
    /**
    * Set all ACLs.
    * @param acl - new set of ACLs
    * @return - bucket info instance
    */
    setFullAcl(acl: ACL) {
        this._acl = acl;
        return this;
    }
    /**
     * Get the server side encryption information
     * @return serverSideEncryption
     */
    getServerSideEncryption() {
        return this._serverSideEncryption;
    }
    /**
     * Set server side encryption information
     * @param serverSideEncryption - server side encryption information
     * @return - bucket info instance
     */
    setServerSideEncryption(serverSideEncryption: SSE) {
        this._serverSideEncryption = serverSideEncryption;
        return this;
    }
    /**
     * Get the versioning configuration information
     * @return versioningConfiguration
     */
    getVersioningConfiguration() {
        return this._versioningConfiguration;
    }
    /**
     * Set versioning configuration information
     * @param versioningConfiguration - versioning information
     * @return - bucket info instance
     */
    setVersioningConfiguration(versioningConfiguration: VersioningConfiguration) {
        this._versioningConfiguration = versioningConfiguration;
        return this;
    }
    /**
     * Check that versioning is 'Enabled' on the given bucket.
     * @return - `true` if versioning is 'Enabled', otherwise `false`
     */
    isVersioningEnabled() {
        const versioningConfig = this.getVersioningConfiguration();
        return versioningConfig ? versioningConfig.Status === 'Enabled' : false;
    }
    /**
     * Get the website configuration information
     * @return websiteConfiguration
     */
    getWebsiteConfiguration() {
        return this._websiteConfiguration;
    }
    /**
     * Set website configuration information
     * @param websiteConfiguration - configuration for bucket website
     * @return - bucket info instance
     */
    setWebsiteConfiguration(websiteConfiguration: WebsiteConfiguration) {
        this._websiteConfiguration = websiteConfiguration;
        return this;
    }
    /**
     * Set replication configuration information
     * @param replicationConfiguration - replication information
     * @return - bucket info instance
     */
    setReplicationConfiguration(replicationConfiguration: any) {
        this._replicationConfiguration = replicationConfiguration;
        return this;
    }
    /**
     * Get replication configuration information
     * @return replication configuration information or `null` if
     * the bucket does not have a replication configuration
     */
    getReplicationConfiguration() {
        return this._replicationConfiguration;
    }
    /**
     * Get lifecycle configuration information
     * @return lifecycle configuration information or `null` if
     * the bucket does not have a lifecycle configuration
     */
    getLifecycleConfiguration() {
        return this._lifecycleConfiguration;
    }
    /**
     * Set lifecycle configuration information
     * @param lifecycleConfiguration - lifecycle information
     * @return - bucket info instance
     */
    setLifecycleConfiguration(lifecycleConfiguration: any) {
        this._lifecycleConfiguration = lifecycleConfiguration;
        return this;
    }
    /**
     * Get bucket policy statement
     * @return bucket policy statement or `null` if the bucket
     * does not have a bucket policy
     */
    getBucketPolicy() {
        return this._bucketPolicy;
    }
    /**
     * Set bucket policy statement
     * @param bucketPolicy - bucket policy
     * @return - bucket info instance
     */
    setBucketPolicy(bucketPolicy: any) {
        this._bucketPolicy = bucketPolicy;
        return this;
    }
    /**
     * Get object lock configuration
     * @return object lock configuration information or `null` if
     * the bucket does not have an object lock configuration
     */
    getObjectLockConfiguration() {
        return this._objectLockConfiguration;
    }
    /**
     * Set object lock configuration
     * @param objectLockConfiguration - object lock information
     * @return - bucket info instance
     */
    setObjectLockConfiguration(objectLockConfiguration: any) {
        this._objectLockConfiguration = objectLockConfiguration;
        return this;
    }
    /**
     * Get notification configuration
     * @return notification configuration information or 'null' if
     * the bucket does not have a notification configuration
     */
    getNotificationConfiguration() {
        return this._notificationConfiguration;
    }
    /**
     * Set notification configuraiton
     * @param notificationConfiguration - bucket notification information
     * @return - bucket info instance
     */
    setNotificationConfiguration(notificationConfiguration: any) {
        this._notificationConfiguration = notificationConfiguration;
        return this;
    }
    /**
     * Get cors resource
     * @return cors
     */
    getCors() {
        return this._cors;
    }
    /**
     * Set cors resource
     * @param rules - collection of CORS rules
     * @param  [rules.id] - optional id to identify rule
     * @param rules[].allowedMethods - methods allowed for CORS
     * @param rules[].allowedOrigins - origins allowed for CORS
     * @param [rules[].allowedHeaders] - headers allowed in an
     * OPTIONS request via the Access-Control-Request-Headers header
     * @param [rules[].maxAgeSeconds] - seconds browsers should cache
     * OPTIONS response
     * @param [rules[].exposeHeaders] - headers to expose to external
     * applications
     * @return - bucket info instance
     */
    setCors(rules: CORS) {
        this._cors = rules;
        return this;
    }
    /**
     * get the serverside encryption algorithm
     * @return - sse algorithm used by this bucket
     */
    getSseAlgorithm() {
        if (!this._serverSideEncryption) {
            return null;
        }
        return this._serverSideEncryption.algorithm;
    }
    /**
     * get the server side encryption master key Id
     * @return -  sse master key Id used by this bucket
     */
    getSseMasterKeyId() {
        if (!this._serverSideEncryption) {
            return null;
        }
        return this._serverSideEncryption.masterKeyId;
    }
    /**
    * Get bucket name.
    * @return - bucket name
    */
    getName() {
        return this._name;
    }
    /**
    * Set bucket name.
    * @param bucketName - new bucket name
    * @return - bucket info instance
    */
    setName(bucketName: string) {
        this._name = bucketName;
        return this;
    }
    /**
    * Get bucket owner.
    * @return - bucket owner's canonicalID
    */
    getOwner() {
        return this._owner;
    }
    /**
    * Set bucket owner.
    * @param ownerCanonicalID - bucket owner canonicalID
    * @return - bucket info instance
    */
    setOwner(ownerCanonicalID: string) {
        this._owner = ownerCanonicalID;
        return this;
    }
    /**
    * Get bucket owner display name.
    * @return - bucket owner dispaly name
    */
    getOwnerDisplayName() {
        return this._ownerDisplayName;
    }
    /**
    * Set bucket owner display name.
    * @param ownerDisplayName - bucket owner display name
    * @return - bucket info instance
    */
    setOwnerDisplayName(ownerDisplayName: string) {
        this._ownerDisplayName = ownerDisplayName;
        return this;
    }
    /**
    * Get bucket creation date.
    * @return - bucket creation date
    */
    getCreationDate() {
        return this._creationDate;
    }
    /**
    * Set location constraint.
    * @param location - bucket location constraint
    * @return - bucket info instance
    */
    setLocationConstraint(location: string) {
        this._locationConstraint = location;
        return this;
    }

    /**
    * Get location constraint.
    * @return - bucket location constraint
    */
    getLocationConstraint() {
        return this._locationConstraint;
    }

    /**
    * Get read location constraint.
    * @return - bucket read location constraint
    */
    getReadLocationConstraint() {
        if (this._readLocationConstraint) {
            return this._readLocationConstraint;
        }
        return this._locationConstraint;
    }

    /**
     * Set Bucket model version
     *
     * @param version - Model version
     * @return - bucket info instance
     */
    setMdBucketModelVersion(version: number) {
        this._mdBucketModelVersion = version;
        return this;
    }
    /**
     * Get Bucket model version
     *
     * @return Bucket model version
     */
    getMdBucketModelVersion() {
        return this._mdBucketModelVersion;
    }
    /**
    * Add transient flag.
    * @return - bucket info instance
    */
    addTransientFlag() {
        this._transient = true;
        return this;
    }
    /**
    * Remove transient flag.
    * @return - bucket info instance
    */
    removeTransientFlag() {
        this._transient = false;
        return this;
    }
    /**
    * Check transient flag.
    * @return - depending on whether transient flag in place
    */
    hasTransientFlag() {
        return !!this._transient;
    }
    /**
    * Add deleted flag.
    * @return - bucket info instance
    */
    addDeletedFlag() {
        this._deleted = true;
        return this;
    }
    /**
    * Remove deleted flag.
    * @return - bucket info instance
    */
    removeDeletedFlag() {
        this._deleted = false;
        return this;
    }
    /**
    * Check deleted flag.
    * @return - depending on whether deleted flag in place
    */
    hasDeletedFlag() {
        return !!this._deleted;
    }
    /**
     * Check if the versioning mode is on.
     * @return - versioning mode status
     */
    isVersioningOn() {
        return this._versioningConfiguration &&
            this._versioningConfiguration.Status === 'Enabled';
    }
    /**
     * Get unique id of bucket.
     * @return - unique id
     */
    getUid() {
        return this._uid;
    }
    /**
     * Set unique id of bucket.
     * @param uid - unique identifier for the bucket
     * @return - bucket info instance
     */
    setUid(uid: string) {
        this._uid = uid;
        return this;
    }
    /**
     * Check if the bucket is an NFS bucket.
     * @return - Wether the bucket is NFS or not
     */
    isNFS() {
        return this._isNFS;
    }
    /**
     * Set whether the bucket is an NFS bucket.
     * @param isNFS - Wether the bucket is NFS or not
     * @return - bucket info instance
     */
    setIsNFS(isNFS: boolean) {
        this._isNFS = isNFS;
        return this;
    }
    /**
     * enable ingestion, set 'this._ingestion' to { status: 'enabled' }
     * @return - bucket info instance
     */
    enableIngestion() {
        this._ingestion = { status: 'enabled' };
        return this;
    }
    /**
     * disable ingestion, set 'this._ingestion' to { status: 'disabled' }
     * @return - bucket info instance
     */
    disableIngestion() {
        this._ingestion = { status: 'disabled' };
        return this;
    }
    /**
     * Get ingestion configuration
     * @return - bucket ingestion configuration: Enabled or Disabled
     */
    getIngestion() {
        return this._ingestion;
    }

    /**
     ** Check if bucket is an ingestion bucket
     * @return - 'true' if bucket is ingestion bucket, 'false' if
     * otherwise
     */
    isIngestionBucket() {
        const ingestionConfig = this.getIngestion();
        if (ingestionConfig) {
            return true;
        }
        return false;
    }
    /**
     * Check if ingestion is enabled
     * @return - 'true' if ingestion is enabled, otherwise 'false'
     */
    isIngestionEnabled() {
        const ingestionConfig = this.getIngestion();
        return ingestionConfig ? ingestionConfig.status === 'enabled' : false;
    }

    /**
     * Return the Azure specific storage account information for this bucket
     * @return - a structure suitable for {@link BucketAzureIno}
     *   constructor
     */
    getAzureInfo() {
        return this._azureInfo;
    }
    /**
     * Set the Azure specific storage account information for this bucket
     * @param azureInfo - a structure suitable for
     *   {@link BucketAzureInfo} construction
     * @return - bucket info instance
     */
    setAzureInfo(azureInfo: any) {
        this._azureInfo = azureInfo;
        return this;
    }
    /**
    * Check if object lock is enabled.
    * @return - depending on whether object lock is enabled
    */
    isObjectLockEnabled() {
        return !!this._objectLockEnabled;
    }
    /**
    * Set the value of objectLockEnabled field.
    * @param enabled - true if object lock enabled else false.
    * @return - bucket info instance
    */
    setObjectLockEnabled(enabled: boolean) {
        this._objectLockEnabled = enabled;
        return this;
    }

    /**
     * Get the value of bucket tags
     * @return - Array of bucket tags
     */
    getTags() {
        return this._tags;
    }
    
    /**
     * Set bucket tags
     * @return - bucket info instance
     */
    setTags(tags: Array<BucketTag>) {
        this._tags = tags;
        return this;
    }

    /**
     * Get the value of bucket dataReport
     * @return - Array of bucket tags
     */
    getDataReport() {
        return this._dataReport;
    }
    
    /**
     * Set bucket dataReport
     * @return - bucket info instance
     */
    setDataReport(daraReport: DataReport) {
        this._dataReport = daraReport;
        return this;
    }
}
