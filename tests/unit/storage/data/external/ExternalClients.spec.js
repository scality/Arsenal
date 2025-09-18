const assert = require('assert');
const async = require('async');
const stream = require('stream');
const { promisify } = require('util');

const AwsClient = require('../../../../../lib/storage/data/external/AwsClient');
const GcpClient = require('../../../../../lib/storage/data/external/GcpClient');
const AzureClient =
    require('../../../../../lib/storage/data/external/AzureClient');
const DummyService = require('../DummyService');
const { DummyRequestLogger } = require('../../../helpers');
const BucketInfo = require('../../../../../lib/models/BucketInfo').default;

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
            azureStorageEndpoint: 'http://localhost:37425/',
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
        let headAsync, getAsync, objectPutTaggingAsync, objectDeleteTaggingAsync;

        beforeAll(() => {
            testClient = new backend.Class(backend.config);
            testClient._client = new DummyService({ versioning: true });
            
            // Promisify the client methods
            headAsync = promisify(testClient.head.bind(testClient));
            getAsync = promisify(testClient.get.bind(testClient));
            if (backend.config.type !== 'azure') {
                objectPutTaggingAsync = promisify(testClient.objectPutTagging.bind(testClient));
                objectDeleteTaggingAsync = promisify(testClient.objectDeleteTagging.bind(testClient));
            }
        });

        if (backend.config.type !== 'azure') {
            it(`${backend.name} completeMPU should return correctly typed mpu results`, done => {
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
                        if (err) return done(err);
                        assert.strictEqual(typeof res.key, 'string');
                        assert.strictEqual(typeof res.eTag, 'string');
                        assert.strictEqual(typeof res.dataStoreVersionId, 'string');
                        assert.strictEqual(typeof res.contentLength, 'number');
                        return done();
                    });
            });
        }

        it(`${backend.name} toObjectGetInfo should return correct objectGetInfo object`, () => {
            const key = 'externalBackendTestKey';
            const bucketName = 'externalBackendTestBucket';
            const objectGetInfo = testClient.toObjectGetInfo(key, bucketName);
            assert.deepStrictEqual(objectGetInfo, {
                key: 'externalBackendTestBucket/externalBackendTestKey',
                dataStoreName: backend.config.dataStoreName,
            });
        });

        it(`${backend.name} head() should return HTTP 424 if location does not exist`, async () => {
            try {
                await headAsync({
                    key: 'externalBackendTestBucket/externalBackendMissingKey',
                    dataStoreName: backend.config.dataStoreName,
                }, null);
                assert.fail('Expected an error to be thrown');
            } catch (err) {
                assert(err);
                assert(err.is.LocationNotFound);
            }
        });

        it(`${backend.name} get() should stream a range of data`, async () => {
            const readable = await getAsync({
                key: 'externalBackendTestBucket/externalBackendTestKey',
                dataStoreName: backend.config.dataStoreName,
                response: new stream.PassThrough(),
            }, [10000000, 10000050], '');
            
            let data = '';
            let streamToRead;
            
            if (backend.name === 'AzureClient') {
                streamToRead = readable;
            } else {
                streamToRead = readable.createReadStream();
            }
            
            await new Promise((resolve, reject) => {
                streamToRead.on('data', (chunk) => {
                    data += chunk.toString();
                });
                streamToRead.on('end', () => {
                    resolve();
                });
                streamToRead.on('error', reject);
            });
            assert(data.length > 0);
        });

        it(`${backend.name} get() should not call the callback again on stream error`, async () => {
            const result = await getAsync({
                key: 'externalBackendTestBucket/externalBackendTestKey',
                dataStoreName: backend.config.dataStoreName,
                response: new stream.PassThrough(),
            }, [10000000, 10000050], '');
            
            let readable;
            
            if (backend.name === 'AzureClient') {
                readable = result;
            } else {
                readable = result.createReadStream();
            }
            
            let errorHandled = false;
            
            await new Promise((resolve) => {
                readable
                    .once('data', () => readable.emit('error', new Error('OOPS')))
                    .on('error', err => {
                        assert.strictEqual(err.message, 'OOPS');
                        errorHandled = true;
                        resolve();
                    });
            });
            
            assert.strictEqual(errorHandled, true);
        });

        if (backend.config.type !== 'azure') {
            it(`${backend.name} should set tags and then delete it`, async () => {
                const key = 'externalBackendTestKey';
                const bucketData = {
                    _name: 'externalBackendTestBucket',
                    _owner: 'abcdef0123456789',
                    _ownerDisplayName: 'UnitTestOwner',
                    _creationDate: '2021-10-05T08:59:12.546Z',
                };
                const bucket = BucketInfo.fromObj(bucketData);
                const objectMd = {
                    tags: {
                        Key1: 'value_1',
                        Key2: 'value_2',
                    },
                    location: [
                        {
                            dataStoreVersionId: 'latestversion',
                        },
                    ],
                };

                await objectPutTaggingAsync(key, bucket.getName(), objectMd, log);
                await objectDeleteTaggingAsync(key, bucket.getName(), objectMd, log);
            });

            it(`${backend.name} should fail to set tag on missing key`, async () => {
                const key = 'externalBackendMissingKey';
                const bucketData = {
                    _name: 'externalBackendTestBucket',
                    _owner: 'abcdef0123456789',
                    _ownerDisplayName: 'UnitTestOwner',
                    _creationDate: '2021-10-05T08:59:12.546Z',
                };
                const bucket = BucketInfo.fromObj(bucketData);
                const objectMD = {
                    tags: {
                        Key1: 'value_1',
                    },
                    location: [
                        {
                            dataStoreVersionId: 'latestversion',
                        },
                    ],
                };

                try {
                    await objectPutTaggingAsync(key, bucket.getName(), objectMD, log);
                    await objectDeleteTaggingAsync(key, bucket.getName(), objectMD, log);
                    assert.fail('Expected an error to be thrown');
                } catch (err) {
                    assert(err.is.ServiceUnavailable);
                }
            });
        }
        // To-Do: test the other external client methods (delete, createMPU ...)
    });
});
