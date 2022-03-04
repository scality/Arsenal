export const auth = require('./lib/auth/auth');
export const constants = require('./lib/constants');
export const db = require('./lib/db');
export const errors = require('./lib/errors.js');
export const shuffle = require('./lib/shuffle');
export const stringHash = require('./lib/stringHash');
export const ipCheck = require('./lib/ipCheck');
export const jsutil = require('./lib/jsutil');
export const Clustering = require('./lib/Clustering');

export const https = {
    ciphers: require('./lib/https/ciphers.js'),
    dhparam: require('./lib/https/dh2048.js'),
};

export const algorithms = {
    list: {
        Basic: require('./lib/algos/list/basic').List,
        Delimiter: require('./lib/algos/list/delimiter').Delimiter,
        DelimiterVersions: require('./lib/algos/list/delimiterVersions').DelimiterVersions,
        DelimiterMaster: require('./lib/algos/list/delimiterMaster').DelimiterMaster,
        MPU: require('./lib/algos/list/MPU').MultipartUploads,
    },
    listTools: {
        DelimiterTools: require('./lib/algos/list/tools'),
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
    evaluators: require('./lib/policyEvaluator/evaluator.js'),
    validateUserPolicy: require('./lib/policy/policyValidator').validateUserPolicy,
    evaluatePrincipal: require('./lib/policyEvaluator/principal'),
    RequestContext: require('./lib/policyEvaluator/RequestContext.js'),
    requestUtils: require('./lib/policyEvaluator/requestUtils'),
    actionMaps: require('./lib/policyEvaluator/utils/actionMaps'),
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

export const network = {
    http: {
        server: require('./lib/network/http/server'),
    },
    rpc: require('./lib/network/rpc/rpc'),
    level: require('./lib/network/rpc/level-net'),
    rest: {
        RESTServer: require('./lib/network/rest/RESTServer'),
        RESTClient: require('./lib/network/rest/RESTClient'),
    },
    probe: {
        ProbeServer: require('./lib/network/probe/ProbeServer'),
    },
    RoundRobin: require('./lib/network/RoundRobin'),
    kmip: require('./lib/network/kmip'),
    kmipClient: require('./lib/network/kmip/Client'),
};

export const s3routes = {
    routes: require('./lib/s3routes/routes'),
    routesUtils: require('./lib/s3routes/routesUtils'),
};

export const s3middleware = {
    userMetadata: require('./lib/s3middleware/userMetadata'),
    convertToXml: require('./lib/s3middleware/convertToXml'),
    escapeForXml: require('./lib/s3middleware/escapeForXml'),
    objectLegalHold: require('./lib/s3middleware/objectLegalHold'),
    tagging: require('./lib/s3middleware/tagging'),
    validateConditionalHeaders:
        require('./lib/s3middleware/validateConditionalHeaders').validateConditionalHeaders,
    MD5Sum: require('./lib/s3middleware/MD5Sum'),
    NullStream: require('./lib/s3middleware/nullStream'),
    objectUtils: require('./lib/s3middleware/objectUtils'),
    azureHelper: {
        mpuUtils: require('./lib/s3middleware/azureHelpers/mpuUtils'),
        ResultsCollector: require('./lib/s3middleware/azureHelpers/ResultsCollector'),
        SubStreamInterface: require('./lib/s3middleware/azureHelpers/SubStreamInterface'),
    },
    retention: require('./lib/s3middleware/objectRetention'),
    lifecycleHelpers: require('./lib/s3middleware/lifecycleHelpers'),
};

export const storage = {
    metadata: {
        MetadataFileServer: require('./lib/storage/metadata/file/MetadataFileServer'),
        MetadataFileClient: require('./lib/storage/metadata/file/MetadataFileClient'),
        LogConsumer: require('./lib/storage/metadata/bucketclient/LogConsumer'),
    },
    data: {
        file: {
            DataFileStore: require('./lib/storage/data/file/DataFileStore'),
        },
    },
    utils: require('./lib/storage/utils'),
};

export const models = {
    BucketInfo: require('./lib/models/BucketInfo'),
    ObjectMD: require('./lib/models/ObjectMD'),
    ObjectMDLocation: require('./lib/models/ObjectMDLocation'),
    ARN: require('./lib/models/ARN'),
    WebsiteConfiguration: require('./lib/models/WebsiteConfiguration'),
    ReplicationConfiguration: require('./lib/models/ReplicationConfiguration'),
    LifecycleConfiguration: require('./lib/models/LifecycleConfiguration'),
    LifecycleRule: require('./lib/models/LifecycleRule'),
    BucketPolicy: require('./lib/models/BucketPolicy'),
    ObjectLockConfiguration: require('./lib/models/ObjectLockConfiguration'),
    NotificationConfiguration: require('./lib/models/NotificationConfiguration'),
};

export const metrics = {
    StatsClient: require('./lib/metrics/StatsClient'),
    StatsModel: require('./lib/metrics/StatsModel'),
    RedisClient: require('./lib/metrics/RedisClient'),
    ZenkoMetrics: require('./lib/metrics/ZenkoMetrics'),
};

export const pensieve = {
    credentialUtils: require('./lib/executables/pensieveCreds/utils'),
};

export const stream = {
    readJSONStreamObject: require('./lib/stream/readJSONStreamObject'),
};
