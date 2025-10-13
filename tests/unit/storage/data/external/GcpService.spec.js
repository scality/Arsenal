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

function handler(isPathStyle) {
    return (req, res) => {
        if (isPathStyle) {
            assert(req.headers.host, host);
            assert(req.url.includes(Bucket));
        } else {
            assert(req.headers.host, `${Bucket}.${host}`);
            assert(!req.url.includes(Bucket));
        }
        res.end();
    };
}

const invalidDnsBucketNames = [
    '.bucketname',
    'bucketname.',
    'bucketName.',
    'aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa',
    '256.256.256.256',
];

function invalidDnsBucketNameHandler() {
    return (req, res) => {
        assert(req.headers.host, host);
    const bucketFromUrl = req.url.split('/')[1];
        assert.strictEqual(typeof bucketFromUrl, 'string');
        assert(invalidDnsBucketNames.includes(bucketFromUrl));
        res.end();
    };
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
        
        await new Promise((resolve) => {
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
                    accessKeyId: accessKeyId,
                    secretAccessKey: secretAccessKey,
                },
            },
            bucketName: 'test-bucket',
            dataStoreName: 'test-location',
        });
        
        httpServer = http.createServer(invalidDnsBucketNameHandler(host));
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
                    accessKeyId: accessKeyId,
                    secretAccessKey: secretAccessKey,
                },
            },
            bucketName: 'test-bucket',
            dataStoreName: 'test-location',
        });
        httpServer = http.createServer(handler(true, host));
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
            assert.ifError(err);
            done();
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
        httpServer = http.createServer(handler(false, host));
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
            assert.ifError(err);
            done();
        });
    }));
});
