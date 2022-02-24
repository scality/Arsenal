// Exports
export * as auth from './lib/auth/auth';
export * as constants from './lib/constants';
export * as db from './lib/db';
export { default as errors } from './lib/errors';
export * as errorUtils from './lib/errorUtils';
export { default as shuffle } from './lib/shuffle';
export { default as stringHash } from './lib/stringHash';
export * as ipCheck from './lib/ipCheck';
export * as jsutil from './lib/jsutil';
export * as https from './lib/https';
export { default as Clustering } from './lib/Clustering';
export * as algorithms from './lib/algos';
export * as policies from './lib/policyEvaluator';
export * as testing from './lib/testing';
export * as versioning from './lib/versioning';
export * as network from './lib/network';
export * as s3routes from './lib/s3routes';
export * as s3middleware from './lib/s3middleware';
export * as models from './lib/models';
export * as metrics from './lib/metrics';
export * as stream from './lib/stream';

export const pensieve = {
    credentialUtils: require('./lib/executables/pensieveCreds/utils'),
};

export const storage = {
    metadata: {
        MetadataWrapper: require('./lib/storage/metadata/MetadataWrapper'),
        bucketclient: {
            BucketClientInterface: require('./lib/storage/metadata/bucketclient/BucketClientInterface'),
            LogConsumer: require('./lib/storage/metadata/bucketclient/LogConsumer'),
        },
        file: {
            BucketFileInterface: require('./lib/storage/metadata/file/BucketFileInterface'),
            MetadataFileServer: require('./lib/storage/metadata/file/MetadataFileServer'),
            MetadataFileClient: require('./lib/storage/metadata/file/MetadataFileClient'),
        },
        inMemory: {
            metastore: require('./lib/storage/metadata/in_memory/metastore'),
            metadata: require('./lib/storage/metadata/in_memory/metadata'),
            bucketUtilities: require('./lib/storage/metadata/in_memory/bucket_utilities'),
        },
        mongoclient: {
            MongoClientInterface: require('./lib/storage/metadata/mongoclient/MongoClientInterface'),
            LogConsumer: require('./lib/storage/metadata/mongoclient/LogConsumer'),
        },
        proxy: {
            Server: require('./lib/storage/metadata/proxy/Server'),
        },
    },
    data: {
        DataWrapper: require('./lib/storage/data/DataWrapper'),
        MultipleBackendGateway: require('./lib/storage/data/MultipleBackendGateway'),
        parseLC: require('./lib/storage/data/LocationConstraintParser'),
        file: {
            DataFileStore: require('./lib/storage/data/file/DataFileStore'),
            DataFileInterface: require('./lib/storage/data/file/DataFileInterface'),
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
