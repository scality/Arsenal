const assert = require('assert');
const http = require('http');
const { GCP } = require('../../../../../lib/storage/data/external/GCP');
const { ListObjectsCommand, ListObjectVersionsCommand, GetBucketVersioningCommand } = require('@aws-sdk/client-s3');
const MpuHelper = require('../../../../../lib/storage/data/external/GCP/GcpApis/mpuHelper');
const { createMpuKey } = require('../../../../../lib/storage/data/external/GCP/GcpUtils');

const httpPort = 8888;

// test values
const host = 'localhost:8888';
const Bucket = 'testrequestbucket';
const Key = 'testRequestKey';
const MultipartUpload = { Parts: [{ PartName: 'part' }] };
const CopySource = 'copyBucket/copyKey';
const accessKeyId = 'accesskey';
const secretAccessKey = 'secretaccesskey';

/**
 * Mock HTTP server handler for testing GCP client requests.
 * 
 * AWS SDK v3 is much stricter than v2 and requires:
 * 1. Proper HTTP status codes (200, 204, etc.)
 * 2. Valid XML response bodies for S3 operations (not just empty responses)
 * 3. Correct Content-Type headers
 * 
 * In v2, the SDK would accept empty responses (just `res.end()`), but v3
 * will throw "S3 aborted request" or XML parsing errors if the response
 * doesn't match the expected format for each operation.
 */
function handler(isPathStyle) {
    return (req, res) => {
        if (isPathStyle) {
            assert(req.headers.host, host);
            assert(req.url.includes(Bucket));
        } else {
            assert(req.headers.host, `${Bucket}.${host}`);
            assert(!req.url.includes(Bucket));
        }

        // Provide appropriate responses for AWS SDK v3
        res.setHeader('Content-Type', 'application/xml');

        if (req.method === 'HEAD') {
            res.writeHead(200);
            res.end();
        } else if (req.method === 'GET') {
            if (req.url.includes('versioning')) {
                // getBucketVersioning
                const xml = `<?xml version="1.0" encoding="UTF-8"?>
                <VersioningConfiguration xmlns="http://s3.amazonaws.com/doc/2006-03-01/"/>`;
                res.writeHead(200);
                res.end(xml);
            } else if (req.url.includes('versions')) {
                // listVersions
                const xml = `<?xml version="1.0" encoding="UTF-8"?>
                <ListVersionsResult xmlns="http://s3.amazonaws.com/doc/2006-03-01/">
                    <Name>testrequestbucket</Name>
                    <Prefix></Prefix>
                    <KeyMarker></KeyMarker>
                    <VersionIdMarker></VersionIdMarker>
                    <MaxKeys>1000</MaxKeys>
                    <IsTruncated>false</IsTruncated>
                </ListVersionsResult>`;
                res.writeHead(200);
                res.end(xml);
            } else {
                // Determine if this is a bucket-level operation (listObjects) or object-level (getObject)
                // For listObjects: URL should be either '/' (virtual-hosted) or '/{bucket}[/]' (path-style)
                // For getObject: URL should contain a key like '/{key}' or '/{bucket}/{key}'
                const urlWithoutQuery = req.url.split('?')[0];
                const isBucketOperation = urlWithoutQuery === '/' || 
                                         urlWithoutQuery === `/${Bucket}` || 
                                         urlWithoutQuery === `/${Bucket}/`;
                
                if (isBucketOperation) {
                    // listObjects - bucket-level request
                    const xml = `<?xml version="1.0" encoding="UTF-8"?>
                    <ListBucketResult xmlns="http://s3.amazonaws.com/doc/2006-03-01/">
                        <Name>testrequestbucket</Name>
                        <Prefix></Prefix>
                        <Marker></Marker>
                        <MaxKeys>1000</MaxKeys>
                        <IsTruncated>false</IsTruncated>
                    </ListBucketResult>`;
                    res.writeHead(200);
                    res.end(xml);
                } else {
                    // getObject - has a key in path
                    res.writeHead(200);
                    res.end('mock object data');
                }
            }
        } else if (req.method === 'PUT') {
            if (req.headers['x-amz-copy-source'] || req.headers['x-goog-copy-source']) {
                // CopyObject - MUST return CopyObjectResult XML for SDK v3
                const xml = `<?xml version="1.0" encoding="UTF-8"?>
                <CopyObjectResult xmlns="http://s3.amazonaws.com/doc/2006-03-01/">
                    <LastModified>2023-01-01T00:00:00.000Z</LastModified>
                    <ETag>"d41d8cd98f00b204e9800998ecf8427e"</ETag>
                </CopyObjectResult>`;
                res.writeHead(200);
                res.end(xml);
            } else {
                res.setHeader('ETag', '"d41d8cd98f00b204e9800998ecf8427e"');
                res.writeHead(200);
                res.end();
            }
        } else if (req.method === 'DELETE') {
            res.writeHead(204);
            res.end();
        } else if (req.method === 'POST' && req.url.includes('compose')) {
            const xml = `<?xml version="1.0" encoding="UTF-8"?>
            <ComposeObjectResult>
                <ETag>"d41d8cd98f00b204e9800998ecf8427e"</ETag>
            </ComposeObjectResult>`;
            res.writeHead(200);
            res.end(xml);
        } else {
            res.writeHead(200);
            res.end();
        }
    };
}

const invalidDnsBucketNames = [
    '..',
    '.bucketname',
    'bucketname.',
    'bucketName.',
    'aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa',
    '256.256.256.256',
];

function invalidDnsBucketNameHandler(req, res) {
    assert(req.headers.host, host);
    const bucketFromUrl = req.url.split('/')[1];
    assert.strictEqual(typeof bucketFromUrl, 'string');
    assert(invalidDnsBucketNames.includes(bucketFromUrl));
    res.writeHead(200);
    res.end();
}

const operations = [
    {
        op: 'headBucket',
        params: { Bucket },
    },
    {
        op: 'listObjects',
        params: { Bucket },
    },
    {
        op: 'listVersions',
        params: { Bucket },
    },
    {
        op: 'getBucketVersioning',
        params: { Bucket },
    },
    {
        op: 'headObject',
        params: { Bucket, Key },
    },
    {
        op: 'putObject',
        params: { Bucket, Key },
    },
    {
        op: 'getObject',
        params: { Bucket, Key },
    },
    {
        op: 'deleteObject',
        params: { Bucket, Key },
    },
    {
        op: 'composeObject',
        params: { Bucket, Key, MultipartUpload },
    },
    {
        op: 'copyObject',
        params: { Bucket, Key, CopySource },
    },
];

function callOperation(client, op, params, cb) {
    if (op === 'listObjects') {
        return client.send(new ListObjectsCommand(params))
            .then(() => cb(null))
            .catch(err => cb(err));
    }
    if (op === 'listVersions') {
        return client.send(new ListObjectVersionsCommand(params))
            .then(() => cb(null))
            .catch(err => cb(err));
    }
    if (op === 'getBucketVersioning') {
        return client.send(new GetBucketVersioningCommand(params))
            .then(() => cb(null))
            .catch(err => cb(err));
    }
    return client[op](params, cb);
}

async function cleanupServer(httpServer, sockets) {
    if (httpServer) {
        sockets.forEach(socket => {
            if (!socket.destroyed) {
                socket.destroy();
            }
        });

        await new Promise(resolve => {
            const timeout = setTimeout(() => {
                resolve();
            }, 3000);

            httpServer.close(() => {
                clearTimeout(timeout);
                resolve();
            });
        });
    }
}

describe('GcpService request behavior', () => {
    jest.setTimeout(120000);
    let httpServer;
    let client;
    let sockets = [];

    beforeAll(done => {
        client = new GCP({
            s3Params: {
                endpoint: `http://${host}`,
                maxAttempts: 1,
                forcePathStyle: false,
                region: 'us-east-1',
                credentials: {
                    accessKeyId,
                    secretAccessKey,
                },
            },
            bucketName: 'test-bucket',
            dataStoreName: 'test-location',
        });

    httpServer = http.createServer(invalidDnsBucketNameHandler);
        httpServer.on('listening', done);
        httpServer.on('error', err => {
            process.stdout.write(`https server: ${err.stack}\n`);
            process.exit(1);
        });
        httpServer.on('connection', socket => {
            sockets.push(socket);
            socket.on('close', () => {
                sockets = sockets.filter(s => s !== socket);
            });
        });
        httpServer.listen(httpPort);
    });

    afterAll(async () => {
        await cleanupServer(httpServer, sockets);
    });

    invalidDnsBucketNames.forEach(bucket => {
        // This test verifies that populateURI() properly sticks to path-based bucket name,
        // when the bucket is not DNS-compatible
        it(`should not use dns-style if bucket isn't dns compatible: ${bucket}`,
            done => {
                client.headBucket({ Bucket: bucket }, err => {
                    // We expect no error here: the invalidDnsBucketNameHandler() function
                    // will verify that the `host` has indeed not be updated and that
                    // bucket name is provided through the `path`.
                    assert.ifError(err);
                    done();
                });
            });
    });
});

describe('GcpService pathStyle tests', () => {
    jest.setTimeout(120000);
    let httpServer;
    let client;
    let sockets = [];

    beforeAll(done => {
        client = new GCP({
            s3Params: {
                endpoint: `http://${host}`,
                maxAttempts: 1,
                forcePathStyle: true,
                region: 'us-east-1',
                credentials: {
                    accessKeyId,
                    secretAccessKey,
                },
            },
            bucketName: 'test-bucket',
            dataStoreName: 'test-location',
        });
        httpServer = http.createServer(handler(true));
        httpServer.on('listening', done);
        httpServer.on('error', err => {
            process.stdout.write(`https server: ${err.stack}\n`);
            process.exit(1);
        });
        httpServer.on('connection', socket => {
            sockets.push(socket);
            socket.on('close', () => {
                sockets = sockets.filter(s => s !== socket);
            });
        });
        httpServer.listen(httpPort);
    });

    afterAll(async () => {
        await cleanupServer(httpServer, sockets);
    });

    operations.forEach(test => it(`GCP::${test.op}`, done => {
        callOperation(client, test.op, test.params, err => {
            done(err);
        });
    }));
});

describe('GcpService dnsStyle tests', () => {
    jest.setTimeout(120000);
    let httpServer;
    let client;
    let sockets = [];

    beforeAll(done => {
        client = new GCP({
            s3Params: {
                endpoint: `http://${host}`,
                maxAttempts: 1,
                forcePathStyle: false,
                region: 'us-east-1',
                credentials: {
                    accessKeyId: accessKeyId,
                    secretAccessKey: secretAccessKey,
                },
            },
            bucketName: 'test-bucket',
            dataStoreName: 'test-location',
        });
        httpServer = http.createServer(handler(false));
        httpServer.on('listening', done);
        httpServer.on('error', err => {
            process.stdout.write(`https server: ${err.stack}\n`);
            process.exit(1);
        });
        httpServer.on('connection', socket => {
            sockets.push(socket);
            socket.on('close', () => {
                sockets = sockets.filter(s => s !== socket);
            });
        });
        httpServer.listen(httpPort);
    });

    afterAll(async () => {
        await cleanupServer(httpServer, sockets);
    });

    operations.forEach(test => it(`GCP::${test.op}`, done => {
        callOperation(client, test.op, test.params, err => done(err));
    }));
});

describe('GcpService helper behavior', () => {
    let client;

    beforeEach(() => {
        client = new GCP({
            s3Params: {
                endpoint: 'http://localhost',
                maxAttempts: 1,
                forcePathStyle: true,
                region: 'us-east-1',
                credentials: {
                    accessKeyId: 'access',
                    secretAccessKey: 'secret',
                },
            },
            bucketName: 'unit-bucket',
            dataStoreName: 'unit-location',
        });
    });

    afterEach(() => {
        jest.restoreAllMocks();
    });

    it('putObjectTagging should merge tags into metadata', done => {
        jest.spyOn(client, 'headObject')
            .mockImplementation((params, cb) => cb(null, { Metadata: { existing: 'alpha' } }));
        const copySpy = jest.spyOn(client, 'copyObject')
            .mockImplementation((params, cb) => cb(null, { CopyObjectResult: {} }));

        client.putObjectTagging({
            Bucket: 'unit-bucket',
            Key: 'tagged-key',
            Tagging: {
                TagSet: [
                    { Key: 'team', Value: 'storage' },
                    { Key: 'env', Value: 'prod' },
                ],
            },
        }, err => {
            assert.ifError(err);
            expect(copySpy).toHaveBeenCalledTimes(1);
            const metadata = copySpy.mock.calls[0][0].Metadata;
            assert.strictEqual(metadata.existing, 'alpha');
            assert.strictEqual(metadata['aws-tag-team'], 'storage');
            assert.strictEqual(metadata['aws-tag-env'], 'prod');
            done();
        });
    });

    it('deleteObjectTagging should strip tag metadata and add sentinel', done => {
        jest.spyOn(client, 'headObject')
            .mockImplementation((params, cb) => cb(null, {
                Metadata: {
                    'aws-tag-project': 'zenko',
                },
            }));
        const copySpy = jest.spyOn(client, 'copyObject')
            .mockImplementation((params, cb) => cb(null, { CopyObjectResult: {} }));

        client.deleteObjectTagging({
            Bucket: 'unit-bucket',
            Key: 'tagged-key',
        }, err => {
            assert.ifError(err);
            const metadata = copySpy.mock.calls[0][0].Metadata;
            assert.strictEqual(metadata['aws-tag-project'], undefined);
            done();
        });
    });

    it('getObjectTagging should return TagSet derived from metadata', done => {
        jest.spyOn(client, 'headObject')
            .mockImplementation((params, cb) => cb(null, {
                Metadata: {
                    'aws-tag-owner': 'arsenal',
                    'aws-tag-color': 'blue',
                    misc: 'ignored',
                },
            }));

        client.getObjectTagging({
            Bucket: 'unit-bucket',
            Key: 'tagged-key',
        }, (err, res) => {
            assert.ifError(err);
            assert.deepStrictEqual(res.TagSet, [
                { Key: 'owner', Value: 'arsenal' },
                { Key: 'color', Value: 'blue' },
            ]);
            done();
        });
    });

    it('createMultipartUpload should reject if parameters are missing', done => {
        client.createMultipartUpload({ Bucket: 'unit-bucket' }, err => {
            assert(err);
            assert(err.is.InvalidRequest);
            done();
        });
    });

    it('uploadPart should reject invalid part number', done => {
        client.uploadPart({
            Bucket: 'unit-bucket',
            Key: 'object',
            UploadId: 'upload',
            PartNumber: 'NaN',
        }, err => {
            assert(err);
            assert(err.is.InvalidArgument);
            done();
        });
    });

    it('uploadPartCopy should reject if parameters are missing', done => {
        client.uploadPartCopy({
            Bucket: 'unit-bucket',
            Key: 'object',
        }, err => {
            assert(err);
            assert(err.is.InvalidRequest);
            done();
        });
    });
});

describe('GcpService mpu helper behavior', () => {
    let client;

    beforeEach(() => {
        client = new GCP({
            s3Params: {
                endpoint: 'http://localhost',
                maxAttempts: 1,
                forcePathStyle: true,
                region: 'us-east-1',
                credentials: {
                    accessKeyId: 'access',
                    secretAccessKey: 'secret',
                },
            },
            bucketName: 'unit-bucket',
            dataStoreName: 'unit-location',
        });
    });

    afterEach(() => {
        jest.restoreAllMocks();
    });

    it('abortMultipartUpload should reject missing parameters', done => {
        client.abortMultipartUpload({ Bucket: 'b' }, err => {
            assert(err);
            assert(err.is.InvalidRequest);
            done();
        });
    });

    it('abortMultipartUpload should call removeParts with derived Prefix', done => {
        const removeSpy = jest.spyOn(MpuHelper.prototype, 'removeParts')
            .mockImplementation((_delParams, cb) => cb(null));

        const params = {
            Bucket: 'b',
            MPU: 'mpu-b',
            Key: 'obj',
            UploadId: 'upload',
        };

        client.abortMultipartUpload(params, err => {
            assert.ifError(err);
            expect(removeSpy).toHaveBeenCalledTimes(1);
            expect(removeSpy).toHaveBeenCalledWith({
                Bucket: params.Bucket,
                MPU: params.MPU,
                Prefix: createMpuKey(params.Key, params.UploadId),
            }, expect.any(Function));
            done();
        });
    });

    it('completeMultipartUpload should reject missing parameters', done => {
        client.completeMultipartUpload({ Bucket: 'b' }, err => {
            assert(err);
            assert(err.is.InvalidRequest);
            done();
        });
    });

    it('completeMultipartUpload should reject empty parts list', done => {
        client.completeMultipartUpload({
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

    it('completeMultipartUpload should reject invalid part order', done => {
        client.completeMultipartUpload({
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

    it('completeMultipartUpload should run MPU flow and remove parts', done => {
        jest.spyOn(console, 'log').mockImplementation(() => undefined);

        const splitMergeSpy = jest.spyOn(MpuHelper.prototype, 'splitMerge')
            .mockImplementation((params, partList, level, cb) => cb(null, 2));
        const composeFinalSpy = jest.spyOn(MpuHelper.prototype, 'composeFinal')
            .mockImplementation((numParts, params, cb) => cb(null, 'finalKey'));
        const generateSpy = jest.spyOn(MpuHelper.prototype, 'generateMpuResult')
            .mockImplementation((result, partList, cb) => cb(null, result, 'aggEtag'));
        const copySpy = jest.spyOn(MpuHelper.prototype, 'copyToMain')
            .mockImplementation((result, aggregateETag, params, cb) => cb(null, {
                Bucket: params.Bucket,
                Key: params.Key,
                VersionId: 'v1',
                ETag: '"aggEtag"',
            }));
        const removeSpy = jest.spyOn(MpuHelper.prototype, 'removeParts')
            .mockImplementation((_delParams, cb) => cb(null));

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

        client.completeMultipartUpload(params, (err, res) => {
            assert.ifError(err);
            assert(res);
            assert.strictEqual(res.Bucket, params.Bucket);
            assert.strictEqual(res.Key, params.Key);

            expect(splitMergeSpy).toHaveBeenCalledTimes(1);
            expect(composeFinalSpy).toHaveBeenCalledTimes(1);
            expect(generateSpy).toHaveBeenCalledTimes(1);
            expect(copySpy).toHaveBeenCalledTimes(1);
            expect(removeSpy).toHaveBeenCalledTimes(1);
            expect(removeSpy).toHaveBeenCalledWith({
                Bucket: params.Bucket,
                MPU: params.MPU,
                Prefix: createMpuKey(params.Key, params.UploadId),
            }, expect.any(Function));
            done();
        });
    });

    describe('removeParts', () => {
        it('should list versions via send(ListObjectVersionsCommand) and delete each version', done => {
            const service = {
                _maxConcurrent: 10,
                send: jest.fn()
                    .mockImplementationOnce(command => {
                        // page 1 (truncated)
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
                    .mockImplementationOnce(command => {
                        // page 2 (final)
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
                deleteObject: jest.fn((params, cb) => cb(null)),
            };

            const helper = new MpuHelper(service);
            helper.removeParts({ MPU: 'mpu-bucket', Prefix: 'pfx/' }, err => {
                assert.ifError(err);
                expect(service.send).toHaveBeenCalledTimes(2);
                expect(service.deleteObject).toHaveBeenCalledTimes(3);
                expect(service.deleteObject).toHaveBeenNthCalledWith(1, {
                    Bucket: 'mpu-bucket',
                    Key: 'a',
                    VersionId: '1',
                }, expect.any(Function));
                done();
            });
        });

        it('should ignore NoSuchKey errors during delete', done => {
            const service = {
                _maxConcurrent: 10,
                send: jest.fn().mockResolvedValue({
                    IsTruncated: false,
                    Versions: [
                        { Key: 'a', VersionId: '1' },
                        { Key: 'b', VersionId: '2' },
                    ],
                }),
                deleteObject: jest.fn((params, cb) => {
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
                expect(service.send).toHaveBeenCalledTimes(1);
                expect(service.deleteObject).toHaveBeenCalledTimes(2);
                done();
            });
        });

        it('should return error when send(ListObjectVersionsCommand) rejects', done => {
            const listObjectVersionsError = new Error('send(ListObjectVersionsCommand) failed');
            const service = {
                _maxConcurrent: 10,
                send: jest.fn(command => {
                    assert(command instanceof ListObjectVersionsCommand);
                    return Promise.reject(listObjectVersionsError);
                }),
                deleteObject: jest.fn(),
            };

            const helper = new MpuHelper(service);
            helper.removeParts({ MPU: 'mpu-bucket', Prefix: 'pfx/' }, err => {
                assert.strictEqual(err, listObjectVersionsError);
                expect(service.deleteObject).not.toHaveBeenCalled();
                done();
            });
        });
    });

    describe('listParts', () => {
        it('should list parts', done => {
            const sendSpy = jest.spyOn(client, 'send')
                .mockResolvedValue({ Contents: [] });

            const params = {
                Bucket: 'b',
                Key: 'obj',
                UploadId: 'upload',
                PartNumberMarker: 3,
                MaxParts: 10,
            };

            client.listParts(params, (err, res) => {
                assert.ifError(err);
                assert(res);
                expect(sendSpy).toHaveBeenCalledTimes(1);
                const [command] = sendSpy.mock.calls[0];
                expect(command).toBeInstanceOf(ListObjectsCommand);
                expect(command.input).toEqual({
                    Bucket: params.Bucket,
                    Prefix: createMpuKey(params.Key, params.UploadId, 'parts'),
                    Marker: createMpuKey(params.Key, params.UploadId,
                        params.PartNumberMarker, 'parts'),
                    MaxKeys: params.MaxParts,
                });
                done();
            });
        });

        it('should return error when command rejects', done => {
            const listObjectsError = new Error('send(ListObjectsCommand) failed');
            jest.spyOn(client, 'send').mockRejectedValue(listObjectsError);

            client.listParts({
                Bucket: 'b',
                Key: 'obj',
                UploadId: 'upload',
            }, err => {
                assert.strictEqual(err, listObjectsError);
                done();
            });
        });
    });
});
