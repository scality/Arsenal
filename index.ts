import * as evaluators from './lib/policyEvaluator/evaluator';
import evaluatePrincipal from './lib/policyEvaluator/principal';
import RequestContext, {
    actionNeedQuotaCheck,
    actionNeedQuotaCheckCopy,
    actionWithDataDeletion } from './lib/policyEvaluator/RequestContext';
import * as requestUtils from './lib/policyEvaluator/requestUtils';
import * as actionMaps from './lib/policyEvaluator/utils/actionMaps';
import { validateUserPolicy } from './lib/policy/policyValidator';
import * as locationConstraints from './lib/patches/locationConstraints';
import * as userMetadata from './lib/s3middleware/userMetadata';
import convertToXml from './lib/s3middleware/convertToXml';
import escapeForXml from './lib/s3middleware/escapeForXml';
import * as objectLegalHold from './lib/s3middleware/objectLegalHold';
import * as tagging from './lib/s3middleware/tagging';
import { checkDateModifiedHeaders } from './lib/s3middleware/validateConditionalHeaders';
import { validateConditionalHeaders } from './lib/s3middleware/validateConditionalHeaders';
import MD5Sum from './lib/s3middleware/MD5Sum';
import NullStream from './lib/s3middleware/nullStream';
import * as objectUtils from './lib/s3middleware/objectUtils';
import * as mpuUtils from './lib/s3middleware/azureHelpers/mpuUtils';
import ResultsCollector from './lib/s3middleware/azureHelpers/ResultsCollector';
import SubStreamInterface from './lib/s3middleware/azureHelpers/SubStreamInterface';
import { prepareStream } from './lib/s3middleware/prepareStream';
import * as processMpuParts from './lib/s3middleware/processMpuParts';
import * as retention from './lib/s3middleware/objectRetention';
import * as objectRestore from './lib/s3middleware/objectRestore';
import * as lifecycleHelpers from './lib/s3middleware/lifecycleHelpers';
export { default as errors } from './lib/errors';
export { default as Clustering } from './lib/Clustering';
export * as ClusterRPC from './lib/clustering/ClusterRPC';
export * as ipCheck from './lib/ipCheck';
export * as auth from './lib/auth/auth';
export * as constants from './lib/constants';
export * as https from './lib/https';
export * as metrics from './lib/metrics';
export * as network from './lib/network';
export * as s3routes from './lib/s3routes';
export * as versioning from './lib/versioning';
export * as stream from './lib/stream';
export * as jsutil from './lib/jsutil';
export { default as stringHash } from './lib/stringHash';
export * as db from './lib/db';
export * as errorUtils from './lib/errorUtils';
export { default as shuffle } from './lib/shuffle';
export * as models from './lib/models';

export const algorithms = {
    list: require('./lib/algos/list/exportAlgos'),
    listTools: {
        DelimiterTools: require('./lib/algos/list/tools'),
        Skip: require('./lib/algos/list/skip'),
    },
    cache: {
        GapSet: require('./lib/algos/cache/GapSet'),
        GapCache: require('./lib/algos/cache/GapCache'),
        LRUCache: require('./lib/algos/cache/LRUCache'),
    },
    stream: {
        MergeStream: require('./lib/algos/stream/MergeStream'),
    },
    SortedSet: require('./lib/algos/set/SortedSet'),
    Heap: require('./lib/algos/heap/Heap'),
};

export const policies = {
    evaluators,
    validateUserPolicy,
    evaluatePrincipal,
    RequestContext,
    requestUtils,
    actionMaps,
    actionNeedQuotaCheck,
    actionWithDataDeletion,
    actionNeedQuotaCheckCopy,
};

export const testing = {
    matrix: require('./lib/testing/matrix.js'),
};

export const s3middleware = {
    userMetadata,
    convertToXml,
    escapeForXml,
    objectLegalHold,
    tagging,
    checkDateModifiedHeaders,
    validateConditionalHeaders,
    MD5Sum,
    NullStream,
    objectUtils,
    azureHelper: {
        mpuUtils,
        ResultsCollector,
        SubStreamInterface,
    },
    prepareStream,
    processMpuParts,
    retention,
    objectRestore,
    lifecycleHelpers,
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

export const pensieve = {
    credentialUtils: require('./lib/executables/pensieveCreds/utils'),
};

export const patches = {
    locationConstraints,
};
