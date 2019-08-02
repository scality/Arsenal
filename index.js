module.exports = {
    auth: require('./lib/auth/auth'),
    constants: require('./lib/constants'),
    db: require('./lib/db'),
    errors: require('./lib/errors.js'),
    errorUtils: require('./lib/errorUtils'),
    shuffle: require('./lib/shuffle'),
    stringHash: require('./lib/stringHash'),
    ipCheck: require('./lib/ipCheck'),
    jsutil: require('./lib/jsutil'),
    https: {
        ciphers: require('./lib/https/ciphers.js'),
        dhparam: require('./lib/https/dh2048.js'),
    },
    algorithms: {
        list: require('./lib/algos/list/exportAlgos'),
        listTools: {
            DelimiterTools: require('./lib/algos/list/tools'),
        },
    },
    policies: {
        evaluators: require('./lib/policyEvaluator/evaluator.js'),
        validateUserPolicy: require('./lib/policy/policyValidator')
            .validateUserPolicy,
        evaluatePrincipal: require('./lib/policyEvaluator/principal'),
        RequestContext: require('./lib/policyEvaluator/RequestContext.js'),
    },
    Clustering: require('./lib/Clustering'),
    testing: {
        matrix: require('./lib/testing/matrix.js'),
    },
    versioning: {
        VersioningConstants: require('./lib/versioning/constants.js')
            .VersioningConstants,
        Version: require('./lib/versioning/Version.js').Version,
        VersionID: require('./lib/versioning/VersionID.js'),
    },
    network: {
        http: {
            server: require('./lib/network/http/server'),
        },
        rpc: require('./lib/network/rpc/rpc'),
        level: require('./lib/network/rpc/level-net'),
        rest: {
            RESTServer: require('./lib/network/rest/RESTServer'),
            RESTClient: require('./lib/network/rest/RESTClient'),
        },
        RoundRobin: require('./lib/network/RoundRobin'),
        probe: {
            HealthProbeServer:
                require('./lib/network/probe/HealthProbeServer.js'),
        },
        kmip: require('./lib/network/kmip'),
        kmipClient: require('./lib/network/kmip/Client'),
    },
    s3routes: {
        routes: require('./lib/s3routes/routes'),
        routesUtils: require('./lib/s3routes/routesUtils'),
    },
    s3middleware: {
        userMetadata: require('./lib/s3middleware/userMetadata'),
        convertToXml: require('./lib/s3middleware/convertToXml'),
        escapeForXml: require('./lib/s3middleware/escapeForXml'),
        tagging: require('./lib/s3middleware/tagging'),
        checkDateModifiedHeaders:
            require('./lib/s3middleware/validateConditionalHeaders')
            .checkDateModifiedHeaders,
        validateConditionalHeaders:
            require('./lib/s3middleware/validateConditionalHeaders')
            .validateConditionalHeaders,
        MD5Sum: require('./lib/s3middleware/MD5Sum'),
        NullStream: require('./lib/s3middleware/nullStream'),
        objectUtils: require('./lib/s3middleware/objectUtils'),
        azureHelper: {
            mpuUtils:
                require('./lib/s3middleware/azureHelpers/mpuUtils'),
            ResultsCollector:
                require('./lib/s3middleware/azureHelpers/ResultsCollector'),
            SubStreamInterface:
                require('./lib/s3middleware/azureHelpers/SubStreamInterface'),
        },
        prepareStream: require('./lib/s3middleware/prepareStream'),
        processMpuParts: require('./lib/s3middleware/processMpuParts'),
    },
    storage: {
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
    },
    models: {
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
        BucketPolicy: require('./lib/models/BucketPolicy'),
    },
    metrics: {
        StatsClient: require('./lib/metrics/StatsClient'),
        StatsModel: require('./lib/metrics/StatsModel'),
        RedisClient: require('./lib/metrics/RedisClient'),
        ZenkoMetrics: require('./lib/metrics/ZenkoMetrics'),
    },
    pensieve: {
        credentialUtils: require('./lib/executables/pensieveCreds/utils'),
    },
};
