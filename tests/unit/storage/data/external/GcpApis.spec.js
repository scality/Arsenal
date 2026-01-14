const assert = require('assert');
const sinon = require('sinon');
const { ListObjectsCommand, ListObjectVersionsCommand } = require('@aws-sdk/client-s3');

const { createMpuKey } = require('../../../../../lib/storage/data/external/GCP/GcpUtils');
const MpuHelper = require('../../../../../lib/storage/data/external/GCP/GcpApis/mpuHelper');

const listParts = require('../../../../../lib/storage/data/external/GCP/GcpApis/listParts');
const abortMultipartUpload = require('../../../../../lib/storage/data/external/GCP/GcpApis/abortMultipartUpload');
const completeMultipartUpload = require('../../../../../lib/storage/data/external/GCP/GcpApis/completeMultipartUpload');

describe('GcpApis', () => {
    let sandbox;

    beforeEach(() => {
        sandbox = sinon.createSandbox();
    });

    afterEach(() => {
        sandbox.restore();
    });

    describe('listParts', () => {
        it('should list parts', done => {
            const send = sandbox.stub().resolves({ Contents: [] });
            const service = { send };

            const params = {
                Bucket: 'b',
                Key: 'obj',
                UploadId: 'upload',
                PartNumberMarker: 3,
                MaxParts: 10,
            };

            listParts.call(service, params, (err, res) => {
                assert.ifError(err);
                assert(res);
                assert(send.calledOnce);
                const [command] = send.firstCall.args;
                assert(command instanceof ListObjectsCommand);
                assert.deepStrictEqual(command.input, {
                    Bucket: params.Bucket,
                    Prefix: createMpuKey(params.Key, params.UploadId, 'parts'),
                    Marker: createMpuKey(params.Key, params.UploadId,
                        params.PartNumberMarker, 'parts'),
                    MaxKeys: params.MaxParts,
                });
                done();
            });
        });

        it('should return error when listParts fails', done => {
            const listObjectsError = new Error('send(ListObjectsCommand) failed');
            const service = { send: sandbox.stub().rejects(listObjectsError) };

            listParts.call(service, {
                Bucket: 'b',
                Key: 'obj',
                UploadId: 'upload',
            }, err => {
                assert.strictEqual(err, listObjectsError);
                done();
            });
        });
    });

    describe('mpuHelper', () => {
        describe('removeParts', () => {
            it('should list versions and delete each version', done => {
                const service = {
                    _maxConcurrent: 10,
                    send: sandbox.stub()
                        .onCall(0).callsFake(command => {
                            assert(command instanceof ListObjectVersionsCommand);
                            assert.deepStrictEqual(command.input, {
                                Bucket: 'mpu-bucket',
                                Prefix: 'pfx/',
                                KeyMarker: undefined,
                                VersionIdMarker: undefined,
                            });
                            return Promise.resolve({
                                IsTruncated: true,
                                NextKeyMarker: 'k2',
                                NextVersionIdMarker: 'v2',
                                Versions: [
                                    { Key: 'a', VersionId: '1' },
                                ],
                            });
                        })
                        .onCall(1).callsFake(command => {
                            assert(command instanceof ListObjectVersionsCommand);
                            assert.deepStrictEqual(command.input, {
                                Bucket: 'mpu-bucket',
                                Prefix: 'pfx/',
                                KeyMarker: 'k2',
                                VersionIdMarker: 'v2',
                            });
                            return Promise.resolve({
                                IsTruncated: false,
                                NextKeyMarker: undefined,
                                NextVersionIdMarker: undefined,
                                Versions: [
                                    { Key: 'b', VersionId: '2' },
                                    { Key: 'c', VersionId: '3' },
                                ],
                            });
                        }),
                    deleteObject: sandbox.stub().callsFake((params, cb) => cb(null)),
                };

                const helper = new MpuHelper(service);
                helper.removeParts({ MPU: 'mpu-bucket', Prefix: 'pfx/' }, err => {
                    assert.ifError(err);
                    assert(service.send.calledTwice);
                    assert.strictEqual(service.deleteObject.callCount, 3);
                    assert.deepStrictEqual(service.deleteObject.getCall(0).args[0], {
                        Bucket: 'mpu-bucket',
                        Key: 'a',
                        VersionId: '1',
                    });
                    done();
                });
            });

            it('should ignore NoSuchKey errors during delete', done => {
                const service = {
                    _maxConcurrent: 10,
                    send: sandbox.stub().resolves({
                        IsTruncated: false,
                        Versions: [
                            { Key: 'a', VersionId: '1' },
                            { Key: 'b', VersionId: '2' },
                        ],
                    }),
                    deleteObject: sandbox.stub().callsFake((params, cb) => {
                        if (params.Key === 'a') {
                            const err = new Error('gone');
                            err.name = 'NoSuchKey';
                            return cb(err);
                        }
                        return cb(null);
                    }),
                };

                const helper = new MpuHelper(service);
                helper.removeParts({ MPU: 'mpu-bucket', Prefix: 'pfx/' }, err => {
                    assert.ifError(err);
                    assert(service.send.calledOnce);
                    assert.strictEqual(service.deleteObject.callCount, 2);
                    done();
                });
            });

            it('should return error when listVersions fails', done => {
                const listObjectVersionsError = new Error('send(ListObjectVersionsCommand) failed');
                const service = {
                    _maxConcurrent: 10,
                    send: sandbox.stub().callsFake(command => {
                        assert(command instanceof ListObjectVersionsCommand);
                        return Promise.reject(listObjectVersionsError);
                    }),
                    deleteObject: sandbox.stub(),
                };

                const helper = new MpuHelper(service);
                helper.removeParts({ MPU: 'mpu-bucket', Prefix: 'pfx/' }, err => {
                    assert.strictEqual(err, listObjectVersionsError);
                    assert(service.deleteObject.notCalled);
                    done();
                });
            });
        });
    });

    describe('abortMultipartUpload', () => {
        it('should reject missing parameters', done => {
            abortMultipartUpload.call({}, { Bucket: 'b' }, err => {
                assert(err);
                assert(err.is.InvalidRequest);
                done();
            });
        });

        it('should call removeParts with derived Prefix', done => {
            const removeStub = sandbox.stub(MpuHelper.prototype, 'removeParts')
                .callsFake((_delParams, cb) => cb(null));

            const params = {
                Bucket: 'b',
                MPU: 'mpu-b',
                Key: 'obj',
                UploadId: 'upload',
            };

            abortMultipartUpload.call({}, params, err => {
                assert.ifError(err);
                assert(removeStub.calledOnce);
                assert.deepStrictEqual(removeStub.firstCall.args[0], {
                    Bucket: params.Bucket,
                    MPU: params.MPU,
                    Prefix: createMpuKey(params.Key, params.UploadId),
                });
                done();
            });
        });
    });

    describe('completeMultipartUpload', () => {
        it('should reject missing parameters', done => {
            completeMultipartUpload.call({}, { Bucket: 'b' }, err => {
                assert(err);
                assert(err.is.InvalidRequest);
                done();
            });
        });

        it('should reject empty parts list', done => {
            completeMultipartUpload.call({}, {
                Bucket: 'b',
                MPU: 'mpu-b',
                Key: 'obj',
                UploadId: 'upload',
                MultipartUpload: { Parts: [] },
            }, err => {
                assert(err);
                assert(err.is.InvalidRequest);
                done();
            });
        });

        it('should reject invalid part order', done => {
            completeMultipartUpload.call({}, {
                Bucket: 'b',
                MPU: 'mpu-b',
                Key: 'obj',
                UploadId: 'upload',
                MultipartUpload: {
                    Parts: [
                        { PartNumber: 2 },
                        { PartNumber: 1 },
                    ],
                },
            }, err => {
                assert(err);
                assert.strictEqual(err.message, 'InvalidPartOrder');
                done();
            });
        });

        it('should run MPU flow and remove parts', done => {
            sandbox.stub(console, 'log').callsFake(() => undefined);

            const splitMergeStub = sandbox.stub(MpuHelper.prototype, 'splitMerge')
                .callsFake((params, partList, level, cb) => cb(null, 2));
            const composeFinalStub = sandbox.stub(MpuHelper.prototype, 'composeFinal')
                .callsFake((numParts, params, cb) => cb(null, 'finalKey'));
            const generateStub = sandbox.stub(MpuHelper.prototype, 'generateMpuResult')
                .callsFake((result, partList, cb) => cb(null, result, 'aggEtag'));
            const copyStub = sandbox.stub(MpuHelper.prototype, 'copyToMain')
                .callsFake((result, aggregateETag, params, cb) => cb(null, {
                    Bucket: params.Bucket,
                    Key: params.Key,
                    VersionId: 'v1',
                    ETag: '"aggEtag"',
                }));
            const removeStub = sandbox.stub(MpuHelper.prototype, 'removeParts')
                .callsFake((_delParams, cb) => cb(null));

            const params = {
                Bucket: 'b',
                MPU: 'mpu-b',
                Key: 'obj',
                UploadId: 'upload',
                MultipartUpload: {
                    Parts: [
                        { PartNumber: 1 },
                        { PartNumber: 2 },
                    ],
                },
            };

            completeMultipartUpload.call({}, params, (err, res) => {
                assert.ifError(err);
                assert(res);
                assert.strictEqual(res.Bucket, params.Bucket);
                assert.strictEqual(res.Key, params.Key);

                assert(splitMergeStub.calledOnce);
                assert(composeFinalStub.calledOnce);
                assert(generateStub.calledOnce);
                assert(copyStub.calledOnce);
                assert(removeStub.calledOnce);
                assert.deepStrictEqual(removeStub.firstCall.args[0], {
                    Bucket: params.Bucket,
                    MPU: params.MPU,
                    Prefix: createMpuKey(params.Key, params.UploadId),
                });
                done();
            });
        });
    });
});

