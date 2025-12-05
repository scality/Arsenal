const assert = require('assert');
const http = require('http');
const { GCP } = require('../../../../../lib/storage/data/external/GCP');

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
        client[test.op](test.params, err => {
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
        client[test.op](test.params, err => done(err));
    }));
});
