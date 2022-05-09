import * as evaluators from './lib/policyEvaluator/evaluator';
import evaluatePrincipal from './lib/policyEvaluator/principal';
import RequestContext from './lib/policyEvaluator/RequestContext';
import * as requestUtils from './lib/policyEvaluator/requestUtils';
import * as actionMaps from './lib/policyEvaluator/utils/actionMaps';
import { validateUserPolicy } from './lib/policy/policyValidator'
export { default as errors } from './lib/errors';
export * as ipCheck from './lib/ipCheck';
export * as auth from './lib/auth/auth';
export * as constants from './lib/constants';
export * as https from './lib/https';
export * as metrics from './lib/metrics';
export * as network from './lib/network';

export const db = require('./lib/db');
export const errorUtils = require('./lib/errorUtils');
export const shuffle = require('./lib/shuffle');
export const stringHash = require('./lib/stringHash');
export const jsutil = require('./lib/jsutil');
export const Clustering = require('./lib/Clustering');

export const algorithms = {
    list: require('./lib/algos/list/exportAlgos'),
    listTools: {
        DelimiterTools: require('./lib/algos/list/tools'),
        Skip: require('./lib/algos/list/skip'),
    },
    cache: {
        LRUCache: require('./lib/algos/cache/LRUCache'),
    },
    stream: {
        MergeStream: require('./lib/algos/stream/MergeStream'),
    },
    SortedSet: require('./lib/algos/set/SortedSet'),
};

export const policies = {
    evaluators,
    validateUserPolicy,
    evaluatePrincipal,
    RequestContext,
    requestUtils,
    actionMaps,
};

export const testing = {
    matrix: require('./lib/testing/matrix.js'),
};

export const versioning = {
    VersioningConstants: require('./lib/versioning/constants.js').VersioningConstants,
    Version: require('./lib/versioning/Version.js').Version,
    VersionID: require('./lib/versioning/VersionID.js'),
    WriteGatheringManager: require('./lib/versioning/WriteGatheringManager.js'),
    WriteCache: require('./lib/versioning/WriteCache.js'),
    VersioningRequestProcessor: require('./lib/versioning/VersioningRequestProcessor.js'),
};

export const s3routes = {
    routes: require('./lib/s3routes/routes'),
    routesUtils: require('./lib/s3routes/routesUtils'),
};

export const s3middleware = {
    userMetadata: require('./lib/s3middleware/userMetadata').default,
    convertToXml: require('./lib/s3middleware/convertToXml').default,
    escapeForXml: require('./lib/s3middleware/escapeForXml').default,
    objectLegalHold: require('./lib/s3middleware/objectLegalHold').default,
    tagging: require('./lib/s3middleware/tagging').default,
    checkDateModifiedHeaders:
        require('./lib/s3middleware/validateConditionalHeaders').default
            .checkDateModifiedHeaders,
    validateConditionalHeaders:
        require('./lib/s3middleware/validateConditionalHeaders').default
            .validateConditionalHeaders,
    MD5Sum: require('./lib/s3middleware/MD5Sum').default,
    NullStream: require('./lib/s3middleware/nullStream').default,
    objectUtils: require('./lib/s3middleware/objectUtils').default,
    azureHelper: {
        mpuUtils:
            require('./lib/s3middleware/azureHelpers/mpuUtils').default,
        ResultsCollector:
            require('./lib/s3middleware/azureHelpers/ResultsCollector').default,
        SubStreamInterface:
            require('./lib/s3middleware/azureHelpers/SubStreamInterface').default,
    },
    prepareStream: require('./lib/s3middleware/prepareStream').default,
    processMpuParts: require('./lib/s3middleware/processMpuParts').default,
    retention: require('./lib/s3middleware/objectRetention').default,
    lifecycleHelpers: require('./lib/s3middleware/lifecycleHelpers').default,
};

export const storage = {
    metadata: {
        MetadataWrapper: require('./lib/storage/metadata/MetadataWrapper'),
        bucketclient: {
            BucketClientInterface:
            require('./lib/storage/metadata/bucketclient/' +
                'BucketClientInterface'),
            LogConsumer:
            require('./lib/storage/metadata/bucketclient/LogConsumer'),
        },
        file: {
            BucketFileInterface:
            require('./lib/storage/metadata/file/BucketFileInterface'),
            MetadataFileServer:
            require('./lib/storage/metadata/file/MetadataFileServer'),
            MetadataFileClient:
            require('./lib/storage/metadata/file/MetadataFileClient'),
        },
        inMemory: {
            metastore:
            require('./lib/storage/metadata/in_memory/metastore'),
            metadata: require('./lib/storage/metadata/in_memory/metadata'),
            bucketUtilities:
            require('./lib/storage/metadata/in_memory/bucket_utilities'),
        },
        mongoclient: {
            MongoClientInterface:
            require('./lib/storage/metadata/mongoclient/' +
                'MongoClientInterface'),
            LogConsumer:
            require('./lib/storage/metadata/mongoclient/LogConsumer'),
        },
        proxy: {
            Server: require('./lib/storage/metadata/proxy/Server'),
        },
    },
    data: {
        DataWrapper: require('./lib/storage/data/DataWrapper'),
        MultipleBackendGateway:
        require('./lib/storage/data/MultipleBackendGateway'),
        parseLC: require('./lib/storage/data/LocationConstraintParser'),
        file: {
            DataFileStore:
            require('./lib/storage/data/file/DataFileStore'),
            DataFileInterface:
            require('./lib/storage/data/file/DataFileInterface'),
        },
        external: {
            AwsClient: require('./lib/storage/data/external/AwsClient'),
            AzureClient: require('./lib/storage/data/external/AzureClient'),
            GcpClient: require('./lib/storage/data/external/GcpClient'),
            GCP: require('./lib/storage/data/external/GCP/GcpService'),
            GcpUtils: require('./lib/storage/data/external/GCP/GcpUtils'),
            GcpSigner: require('./lib/storage/data/external/GCP/GcpSigner'),
            PfsClient: require('./lib/storage/data/external/PfsClient'),
            backendUtils: require('./lib/storage/data/external/utils'),
        },
        inMemory: {
            datastore: require('./lib/storage/data/in_memory/datastore'),
        },
    },
    utils: require('./lib/storage/utils'),
};

export const models = {
    BackendInfo: require('./lib/models/BackendInfo'),
    BucketInfo: require('./lib/models/BucketInfo'),
    BucketAzureInfo: require('./lib/models/BucketAzureInfo'),
    ObjectMD: require('./lib/models/ObjectMD'),
    ObjectMDLocation: require('./lib/models/ObjectMDLocation'),
    ObjectMDAzureInfo: require('./lib/models/ObjectMDAzureInfo'),
    ARN: require('./lib/models/ARN'),
    WebsiteConfiguration: require('./lib/models/WebsiteConfiguration'),
    ReplicationConfiguration:
      require('./lib/models/ReplicationConfiguration'),
    LifecycleConfiguration:
        require('./lib/models/LifecycleConfiguration'),
    LifecycleRule: require('./lib/models/LifecycleRule'),
    BucketPolicy: require('./lib/models/BucketPolicy'),
    ObjectLockConfiguration:
        require('./lib/models/ObjectLockConfiguration'),
    NotificationConfiguration:
        require('./lib/models/NotificationConfiguration'),
};

export const pensieve = {
    credentialUtils: require('./lib/executables/pensieveCreds/utils'),
};

export const stream = {
    readJSONStreamObject: require('./lib/stream/readJSONStreamObject'),
};

export const patches = {
    locationConstraints: require('./lib/patches/locationConstraints'),
};
