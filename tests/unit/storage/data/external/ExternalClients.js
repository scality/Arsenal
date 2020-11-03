const assert = require('assert');
const stream = require('stream');

const AwsClient = require('../../../../../lib/storage/data/external/AwsClient');
const GcpClient = require('../../../../../lib/storage/data/external/GcpClient');
const AzureClient =
    require('../../../../../lib/storage/data/external/AzureClient');
const DummyService = require('../DummyService');
const { DummyRequestLogger } = require('../../../helpers');

const backendClients = [
    {
        Class: AwsClient,
        name: 'AwsClient',
        config: {
            s3Params: {},
            bucketName: 'awsTestBucketName',
            dataStoreName: 'awsDataStore',
            serverSideEncryption: false,
            type: 'aws',
        },
    },
    {
        Class: GcpClient,
        name: 'GcpClient',
        config: {
            s3Params: {},
            bucketName: 'gcpTestBucketName',
            mpuBucket: 'gcpTestMpuBucketName',
            dataStoreName: 'gcpDataStore',
            type: 'gcp',
        },
    },
    {
        Class: AzureClient,
        name: 'AzureClient',
        config: {
            azureStorageEndpoint: '',
            azureStorageCredentials: {
                storageAccountName: 'scality',
                storageAccessKey: 'Zm9vCg==',
            },
            azureContainerName: 'azureTestBucketName',
            dataStoreName: 'azureDataStore',
            type: 'azure',
        },
    },
];
const log = new DummyRequestLogger();

describe('external backend clients', () => {
    backendClients.forEach(backend => {
        let testClient;

        before(() => {
            testClient = new backend.Class(backend.config);
            testClient._client = new DummyService({ versioning: true });
        });

        if (backend.config.type !== 'azure') {
            it(`${backend.name} completeMPU should return correctly ` +
            'typed mpu results', done => {
                const jsonList = {
                    Part: [
                        {
                            PartNumber: [1],
                            ETag: ['testpart0001etag'],
                        },
                        {
                            PartNumber: [2],
                            ETag: ['testpart0002etag'],
                        },
                        {
                            PartNumber: [3],
                            ETag: ['testpart0003etag'],
                        },
                    ],
                };
                const key = 'externalBackendTestKey';
                const bucketName = 'externalBackendTestBucket';
                const uploadId = 'externalBackendTestUploadId';
                testClient.completeMPU(jsonList, null, key,
                uploadId, bucketName, log, (err, res) => {
                    assert.strictEqual(typeof res.key, 'string');
                    assert.strictEqual(typeof res.eTag, 'string');
                    assert.strictEqual(typeof res.dataStoreVersionId,
                                       'string');
                    assert.strictEqual(typeof res.contentLength, 'number');
                    return done();
                });
            });
        }

        it(`${backend.name} toObjectGetInfo should return correct ` +
        'objectGetInfo object', () => {
            const key = 'externalBackendTestKey';
            const bucketName = 'externalBackendTestBucket';
            const objectGetInfo = testClient.toObjectGetInfo(key, bucketName);
            assert.deepStrictEqual(objectGetInfo, {
                // bucketMatch === false => expect bucket name to be
                // prefixed to the backend key
                key: 'externalBackendTestBucket/externalBackendTestKey',
                dataStoreName: backend.config.dataStoreName,
            });
        });

        it(`${backend.name} head() should return HTTP 424 if location ` +
        'does not exist', done => {
            testClient.head({
                key: 'externalBackendTestBucket/externalBackendMissingKey',
                dataStoreName: backend.config.dataStoreName,
            }, null, err => {
                assert(err);
                assert(err.LocationNotFound);
                done();
            });
        });

        it(`${backend.name} get() should stream a range of data`, done => {
            // the reference virtual object is 1GB in size, let's get
            // only a small range from it
            testClient.get({
                key: 'externalBackendTestBucket/externalBackendTestKey',
                dataStoreName: backend.config.dataStoreName,
                response: new stream.PassThrough(),
            }, [10000000, 10000050], '', (err, readable) => {
                assert.ifError(err);
                const readChunks = [];
                readable
                    .on('data', chunk => readChunks.push(chunk))
                    .on('error', err => assert.ifError(err))
                    .on('end', () => {
                        assert.strictEqual(
                            readChunks.join(''),
                            ' 0989680 0989688 0989690 0989698 09896a0 09896a8 09');
                        done();
                    });
            });
        });
        // To-Do: test the other external client methods
    });
});
