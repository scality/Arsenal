const assert = require('assert');
const http = require('http');

const werelogs = require('werelogs');
const logger = new werelogs.Logger('test:routesUtils.responseStreamData');

const { responseStreamData } = require('../../../../lib/s3routes/routesUtils.js');
const AwsClient = require('../../../../lib/storage/data/external/AwsClient');
const DummyObjectStream = require('../../storage/data/DummyObjectStream');

werelogs.configure({
    level: 'debug',
    dump: 'error',
});

describe('routesUtils.responseStreamData', () => {
    const awsAgent = new http.Agent({
        keepAlive: true,
    });
    const awsConfig = {
        s3Params: {
            endpoint: 'http://localhost:8888',
            maxRetries: 0,
            s3ForcePathStyle: true,
            accessKeyId: 'accessKey',
            secretAccessKey: 'secretKey',
            httpOptions: {
                agent: awsAgent,
            },
        },
        bucketName: 'awsTestBucketName',
        dataStoreName: 'awsDataStore',
        serverSideEncryption: false,
        type: 'aws',
    };
    let httpServer;
    let awsClient;

    before(done => {
        awsClient = new AwsClient(awsConfig);
        httpServer = http.createServer((req, res) => {
            const objStream = new DummyObjectStream(0, 10000000);
            res.setHeader('content-length', 10000000);
            objStream.pipe(res);
        }).listen(8888);
        httpServer.on('listening', done);
        httpServer.on('error', err => assert.ifError(err));
    });

    after(() => {
        httpServer.close();
    });

    it('should not leak socket if client closes the connection before ' +
    'data backend starts streaming', done => {
        responseStreamData(undefined, {}, {}, [{
            key: 'foo',
            size: 10000000,
        }], {
            client: awsClient,
            implName: 'impl',
            config: {},
            locStorageCheckFn: () => {},
        }, {
            setHeader: () => {},
            writeHead: () => {},
            on: () => {},
            once: () => {},
            emit: () => {},
            write: () => {},
            end: () => setTimeout(() => {
                const nOpenSockets = Object.keys(awsAgent.sockets).length;
                assert.strictEqual(nOpenSockets, 0);
                done();
            }, 1000),
            // fake a connection close from the S3 client by setting the "isclosed" flag
            isclosed: true,
        }, undefined, logger.newRequestLogger());
    });
});
