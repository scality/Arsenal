const assert = require('assert');
const async = require('async');
const stream = require('stream');

const AwsClient = require('../../../../../lib/storage/data/external/AwsClient');
const GcpClient = require('../../../../../lib/storage/data/external/GcpClient');
const AzureClient =
    require('../../../../../lib/storage/data/external/AzureClient');
const DummyService = require('../DummyService');
const { DummyRequestLogger } = require('../../../helpers');
const BucketInfo = require('../../../../../lib/models/BucketInfo');

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

        beforeAll(() => {
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

        it(`${backend.name} get() should not call the callback again on stream error`, done => {
            testClient.get({
                key: 'externalBackendTestBucket/externalBackendTestKey',
                dataStoreName: backend.config.dataStoreName,
                response: new stream.PassThrough(),
            }, [10000000, 20000000], '', (err, readable) => {
                // a stream error should not trigger this callback again with an error
                assert.ifError(err);
                readable
                    .once('data', () => readable.emit('error', new Error('OOPS')))
                    .on('error', err => {
                        assert.strictEqual(err.message, 'OOPS');
                        done();
                    });
            });
        });

        if (backend.config.type !== 'azure') {
            it(`${backend.name} should set tags and then delete it`, done => {
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
                async.series([
                    next => testClient.objectPutTagging(key.key, bucket.getName(), objectMd, log, next),
                    next => testClient.objectDeleteTagging(key.Key, bucket.getName(), objectMd, log, next),
                ], done);
            });

            it(`${backend.name} should fail to set tag on missing key`, done => {
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
                async.series(
                    [
                        next => testClient.objectPutTagging(key, bucket.getName(), objectMD, log, (err) => {
                            assert(err.ServiceUnavailable);
                            next();
                        }),
                        next => testClient.objectDeleteTagging(key, bucket.getName(), objectMD, log, (err) => {
                            assert(err.ServiceUnavailable);
                            next();
                        }),
                    ],
                    done,
                );
            });
        }
        // To-Do: test the other external client methods (delete, createMPU ...)
    });
});
