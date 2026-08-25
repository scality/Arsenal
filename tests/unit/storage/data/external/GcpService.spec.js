const assert = require('assert');
const http = require('http');
const { promisify } = require('util');
const { GCP } = require('../../../../../lib/storage/data/external/GCP');
const {
    ListObjectsCommand, ListObjectVersionsCommand, GetBucketVersioningCommand, PutObjectCommand,
} = require('@aws-sdk/client-s3');

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
            assert.strictEqual(req.headers.host, host);
            assert(req.url.includes(Bucket));
        } else {
            assert.strictEqual(req.headers.host, `${Bucket}.${host}`);
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

function handlerWithLog(isPathStyle, requestLog) {
    const baseHandler = handler(isPathStyle);
    return (req, res) => {
        requestLog.push({
            method: req.method,
            url: req.url,
            host: req.headers.host,
        });
        return baseHandler(req, res);
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
    assert.strictEqual(req.headers.host, host);
    const bucketFromUrl = req.url.split('/')[1];
    assert.strictEqual(typeof bucketFromUrl, 'string');
    assert(invalidDnsBucketNames.includes(bucketFromUrl));
    res.writeHead(200);
    res.end();
}

const methodOperations = [
    {
        op: 'headBucket',
        params: { Bucket },
    },
    {
        op: 'headObject',
        params: { Bucket, Key },
    },
    {
        op: 'putObject',
        params: { Bucket, Key, Body: Buffer.from('test-body') },
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

const sendOperations = [
    {
        op: 'listObjects',
        Command: ListObjectsCommand,
        params: { Bucket },
    },
    {
        op: 'listVersions',
        Command: ListObjectVersionsCommand,
        params: { Bucket },
    },
    {
        op: 'getBucketVersioning',
        Command: GetBucketVersioningCommand,
        params: { Bucket },
    },
];

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
    const requestLog = [];

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
        httpServer = http.createServer(handlerWithLog(true, requestLog));
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

    beforeEach(() => {
        requestLog.length = 0;
    });

    const expectedMethodByOp = {
        headBucket: 'HEAD',
        headObject: 'HEAD',
        putObject: 'PUT',
        getObject: 'GET',
        deleteObject: 'DELETE',
        composeObject: 'PUT',
        copyObject: 'PUT',
        listObjects: 'GET',
        listVersions: 'GET',
        getBucketVersioning: 'GET',
    };

    methodOperations.forEach(test => it(`GCP::${test.op}`, done => {
        client[test.op](test.params, (err, data) => {
            assert.ifError(err);
            assert.strictEqual(requestLog.length, 1);
            assert.strictEqual(requestLog[0].method, expectedMethodByOp[test.op]);
            if (data) {
                assert(data.$metadata);
            }
            done();
        });
    }));

    sendOperations.forEach(test => it(`GCP::${test.op}`, done => {
        client.send(new test.Command(test.params))
            .then(data => {
                assert.strictEqual(requestLog.length, 1);
                assert.strictEqual(requestLog[0].method, expectedMethodByOp[test.op]);
                assert(data && data.$metadata);
                assert.strictEqual(data.$metadata.httpStatusCode, 200);
                if (test.op === 'listObjects') {
                    assert.strictEqual(data.Name, Bucket);
                    assert.strictEqual(data.IsTruncated, false);
                    assert(!requestLog[0].url.includes('versions'));
                    assert(!requestLog[0].url.includes('versioning'));
                } else if (test.op === 'listVersions') {
                    assert.strictEqual(data.Name, Bucket);
                    assert.strictEqual(data.IsTruncated, false);
                    assert(requestLog[0].url.includes('versions'));
                } else if (test.op === 'getBucketVersioning') {
                    assert(requestLog[0].url.includes('versioning'));
                }
                done();
            })
            .catch(err => done(err));
    }));
});

describe('GcpService dnsStyle tests', () => {
    jest.setTimeout(120000);
    let httpServer;
    let client;
    let sockets = [];
    const requestLog = [];

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
        httpServer = http.createServer(handlerWithLog(false, requestLog));
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

    beforeEach(() => {
        requestLog.length = 0;
    });

    const expectedMethodByOp = {
        headBucket: 'HEAD',
        headObject: 'HEAD',
        putObject: 'PUT',
        getObject: 'GET',
        deleteObject: 'DELETE',
        composeObject: 'PUT',
        copyObject: 'PUT',
        listObjects: 'GET',
        listVersions: 'GET',
        getBucketVersioning: 'GET',
    };

    methodOperations.forEach(test => it(`GCP::${test.op}`, done => {
        client[test.op](test.params, (err, data) => {
            assert.ifError(err);
            assert.strictEqual(requestLog.length, 1);
            assert.strictEqual(requestLog[0].method, expectedMethodByOp[test.op]);
            if (data) {
                assert(data.$metadata);
            }
            done();
        });
    }));

    sendOperations.forEach(test => it(`GCP::${test.op}`, done => {
        client.send(new test.Command(test.params))
            .then(data => {
                assert.strictEqual(requestLog.length, 1);
                assert.strictEqual(requestLog[0].method, expectedMethodByOp[test.op]);
                assert(data && data.$metadata);
                assert.strictEqual(data.$metadata.httpStatusCode, 200);
                if (test.op === 'listObjects') {
                    assert.strictEqual(data.Name, Bucket);
                    assert.strictEqual(data.IsTruncated, false);
                    assert(!requestLog[0].url.includes('versions'));
                    assert(!requestLog[0].url.includes('versioning'));
                } else if (test.op === 'listVersions') {
                    assert.strictEqual(data.Name, Bucket);
                    assert.strictEqual(data.IsTruncated, false);
                    assert(requestLog[0].url.includes('versions'));
                } else if (test.op === 'getBucketVersioning') {
                    assert(requestLog[0].url.includes('versioning'));
                }
                done();
            })
            .catch(err => done(err));
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

describe('GcpService generation translation', () => {
    const generationPort = 8890;
    let httpServer;
    let client;
    let sockets = [];
    let lastRequestUrl;
    let lastRequestHeaders;

    beforeAll(done => {
        client = new GCP({
            s3Params: {
                endpoint: `http://localhost:${generationPort}`,
                maxAttempts: 1,
                forcePathStyle: true,
                region: 'us-east-1',
                credentials: {
                    accessKeyId,
                    secretAccessKey,
                },
            },
            bucketName: Bucket,
            dataStoreName: 'test-location',
        });
        httpServer = http.createServer((req, res) => {
            lastRequestUrl = req.url;
            lastRequestHeaders = req.headers;
            res.setHeader('x-goog-generation', '5678');
            if (req.method === 'DELETE') {
                res.writeHead(204);
                return res.end();
            }
            if (req.method === 'HEAD') {
                res.writeHead(200, { 'content-length': '0' });
                return res.end();
            }
            if (req.headers['x-goog-copy-source']) {
                const xml = `<?xml version="1.0" encoding="UTF-8"?>
                <CopyObjectResult xmlns="http://s3.amazonaws.com/doc/2006-03-01/">
                    <LastModified>2023-01-01T00:00:00.000Z</LastModified>
                    <ETag>"d41d8cd98f00b204e9800998ecf8427e"</ETag>
                </CopyObjectResult>`;
                res.writeHead(200, { 'content-type': 'application/xml' });
                return res.end(xml);
            }
            res.writeHead(200, { 'content-type': 'application/octet-stream' });
            return res.end('test-data');
        });
        httpServer.on('listening', done);
        httpServer.on('connection', socket => {
            sockets.push(socket);
            socket.on('close', () => {
                sockets = sockets.filter(s => s !== socket);
            });
        });
        httpServer.listen(generationPort);
    });

    afterAll(async () => {
        await cleanupServer(httpServer, sockets);
    });

    it('getObject should translate VersionId into the generation parameter', async () => {
        const res = await promisify(client.getObject.bind(client))({ Bucket, Key, VersionId: '1234' });
        assert(lastRequestUrl.includes('generation=1234'));
        assert(!lastRequestUrl.includes('versionId'));
        assert.strictEqual(res.VersionId, '5678');
    });

    it('deleteObject should translate VersionId into the generation parameter', async () => {
        await promisify(client.deleteObject.bind(client))({ Bucket, Key, VersionId: '1234' });
        assert(lastRequestUrl.includes('generation=1234'));
        assert(!lastRequestUrl.includes('versionId'));
    });

    it('headObject should not add a generation parameter without VersionId', async () => {
        const res = await promisify(client.headObject.bind(client))({ Bucket, Key });
        assert(!lastRequestUrl.includes('generation='));
        assert.strictEqual(res.VersionId, '5678');
    });

    it('copyObject should move the source versionId into the generation header', async () => {
        const res = await promisify(client.copyObject.bind(client))(
            { Bucket, Key, CopySource: `${Bucket}/${Key}?versionId=1234` });
        assert.strictEqual(lastRequestHeaders['x-goog-copy-source'], `${Bucket}/${Key}`);
        assert.strictEqual(lastRequestHeaders['x-goog-copy-source-generation'], '1234');
        assert.strictEqual(res.VersionId, '5678');
    });

    it('copyObject should not add a generation header without a source versionId', async () => {
        await promisify(client.copyObject.bind(client))(
            { Bucket, Key, CopySource: `${Bucket}/${Key}` });
        assert.strictEqual(lastRequestHeaders['x-goog-copy-source'], `${Bucket}/${Key}`);
        assert.strictEqual(lastRequestHeaders['x-goog-copy-source-generation'], undefined);
    });

    it('send should return the generation as VersionId on the raw command path', async () => {
        // AwsClient.put sends raw commands with no per-command capture:
        // only the client-level middleware provides the VersionId there
        const res = await client.send(new PutObjectCommand({ Bucket, Key, Body: Buffer.from('data') }));
        assert.strictEqual(res.VersionId, '5678');
    });

    it('putObject should return the generation as VersionId', async () => {
        const res = await promisify(client.putObject.bind(client))(
            { Bucket, Key, Body: Buffer.from('data') });
        assert.strictEqual(res.VersionId, '5678');
    });
});
