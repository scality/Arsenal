const assert = require('assert');
const sinon = require('sinon');
const { default: MD5Sum } = require('../../../../lib/s3middleware/MD5Sum');
const { default: NullStream } = require('../../../../lib/s3middleware/nullStream');
const DataWrapper = require('../../../../lib/storage/data/DataWrapper');
const BucketInfo = require('../../../../lib/models/BucketInfo').default;
const PassThrough = require('stream').PassThrough;

describe('DataWrapper', () => {
    let sandbox;
    let dataWrapper;
    let mockClient;
    let mockKms;
    let mockConfig;
    let mockMetadata;
    let mockLocStorageCheckFn;
    let mockVault;
    let log;

    beforeEach(() => {
        sandbox = sinon.createSandbox();

        mockClient = {
            put: sandbox.stub(),
            get: sandbox.stub(),
            delete: sandbox.stub(),
            batchDelete: sandbox.stub(),
            head: sandbox.stub(),
            healthcheck: sandbox.stub(),
            getDiskUsage: sandbox.stub(),
            copyObject: sandbox.stub(),
            uploadPartCopy: sandbox.stub(),
            uploadPart: sandbox.stub(),
            createMPU: sandbox.stub(),
            completeMPU: sandbox.stub(),
            abortMPU: sandbox.stub(),
            listParts: sandbox.stub(),
            objectTagging: sandbox.stub(),
            protectAzureBlocks: sandbox.stub(),
        };

        mockKms = {
            createCipherBundle: sandbox.stub(),
            createDecipherBundle: sandbox.stub(),
        };

        mockConfig = {
            backends: { data: 'multiple' },
            locationConstraints: {
                testLocation: { type: 'scality' },
                awsLocation: { type: 'aws_s3' },
            },
            getLocationConstraintType: sandbox.stub().returns('scality'),
            isSameAzureAccount: sandbox.stub().returns(false),
        };

        mockMetadata = {};
        mockLocStorageCheckFn = sandbox.stub();
        mockVault = {};
        log = {
            debug: sandbox.stub(),
            error: sandbox.stub(),
            info: sandbox.stub(),
            trace: sandbox.stub(),
            end: sandbox.stub().returnsThis(),
            getSerializedUids: sandbox.stub().returns('test-uid'),
            newRequestLoggerFromSerializedUids: sandbox.stub().returns({
                debug: sandbox.stub(),
                error: sandbox.stub(),
                end: sandbox.stub().returnsThis(),
            }),
        };

        dataWrapper = new DataWrapper(
            mockClient,
            'multipleBackends',
            mockConfig,
            mockKms,
            mockMetadata,
            mockLocStorageCheckFn,
            mockVault,
        );
    });

    afterEach(() => {
        sandbox.restore();
    });

    describe('put', () => {
        it('should handle successful put', done => {
            const cipherBundle = { cipher: new PassThrough() };
            const value = new PassThrough();
            const backendInfo = { getControllingLocationConstraint: () => 'testLocation' };
            const dataRetrievalInfo = { key: 'test-key', dataStoreName: 'test' };
            const hashedStream = new MD5Sum();
            sandbox.stub(hashedStream, 'on').callsFake((event, cb) => {
                if (event === 'hashed') cb();
                return hashedStream;
            });

            mockLocStorageCheckFn.callsFake((loc, size, log, cb) => process.nextTick(() => cb(null)));
            mockClient.put.callsFake((stream, size, ctx, info, uid, cb) => {
                // eslint-disable-next-line no-param-reassign
                stream.completedHash = 'mock-hash';
                process.nextTick(() => cb(null, dataRetrievalInfo));
            });

            dataWrapper.put(cipherBundle, value, 100, {}, backendInfo, log, (err, result, returnedStream) => {
                assert.strictEqual(err, null);
                assert.deepStrictEqual(result, dataRetrievalInfo);
                assert(returnedStream instanceof MD5Sum);
                done();
            });
        });

        it('should handle put error with location metric decrement', done => {
            const backendInfo = { getControllingLocationConstraint: () => 'testLocation' };

            mockLocStorageCheckFn.onCall(0).callsFake((loc, size, log, cb) => process.nextTick(() => cb(null)));
            mockLocStorageCheckFn.onCall(1).callsFake((loc, size, log, cb) => process.nextTick(() => cb(null)));
            mockClient.put.callsFake((stream, size, ctx, info, uid, cb) => {
                process.nextTick(() => cb(new Error('Put failed')));
            });

            dataWrapper.put(null, new PassThrough(), 100, {}, backendInfo, log, err => {
                assert(err.is.ServiceUnavailable);
                assert(mockLocStorageCheckFn.calledWith('testLocation', -100));
                done();
            });
        });
    });

    describe('head', () => {
        it('should skip if not multipleBackends', done => {
            const wrapper = new DataWrapper(
                mockClient,
                'scality',
                mockConfig,
                mockKms,
                mockMetadata,
                mockLocStorageCheckFn,
                mockVault,
            );
            wrapper.head({}, log, err => {
                assert.strictEqual(err, undefined);
                assert(!mockClient.head.called);
                done();
            });
        });

        it('should call client.head for multipleBackends', done => {
            mockClient.head.callsFake((info, uid, cb) => process.nextTick(() => cb(null)));
            dataWrapper.head('test-info', log, err => {
                assert.strictEqual(err, null);
                assert(mockClient.head.calledWith('test-info', 'test-uid'));
                done();
            });
        });
    });

    describe('get', () => {
        it('should handle null key with NullStream', done => {
            dataWrapper.get({ key: null, size: 100 }, null, log, (err, stream) => {
                assert.strictEqual(err, null);
                assert(stream instanceof NullStream);
                done();
            });
        });

        it('should handle successful get with decryption', done => {
            const objectGetInfo = {
                key: 'test-key',
                cipheredDataKey: Buffer.from('test').toString('base64'),
                cryptoScheme: 1,
                masterKeyId: 'test-id',
            };
            const decipherBundle = { decipher: new PassThrough() };
            mockClient.get.callsFake((info, range, uid, cb) => process.nextTick(() => cb(null, new PassThrough())));
            mockKms.createDecipherBundle.callsFake((sse, offset, log, cb) =>
                process.nextTick(() => cb(null, decipherBundle)),
            );

            dataWrapper.get(objectGetInfo, null, log, (err, stream) => {
                assert.strictEqual(err, null);
                assert.strictEqual(stream, decipherBundle.decipher);
                done();
            });
        });
    });

    describe('delete', () => {
        it('should handle null key', done => {
            dataWrapper.delete({ key: null }, log, err => {
                assert.strictEqual(err, null);
                done();
            });
        });

        it('should retry on delete failure', done => {
            mockClient.delete
                .onCall(0)
                .callsFake((info, uid, cb) => process.nextTick(() => cb(new Error('First fail'))));
            mockClient.delete.onCall(1).callsFake((info, uid, cb) => process.nextTick(() => cb(null)));
            mockLocStorageCheckFn.callsFake((loc, size, log, cb) => process.nextTick(() => cb(null)));

            dataWrapper.delete({ key: 'test-key', size: 100, dataStoreName: 'test' }, log, err => {
                assert.strictEqual(err, null);
                assert(mockClient.delete.calledTwice);
                done();
            });
        });
    });

    describe('batchDelete', () => {
        it('should skip delete when conditions met', done => {
            const locations = [{ dataStoreType: 'aws_s3', dataStoreName: 'test' }];
            dataWrapper.batchDelete(locations, 'PUT', 'test', log, err => {
                assert.strictEqual(err, undefined);
                assert(!mockClient.batchDelete.called);
                done();
            });
        });

        it('should use batchDelete for multiple scality locations', done => {
            const locations = [
                { key: 'key1', dataStoreName: 'test' },
                { key: 'key2', dataStoreName: 'test' },
            ];
            mockClient.batchDelete.callsFake((name, keys, log, cb) => process.nextTick(() => cb(null)));
            mockConfig.getLocationConstraintType.returns('scality');

            dataWrapper.batchDelete(locations, 'DELETE', 'new', log, err => {
                assert.strictEqual(err, null);
                assert(mockClient.batchDelete.calledWith('test', { keys: ['key1', 'key2'] }));
                done();
            });
        });
    });

    describe('checkHealth', () => {
        it('should return default OK when no healthcheck', done => {
            delete mockClient.healthcheck;
            dataWrapper.checkHealth(log, (err, result) => {
                assert.strictEqual(err, null);
                assert.deepStrictEqual(result, { multipleBackends: { code: 200, message: 'OK' } });
                done();
            });
        });

        it('should handle healthcheck error', done => {
            mockClient.healthcheck.callsFake((startup, log, cb) =>
                process.nextTick(() => cb(new Error('Health fail'))),
            );
            dataWrapper.checkHealth(log, (err, result) => {
                assert.strictEqual(err, null);
                assert(result.multipleBackends.error);
                done();
            });
        });
    });

    describe('getDiskUsage', () => {
        it('should return empty object when no getDiskUsage', done => {
            delete mockClient.getDiskUsage;
            dataWrapper.getDiskUsage(log, (err, result) => {
                assert.strictEqual(err, null);
                assert.deepStrictEqual(result, {});
                done();
            });
        });

        it('should call client.getDiskUsage when implemented', done => {
            mockClient.getDiskUsage.callsFake((config, uid, cb) =>
                process.nextTick(() => cb(null, { usage: '100MB' })),
            );
            dataWrapper.getDiskUsage(log, (err, result) => {
                assert.strictEqual(err, null);
                assert.deepStrictEqual(result, { usage: '100MB' });
                done();
            });
        });
    });

    describe('uploadPartCopy', () => {
        let mockBucketMD;
        const sse = null;

        beforeEach(() => {
            mockBucketMD = {};
        });

        it('should handle zero byte object', done => {
            dataWrapper.uploadPartCopy(
                {},
                log,
                mockBucketMD,
                'source',
                'dest',
                [],
                {},
                null,
                sse,
                (err, eTag, lastModified) => {
                    assert.strictEqual(err, null);
                    assert.strictEqual(eTag, 'd41d8cd98f00b204e9800998ecf8427e');
                    assert(typeof lastModified === 'string');
                    done();
                },
            );
        });

        it('should handle same-type location copy', done => {
            mockConfig.getLocationConstraintType.withArgs('source').returns('aws_s3');
            mockConfig.getLocationConstraintType.withArgs('dest').returns('aws_s3');
            mockClient.uploadPartCopy.callsFake((req, dest, srcKey, srcLoc, config, log, cb) =>
                process.nextTick(() => cb(null, 'test-etag')),
            );

            dataWrapper.uploadPartCopy(
                {},
                log,
                mockBucketMD,
                'source',
                'dest',
                [{ key: 'source-key' }],
                {},
                null,
                sse,
                (err, eTag) => {
                    assert.strictEqual(err, null);
                    assert.strictEqual(eTag, 'test-etag');
                    done();
                },
            );
        });
    });

    describe('MPU Operations', () => {
        it('should initiate MPU', done => {
            mockClient.createMPU.callsFake(
                (key, headers, bucket, redirect, loc, contentType, cache, disp, enc, tag, log, cb) =>
                    process.nextTick(() => cb(null, { uploadId: 'test-id' })),
            );
            dataWrapper.initiateMPU(
                { objectKey: 'key', bucketName: 'bucket', locConstraint: 'test' },
                null,
                log,
                (err, result) => {
                    assert.strictEqual(err, null);
                    assert.deepStrictEqual(result, { uploadId: 'test-id' });
                    done();
                },
            );
        });

        it('should complete MPU', done => {
            mockClient.completeMPU.callsFake((key, id, loc, list, mdInfo, bucket, userMD, content, tag, log, cb) =>
                process.nextTick(() => cb(null, { key: 'completed-key' })),
            );
            dataWrapper.completeMPU(
                {},
                { objectKey: 'key', uploadId: 'id', jsonList: {}, bucketName: 'bucket' },
                {},
                'test',
                {},
                {},
                null,
                null,
                log,
                (err, result) => {
                    assert.strictEqual(err, null);
                    assert.deepStrictEqual(result, { key: 'completed-key' });
                    done();
                },
            );
        });

        it('should abort MPU', done => {
            mockClient.abortMPU.callsFake((key, id, loc, bucket, log, cb) => process.nextTick(() => cb(null)));
            dataWrapper.abortMPU('key', 'id', 'test', 'bucket', {}, {}, null, log, err => {
                assert.strictEqual(err, null);
                done();
            });
        });
    });

    describe('_put', () => {
        it('should handle successful put with encryption', done => {
            const cipherBundle = { cipher: new PassThrough() };
            const dataRetrievalInfo = { key: 'test-key', dataStoreName: 'test' };
            mockClient.put.callsFake((stream, size, ctx, info, uid, cb) => {
                // eslint-disable-next-line no-param-reassign
                stream.completedHash = 'mock-hash';
                process.nextTick(() => cb(null, dataRetrievalInfo));
            });

            dataWrapper._put(cipherBundle, new PassThrough(), 100, {}, {}, log, (err, result, returnedStream) => {
                assert.strictEqual(err, null);
                assert.deepStrictEqual(result, dataRetrievalInfo);
                assert(returnedStream instanceof MD5Sum);
                done();
            });
        });

        it('should handle put error', done => {
            mockClient.put.callsFake((stream, size, ctx, info, uid, cb) =>
                process.nextTick(() => cb({ httpCode: 408 })),
            );
            dataWrapper._put(null, new PassThrough(), 100, {}, {}, log, err => {
                assert(err.is.IncompleteBody);
                done();
            });
        });
    });

    describe('_retryDelete', () => {
        it('should succeed after retry', done => {
            mockClient.delete
                .onCall(0)
                .callsFake((info, uid, cb) => process.nextTick(() => cb(new Error('First fail'))));
            mockClient.delete.onCall(1).callsFake((info, uid, cb) => process.nextTick(() => cb(null)));

            dataWrapper._retryDelete('test-key', log, 0, err => {
                assert.strictEqual(err, undefined);
                assert(mockClient.delete.calledTwice);
                done();
            });
        });

        it('should fail after max retries', done => {
            mockClient.delete.callsFake((info, uid, cb) => process.nextTick(() => cb(new Error('Persistent fail'))));
            dataWrapper._retryDelete('test-key', log, 0, err => {
                assert(err.is.InternalError);
                assert(mockClient.delete.calledThrice);
                done();
            });
        });
    });

    describe('copyObject', () => {
        const request = {};
        const storeMetadataParams = {
            dataStoreName: 'destBackend',
            size: 100,
        };
        const dataLocator = [
            {
                key: 'sourceKey',
                dataStoreETag: 'etag',
                start: 0,
                size: 100,
            },
        ];
        const dataStoreContext = {
            bucketName: 'destBucket',
            owner: 'owner',
            namespace: 'namespace',
            objectKey: 'destKey',
        };
        const destBackendInfo = {
            getControllingLocationConstraint: () => 'destBackend',
        };
        const sourceBucketMD = new BucketInfo(
            'sourceBucket',
            'owner',
            'source-display-name',
            new Date().toJSON(),
            null,
            null,
            null,
            null,
            null,
            null,
            '',
        );
        const destBucketMD = new BucketInfo(
            'destBucket',
            'owner',
            'dest-display-name',
            new Date().toJSON(),
            null,
            null,
            null,
            null,
            null,
            null,
            'location-constraint',
        );
        const _ = sinon.match.any;

        beforeEach(() => {
            mockLocStorageCheckFn.yields(null);
        });

        it('should call client.copyObject for external backend copy', done => {
            mockConfig.getLocationConstraintType.returns('aws_s3');
            mockClient.copyObject.yields(null, {
                key: 'copiedKey',
                dataStoreName: 'destBackend',
                dataStoreType: 'aws_s3',
                dataStoreVersionId: 'versionId',
            });

            dataWrapper.copyObject(
                request,
                'sourceBackend',
                storeMetadataParams,
                dataLocator,
                dataStoreContext,
                destBackendInfo,
                sourceBucketMD,
                destBucketMD,
                null,
                log,
                (err, result) => {
                    assert.strictEqual(err, null);
                    assert.strictEqual(result[0].key, 'copiedKey');
                    assert.strictEqual(result[0].dataStoreVersionId, 'versionId');
                    assert(
                        mockClient.copyObject.calledWith(
                            request,
                            'destBackend',
                            'sourceKey',
                            undefined,
                            'sourceBackend',
                            storeMetadataParams,
                            mockConfig,
                            log,
                        ),
                    );
                    done();
                },
            );
        });

        it('should handle client copy error', done => {
            const copyErr = new Error('Copy failed');

            mockConfig.getLocationConstraintType.returns('aws_s3');
            mockClient.copyObject.yields(copyErr);

            dataWrapper.copyObject(
                request,
                'sourceBackend',
                storeMetadataParams,
                dataLocator,
                dataStoreContext,
                destBackendInfo,
                sourceBucketMD,
                destBucketMD,
                undefined,
                log,
                err => {
                    assert(err instanceof Error);
                    assert.strictEqual(err, copyErr);
                    done();
                },
            );
        });

        it('should handle regular copy through get/put', done => {
            mockClient.get.withArgs(dataLocator[0]).yields(null); // Successful get, but no stream (empty object)
            mockClient.put
                .withArgs(_, 100, dataStoreContext, destBackendInfo)
                .yields(null, { key: 'copiedKey', dataStoreName: 'destBackend' });

            dataWrapper.copyObject(
                request,
                'sourceBackend',
                storeMetadataParams,
                dataLocator,
                dataStoreContext,
                destBackendInfo,
                sourceBucketMD,
                destBucketMD,
                null,
                log,
                (err, results) => {
                    assert.strictEqual(err, null);
                    assert.strictEqual(results[0].key, 'copiedKey');
                    assert(!mockClient.copyObject.called);
                    assert(mockClient.get.calledOnce);
                    assert(mockClient.put.calledOnce);
                    done();
                },
            );
        });

        it('should not use client.copyObject with different location constraint types', done => {
            mockConfig.getLocationConstraintType.withArgs('sourceBackend').returns('aws_s3');
            mockConfig.getLocationConstraintType.withArgs('destBackend').returns('gcp');

            mockClient.get.withArgs(dataLocator[0]).yields(null); // Successful get, but no stream (empty object)
            mockClient.put
                .withArgs(_, 100, dataStoreContext, destBackendInfo)
                .yields(null, { key: 'copiedKey', dataStoreName: 'destBackend' });

            dataWrapper.copyObject(
                request,
                'sourceBackend',
                storeMetadataParams,
                dataLocator,
                dataStoreContext,
                destBackendInfo,
                sourceBucketMD,
                destBucketMD,
                null,
                log,
                (err, results) => {
                    assert.strictEqual(err, null);
                    assert.strictEqual(results[0].key, 'copiedKey');
                    assert(!mockClient.copyObject.called);
                    assert(mockClient.get.calledOnce);
                    assert(mockClient.put.calledOnce);
                    done();
                },
            );
        });

        it('should not use client.copyObject with encryption', done => {
            mockConfig.getLocationConstraintType.returns('aws_s3');

            const serverSideEncryption = { algorithm: 'AES256' };
            mockKms.createCipherBundle.yields(null, { cipher: new PassThrough() });

            mockClient.get.withArgs(dataLocator[0]).yields(null); // Successful get, but no stream (empty object)
            mockLocStorageCheckFn.yields(null);
            mockClient.put
                .withArgs(_, 100, dataStoreContext, destBackendInfo)
                .yields(null, { key: 'copiedKey', dataStoreName: 'destBackend' });

            dataWrapper.copyObject(
                request,
                'sourceBackend',
                storeMetadataParams,
                dataLocator,
                dataStoreContext,
                destBackendInfo,
                sourceBucketMD,
                destBucketMD,
                serverSideEncryption,
                log,
                err => {
                    assert.strictEqual(err, null);
                    assert(!mockClient.copyObject.called);
                    assert(mockClient.get.calledOnce);
                    assert(mockClient.put.calledOnce);
                    done();
                },
            );
        });

        it('shoud handle get error', done => {
            const copyErr = new Error('Copy failed');

            mockClient.get.withArgs(dataLocator[0]).yields(copyErr);

            dataWrapper.copyObject(
                request,
                'sourceBackend',
                storeMetadataParams,
                dataLocator,
                dataStoreContext,
                destBackendInfo,
                sourceBucketMD,
                destBucketMD,
                null,
                log,
                err => {
                    assert(err instanceof Error);
                    assert(err.is.ServiceUnavailable);
                    done();
                },
            );
        });

        it('shoud handle put error', done => {
            const copyErr = new Error('Copy failed');

            mockClient.get.withArgs(dataLocator[0]).yields(null); // Successful get, but no stream (empty object)
            mockClient.put.withArgs(_, 100, dataStoreContext, destBackendInfo).yields(copyErr);

            dataWrapper.copyObject(
                request,
                'sourceBackend',
                storeMetadataParams,
                dataLocator,
                dataStoreContext,
                destBackendInfo,
                sourceBucketMD,
                destBucketMD,
                null,
                log,
                err => {
                    assert(err instanceof Error);
                    assert(err.is.ServiceUnavailable);
                    done();
                },
            );
        });

        it('should handle Azure copy with parallel get/put', done => {
            const azureDataLocator = [
                {
                    ...dataLocator[0],
                    dataStoreType: 'azure',
                },
            ];

            mockClient.get.withArgs(azureDataLocator[0]).yields(null); // Successful get, but no stream (empty object)
            mockClient.put
                .withArgs(_, 100, dataStoreContext, destBackendInfo)
                .callsFake((stream, size, ctx, info, uid, cb) =>
                    stream._flush(() => cb(null, { key: 'azureKey', dataStoreName: 'destBackend' })),
                );

            dataWrapper.copyObject(
                request,
                'sourceBackend',
                storeMetadataParams,
                azureDataLocator,
                dataStoreContext,
                destBackendInfo,
                sourceBucketMD,
                destBucketMD,
                null,
                log,
                (err, results) => {
                    assert.strictEqual(err, null);
                    assert.strictEqual(results[0].key, 'azureKey');
                    assert(mockClient.get.calledOnce);
                    assert(mockClient.put.calledOnce);
                    done();
                },
            );
        });
    });
});
