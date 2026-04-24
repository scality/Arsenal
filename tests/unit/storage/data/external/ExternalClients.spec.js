const assert = require('assert');
const stream = require('stream');
const sinon = require('sinon');
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
const awsPartChecksumFields = [
    ['ChecksumCRC32', 'crc32', 'crc32-value'],
    ['ChecksumCRC32C', 'crc32c', 'crc32c-value'],
    ['ChecksumCRC64NVME', 'crc64nvme', 'crc64-value'],
    ['ChecksumSHA1', 'sha1', 'sha1-value'],
    ['ChecksumSHA256', 'sha256', 'sha256-value'],
];
const log = new DummyRequestLogger();
let sandbox;

describe('external backend clients', () => {
    beforeEach(() => {
        sandbox = sinon.createSandbox();
    });

    afterEach(() => {
        sandbox.restore();
    });

    backendClients.forEach(backend => {
        let testClient;
        let headAsync, getAsync, deleteAsync, objectPutTaggingAsync, objectDeleteTaggingAsync,
            createMPUAsync, uploadPartAsync, abortMPUAsync, listPartsAsync;

        beforeAll(() => {
            testClient = new backend.Class(backend.config);
            testClient._client = new DummyService({ versioning: true });
            
            // Promisify the client methods
            headAsync = promisify(testClient.head.bind(testClient));
            getAsync = promisify(testClient.get.bind(testClient));
            deleteAsync = promisify(testClient.delete.bind(testClient));
            if (backend.config.type !== 'azure') {
                createMPUAsync = promisify(testClient.createMPU.bind(testClient));
                uploadPartAsync = promisify(testClient.uploadPart.bind(testClient));
                abortMPUAsync = promisify(testClient.abortMPU.bind(testClient));
                objectPutTaggingAsync = promisify(testClient.objectPutTagging.bind(testClient));
                objectDeleteTaggingAsync = promisify(testClient.objectDeleteTagging.bind(testClient));
            }
            if (backend.config.type === 'aws') {
                listPartsAsync = promisify(testClient.listParts.bind(testClient));
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
                        if (err) {
                            return done(err);
                        }
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
            const streamToRead = readable;
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
            const readable = result
            let errorHandled = false;
            await new Promise(resolve => {
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

        it(`${backend.name} delete() should delete the requested key without error`, async () => {
            const key = 'externalBackendTestKey';
            const bucketName = 'externalBackendTestBucket';
            const objectInfo = Object.assign({
                deleteVersion: false,
            }, testClient.toObjectGetInfo(key, bucketName));
            const result = await deleteAsync(objectInfo, '');
            assert.strictEqual(result, undefined);
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

            it(`${backend.name} uploadPart() should return sanitized data retrieval info`, async () => {
                const key = 'externalBackendTestKey';
                const bucketName = 'externalBackendTestBucket';
                const result = await uploadPartAsync(null, null,
                    stream.Readable.from(['part data']),
                    9, key, 'uploadId-123', 1, bucketName, log);

                assert.strictEqual(result.key, `${bucketName}/${key}`);
                assert.strictEqual(result.dataStoreName, backend.config.dataStoreName);
                assert(result.dataStoreETag);
                assert.strictEqual(result.dataStoreETag.includes('"'), false);
            });

            it(`${backend.name} abortMPU() should resolve without error`, async () => {
                const key = 'externalBackendTestKey';
                const bucketName = 'externalBackendTestBucket';

                const result = await abortMPUAsync(key, 'uploadId-123', bucketName, log);
                assert.strictEqual(result, undefined);
            });

            if (backend.config.type === 'aws') {
                it(`${backend.name} listParts() should map result parts`, async () => {
                    const key = 'externalBackendTestKey';
                    const bucketName = 'externalBackendTestBucket';

                    const storedParts = await listPartsAsync(key, 'uploadId-123', bucketName, 0, 1000, log);

                    assert(Array.isArray(storedParts.Contents));
                    assert(storedParts.Contents.length > 0);
                    const firstPart = storedParts.Contents[0];
                    assert.strictEqual(typeof firstPart.partNumber, 'number');
                    assert(firstPart.value);
                    assert.strictEqual(firstPart.value.ETag.includes('"'), false);
                });

                awsPartChecksumFields.forEach(([checksumField, checksumAlgorithm, checksumValue]) => {
                    it(`${backend.name} listParts() should normalize ${checksumField}`, async () => {
                        const key = 'externalBackendTestKey';
                        const bucketName = 'externalBackendTestBucket';
                        const lastModified = new Date();
                        sandbox.stub(testClient._client, 'send').resolves({
                            IsTruncated: true,
                            Parts: [
                                {
                                    PartNumber: 1,
                                    ETag: '"part-etag-1"',
                                    Size: 1024,
                                    LastModified: lastModified,
                                    [checksumField]: checksumValue,
                                },
                            ],
                        });

                        const storedParts = await listPartsAsync(key, 'uploadId-123', bucketName, 0, 1000, log);

                        assert.strictEqual(storedParts.IsTruncated, true);
                        assert.strictEqual(storedParts.Contents.length, 1);
                        assert.deepStrictEqual(storedParts.Contents[0], {
                            partNumber: 1,
                            value: {
                                Size: 1024,
                                ETag: 'part-etag-1',
                                LastModified: lastModified,
                                ChecksumAlgorithm: checksumAlgorithm,
                                ChecksumValue: checksumValue,
                            },
                        });
                    });
                });

                it(`${backend.name} listParts() should omit absent checksum fields`, async () => {
                    const key = 'externalBackendTestKey';
                    const bucketName = 'externalBackendTestBucket';
                    sandbox.stub(testClient._client, 'send').resolves({
                        IsTruncated: false,
                        Parts: [
                            {
                                PartNumber: 2,
                                ETag: '"part-etag-2"',
                                Size: 2048,
                                LastModified: new Date(),
                            },
                        ],
                    });

                    const storedParts = await listPartsAsync(key, 'uploadId-123', bucketName, 0, 1000, log);
                    const { value } = storedParts.Contents[0];

                    assert.strictEqual(value.ETag, 'part-etag-2');
                    assert.strictEqual(value.ChecksumAlgorithm, undefined);
                    assert.strictEqual(value.ChecksumValue, undefined);
                });
            }

            it(`${backend.name} createMPU() should trim metadata and forward tagging`, async () => {
                const key = 'externalBackendTestKey';
                const bucketName = 'externalBackendTestBucket';
                const metaHeaders = {
                    'x-amz-meta-custom-key': 'customValue',
                    'x-amz-meta-second-key': 'secondValue',
                    ignored: 'shouldBeDropped',
                };
                const args = [
                    key,
                    metaHeaders,
                    bucketName,
                    'http://redirect',
                    'text/plain',
                    'max-age=3600',
                    'attachment',
                    'gzip',
                    'k1=v1&k2=v2',
                    log,
                ];

                if (backend.config.type === 'aws') {
                    const sendSpy = sandbox.spy(testClient._client, 'send');
                    const result = await createMPUAsync(...args);
                    assert(result);
                    assert(result.UploadId);
                    assert(sendSpy.calledOnce);
                    const command = sendSpy.firstCall.args[0];
                    assert.strictEqual(command.constructor.name, 'CreateMultipartUploadCommand');
                    assert.deepStrictEqual(command.input.Metadata, {
                        'custom-key': 'customValue',
                        'second-key': 'secondValue',
                    });
                    assert.strictEqual(command.input.Tagging, 'k1=v1&k2=v2');
                } else {
                    const createSpy = sandbox.spy(testClient._client, 'createMultipartUpload');
                    const result = await createMPUAsync(...args);
                    assert(result);
                    assert(result.UploadId);
                    assert(createSpy.calledOnce);
                    const capturedParams = createSpy.firstCall.args[0];
                    assert.strictEqual(capturedParams.Bucket, backend.config.mpuBucket);
                    assert.deepStrictEqual(capturedParams.Metadata, {
                        'custom-key': 'customValue',
                        'second-key': 'secondValue',
                    });
                    assert.strictEqual(capturedParams.Tagging, 'k1=v1&k2=v2');
                }
            });
        }
    });
});
