import assert from 'assert';
import { v4 as uuid } from 'uuid';

import { WebsiteConfiguration, WebsiteConfigurationParams } from './WebsiteConfiguration';
import ReplicationConfiguration, { ReplicationConfigurationMetadata } from './ReplicationConfiguration';
import LifecycleConfiguration, { LifecycleConfigurationMetadata } from './LifecycleConfiguration';
import ObjectLockConfiguration, { ObjectLockConfigurationMetadata } from './ObjectLockConfiguration';
import BucketPolicy, { BucketPolicyMetadata } from './BucketPolicy';
import NotificationConfiguration, { NotificationConfigurationMetadata } from './NotificationConfiguration';
import { ACL as OACL } from './ObjectMD';
import { areTagsValid, BucketTag } from '../s3middleware/tagging';
import { VeeamCapability, VeeamSOSApiSchema, VeeamSOSApiSerializable } from './Veeam';
import { AzureInfoMetadata } from './BucketAzureInfo';
import BucketLoggingStatus from './BucketLoggingStatus';
import RateLimitConfiguration, { RateLimitConfigurationMetadata } from './RateLimitConfiguration';

// WHEN UPDATING THIS NUMBER, UPDATE BucketInfoModelVersion.md CHANGELOG
// BucketInfoModelVersion.md can be found in documentation/ at the root
// of this repository
const modelVersion = 19;

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
    isAccountEncryptionEnabled: boolean;
};

export type VersioningConfiguration = {
    Status: 'Enabled' | 'Suspended';
    MfaDelete: 'Enabled' | 'Disabled';
};

/**
 * Capabilities is the schema for the Capabilities object, where the
 * capacity-related fields are bigints. Used by nodejs internally.
 */
export type Capabilities = {
    VeeamSOSApi?: VeeamSOSApiSchema,
};

export type ACL = OACL & { WRITE: string[] }

export type BucketMetadata = {
    acl: ACL;
    name: string,
    owner: string,
    ownerDisplayName: string,
    creationDate: string,
    mdBucketModelVersion: number,
    transient: boolean,
    deleted: boolean,
    serverSideEncryption?: SSE,
    versioningConfiguration?: VersioningConfiguration,
    locationConstraint?: string,
    readLocationConstraint?: string,
    websiteConfiguration?: WebsiteConfigurationParams,
    cors?: CORS,
    replicationConfiguration?: ReplicationConfigurationMetadata,
    lifecycleConfiguration?: LifecycleConfigurationMetadata,
    bucketPolicy?: BucketPolicyMetadata,
    uid: string,
    isNFS?: boolean,
    ingestion?: { status: 'enabled' | 'disabled' },
    azureInfo?: AzureInfoMetadata,
    objectLockEnabled?: boolean,
    objectLockConfiguration?: ObjectLockConfigurationMetadata,
    notificationConfiguration?: NotificationConfigurationMetadata,
    tags: Array<BucketTag>,
    capabilities?: Capabilities,
    quotaMax: bigint | number,
    bucketLoggingStatus?: BucketLoggingStatus,
    rateLimitConfiguration?: RateLimitConfigurationMetadata,
};

export type BucketMetadataJSON = Omit<BucketMetadata, 'quotaMax' | 'capabilities'> & {
    quotaMax: string;
    capabilities: {
        VeeamSOSApi?: VeeamSOSApiSerializable,
    };
};

export default class BucketInfo implements BucketMetadata {
    private _acl: ACL;
    private _name: string;
    private _owner: string;
    private _ownerDisplayName: string;
    private _creationDate: string;
    private _mdBucketModelVersion: number;
    private _transient: boolean;
    private _deleted: boolean;
    private _serverSideEncryption?: SSE;
    private _versioningConfiguration?: VersioningConfiguration;
    private _locationConstraint?: string;
    private _websiteConfiguration?: WebsiteConfiguration;
    private _cors?: CORS;
    private _replicationConfiguration?: ReplicationConfigurationMetadata;
    private _lifecycleConfiguration?: LifecycleConfigurationMetadata;
    private _bucketPolicy?: BucketPolicyMetadata;
    private _uid: string;
    private _objectLockEnabled?: boolean;
    private _objectLockConfiguration?: ObjectLockConfigurationMetadata;
    private _notificationConfiguration?: NotificationConfigurationMetadata;
    private _tags: Array<BucketTag>;
    private _readLocationConstraint?: string;
    private _isNFS?: boolean;
    private _azureInfo?: AzureInfoMetadata;
    private _ingestion?: { status: 'enabled' | 'disabled' };
    private _capabilities?: Capabilities;
    private _quotaMax: bigint;
    private _bucketLoggingStatus?: BucketLoggingStatus;
    private _rateLimitConfiguration?: RateLimitConfiguration;

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
    * @param [capabilities] - capabilities for the bucket
    * @param quotaMax - bucket quota
    */
    constructor(
        name: string,
        owner: string,
        ownerDisplayName: string,
        creationDate: string,
        mdBucketModelVersion: number,
        acl?: ACL,
        transient?: boolean,
        deleted?: boolean,
        serverSideEncryption?: SSE,
        versioningConfiguration?: VersioningConfiguration,
        locationConstraint?: string,
        websiteConfiguration?: WebsiteConfiguration,
        cors?: CORS,
        replicationConfiguration?: ReplicationConfigurationMetadata,
        lifecycleConfiguration?: LifecycleConfigurationMetadata,
        bucketPolicy?: BucketPolicyMetadata,
        uid?: string,
        readLocationConstraint?: string,
        isNFS?: boolean,
        ingestionConfig?: { status: 'enabled' | 'disabled' },
        azureInfo?: AzureInfoMetadata,
        objectLockEnabled?: boolean,
        objectLockConfiguration?: ObjectLockConfigurationMetadata,
        notificationConfiguration?: NotificationConfigurationMetadata,
        tags?: Array<BucketTag> | [],
        capabilities?: Capabilities,
        quotaMax?: bigint | number,
        bucketLoggingStatus?: BucketLoggingStatus,
        rateLimitConfiguration?: RateLimitConfiguration,
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
            assert.strictEqual(typeof mandatory, 'boolean');
            assert.ok(masterKeyId !== undefined || configuredMasterKeyId !== undefined,
                'At least one of masterKeyId or configuredMasterKeyId must be defined');
            if (masterKeyId !== undefined) {
                assert.strictEqual(typeof masterKeyId, 'string', 'masterKeyId must be a string');
            }
            if (configuredMasterKeyId !== undefined) {
                assert.strictEqual(typeof configuredMasterKeyId, 'string', 'configuredMasterKeyId must be a string');
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
        if (capabilities?.VeeamSOSApi?.CapacityInfo) {
            assert(
                typeof capabilities.VeeamSOSApi.CapacityInfo.Capacity === 'bigint' ||
                typeof capabilities.VeeamSOSApi.CapacityInfo.Capacity === 'number'
            );
            assert(
                typeof capabilities.VeeamSOSApi.CapacityInfo.Available === 'bigint' ||
                typeof capabilities.VeeamSOSApi.CapacityInfo.Available === 'number'
            );
            assert(
                typeof capabilities.VeeamSOSApi.CapacityInfo.Used === 'bigint' ||
                typeof capabilities.VeeamSOSApi.CapacityInfo.Used === 'number'
            );
            assert(capabilities.VeeamSOSApi.CapacityInfo.Capacity >= -1);
            assert(capabilities.VeeamSOSApi.CapacityInfo.Available >= -1);
            assert(capabilities.VeeamSOSApi.CapacityInfo.Used >= -1);
        }
        if (quotaMax) {
            assert(typeof quotaMax === 'bigint' || typeof quotaMax === 'number');
            assert(quotaMax >= 0, 'Quota cannot be negative');
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

        if (!tags) {
            tags = [] as BucketTag[];
        }
        assert.strictEqual(areTagsValid(tags), true);

        if (bucketLoggingStatus) {
            assert(bucketLoggingStatus instanceof BucketLoggingStatus);
        }

        // IF UPDATING PROPERTIES, INCREMENT MODELVERSION NUMBER ABOVE
        this._acl = aclInstance;
        this._name = name;
        this._owner = owner;
        this._ownerDisplayName = ownerDisplayName;
        this._creationDate = creationDate;
        this._mdBucketModelVersion = mdBucketModelVersion || 0;
        this._transient = transient || false;
        this._deleted = deleted || false;
        this._serverSideEncryption = serverSideEncryption;
        this._versioningConfiguration = versioningConfiguration;
        this._locationConstraint = locationConstraint;
        this._readLocationConstraint = readLocationConstraint;
        this._websiteConfiguration = websiteConfiguration;
        this._replicationConfiguration = replicationConfiguration;
        this._cors = cors;
        this._lifecycleConfiguration = lifecycleConfiguration;
        this._bucketPolicy = bucketPolicy;
        this._uid = uid || uuid();
        this._isNFS = isNFS;
        this._ingestion = ingestionConfig;
        this._azureInfo = azureInfo;
        this._objectLockEnabled = objectLockEnabled;
        this._objectLockConfiguration = objectLockConfiguration;
        this._notificationConfiguration = notificationConfiguration;
        this._tags = tags;
        this._bucketLoggingStatus = bucketLoggingStatus;

        this._capabilities = capabilities && {
            ...capabilities,
            VeeamSOSApi: capabilities.VeeamSOSApi &&
                VeeamCapability.toBigInt(capabilities.VeeamSOSApi),
        };

        this._quotaMax = BigInt(quotaMax || 0n);
        this._rateLimitConfiguration = rateLimitConfiguration;
        return this;
    }

    /**
     * Make the bucket info serializable
     * @return - serializable object
     */
    makeSerializable() {
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
            capabilities: this._capabilities && {
                ...this._capabilities,
                VeeamSOSApi: this._capabilities.VeeamSOSApi &&
                    VeeamCapability.serialize(this._capabilities.VeeamSOSApi),
            },
            quotaMax: this._quotaMax.toString(),
            bucketLoggingStatus: this._bucketLoggingStatus,
            rateLimitConfiguration: this._rateLimitConfiguration?.getData(),
        };
        const final = this._websiteConfiguration
            ? {
                ...bucketInfos,
                websiteConfiguration: this._websiteConfiguration.getConfig(),
            }
            : bucketInfos;
        return final;
    }

    /**
     * Serialize the object
     * @return - stringified object
     */
    serialize() {
        return JSON.stringify(this.makeSerializable());
    }

    /**
     * deSerialize the JSON string
     * @param stringBucket - the stringified bucket
     * @return - parsed string
     */
    static deSerialize(stringBucket: string) {
        const obj: BucketMetadataJSON = JSON.parse(stringBucket);
        const capabilities = obj.capabilities && {
            ...obj.capabilities,
            VeeamSOSApi: obj.capabilities?.VeeamSOSApi &&
                VeeamCapability.parse(obj.capabilities?.VeeamSOSApi),
        };
        const websiteConfig = obj.websiteConfiguration ?
            new WebsiteConfiguration(obj.websiteConfiguration) : undefined;
        const bucketLoggingStatus = obj.bucketLoggingStatus ?
            new BucketLoggingStatus((obj.bucketLoggingStatus as any)._loggingEnabled) : undefined;
        const rateLimitConfiguration = obj.rateLimitConfiguration ?
            new RateLimitConfiguration(obj.rateLimitConfiguration) : undefined;
        return new BucketInfo(obj.name, obj.owner, obj.ownerDisplayName,
            obj.creationDate, obj.mdBucketModelVersion, obj.acl,
            obj.transient, obj.deleted, obj.serverSideEncryption,
            obj.versioningConfiguration, obj.locationConstraint, websiteConfig,
            obj.cors, obj.replicationConfiguration, obj.lifecycleConfiguration,
            obj.bucketPolicy, obj.uid, obj.readLocationConstraint, obj.isNFS,
            obj.ingestion, obj.azureInfo, obj.objectLockEnabled,
            obj.objectLockConfiguration, obj.notificationConfiguration, obj.tags,
            capabilities, BigInt(obj.quotaMax || 0n), bucketLoggingStatus, rateLimitConfiguration);
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
        const capabilities: Capabilities = data._capabilities && {
            ...data._capabilities,
            VeeamSOSApi: data._capabilities?.VeeamSOSApi &&
                VeeamCapability.parse(data._capabilities?.VeeamSOSApi),
        };
        return new BucketInfo(data._name, data._owner, data._ownerDisplayName,
            data._creationDate, data._mdBucketModelVersion, data._acl,
            data._transient, data._deleted, data._serverSideEncryption,
            data._versioningConfiguration, data._locationConstraint,
            data._websiteConfiguration, data._cors,
            data._replicationConfiguration, data._lifecycleConfiguration,
            data._bucketPolicy, data._uid, data._readLocationConstraint,
            data._isNFS, data._ingestion, data._azureInfo,
            data._objectLockEnabled, data._objectLockConfiguration,
            data._notificationConfiguration, data._tags, capabilities,
            BigInt(data._quotaMax || 0n), data._bucketLoggingStatus,
            data._rateLimitConfiguration);
    }

    /**
     * Create a BucketInfo from a JSON object
     *
     * @param data - object containing data
     * @return Return an BucketInfo
     */
    static fromJson(data: BucketMetadataJSON) {
        const bucketLoggingStatus = data.bucketLoggingStatus ?
            new BucketLoggingStatus((data.bucketLoggingStatus as any)._loggingEnabled) : undefined;
        const rateLimitConfiguration = data.rateLimitConfiguration ?
            new RateLimitConfiguration(data.rateLimitConfiguration) : undefined;
        return new BucketInfo(data.name, data.owner, data.ownerDisplayName,
            data.creationDate, data.mdBucketModelVersion, data.acl,
            data.transient, data.deleted, data.serverSideEncryption,
            data.versioningConfiguration, data.locationConstraint,
            data.websiteConfiguration && new WebsiteConfiguration(data.websiteConfiguration),
            data.cors, data.replicationConfiguration, data.lifecycleConfiguration,
            data.bucketPolicy, data.uid, data.readLocationConstraint,
            data.isNFS, data.ingestion, data.azureInfo,
            data.objectLockEnabled, data.objectLockConfiguration,
            data.notificationConfiguration, data.tags, {
                ...data.capabilities,
                VeeamSOSApi: data.capabilities?.VeeamSOSApi &&
                    VeeamCapability.parse(data.capabilities?.VeeamSOSApi),
            }, BigInt(data.quotaMax || 0n), bucketLoggingStatus, rateLimitConfiguration);
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
    setReplicationConfiguration(replicationConfiguration: ReplicationConfigurationMetadata) {
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
    setLifecycleConfiguration(lifecycleConfiguration: LifecycleConfigurationMetadata) {
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
    setBucketPolicy(bucketPolicy?: BucketPolicyMetadata) {
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
    setObjectLockConfiguration(objectLockConfiguration: ObjectLockConfigurationMetadata) {
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
    setNotificationConfiguration(notificationConfiguration: NotificationConfigurationMetadata) {
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
     * Checks if the default encryption is set at the account level instead of the legacy bucket level.
     * This method helps to prevent deletion of the account-level master encryption key when deleting buckets.
     *
     * @returns {boolean} - Returns true if account-level default encryption is enabled,
     * false if it uses the legacy bucket level.
     */
    isAccountEncryptionEnabled() {
        if (!this._serverSideEncryption) {
            return false;
        }

        return this._serverSideEncryption.isAccountEncryptionEnabled;
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
    // @ts-expect-error the function name is not compatible
    // with an extension of the BucketMetadata interface
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
        return this._ingestion || null;
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
    setAzureInfo(azureInfo: AzureInfoMetadata) {
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
     * Get the value of bucket capabilities
     * @return - capabilities of the bucket
     */
    getCapabilities() {
        return this._capabilities;
    }

    /**
     * Get a specific bucket capability
     *
     * @param capability? - if provided, will return a specific capacity
     * @return - capability of the bucket
     */
    getCapability(capability: string) : Capabilities[keyof Capabilities] | undefined {
        if (capability && this._capabilities && this._capabilities[capability]) {
            return this._capabilities[capability];
        }
        return undefined;
    }

    /**
     * Set bucket capabilities
     * @return - bucket info instance
     */
    setCapabilities(capabilities: Capabilities) {
        this._capabilities = capabilities;
        return this;
    }

    /**
     * Get the bucket quota information
     * @return quotaMax
     */
    getQuota() {
        return this._quotaMax;
    }

    /**
     * Set bucket quota
     * @param quota - quota to be set
     * @return - bucket quota info
     */
    setQuota(quota: bigint | number) {
        this._quotaMax = BigInt(quota || 0n);
        return this;
    }

    /**
     * Get bucket logging status
     * @returns - bucket logging status
     */
    getBucketLoggingStatus() : BucketLoggingStatus | undefined {
        return this._bucketLoggingStatus;
    }

    /**
     * Set bucket logging status
     * @param bucketLoggingStatus - bucket logging status
     * @returns - this
     */
    setBucketLoggingStatus(bucketLoggingStatus : BucketLoggingStatus) {
        this._bucketLoggingStatus = bucketLoggingStatus;
        return this;
    }

    getRateLimitConfiguration(): RateLimitConfiguration | undefined {
        return this._rateLimitConfiguration;
    }

    setRateLimitConfiguration(value: RateLimitConfiguration) {
        this._rateLimitConfiguration = value;
    }
}
