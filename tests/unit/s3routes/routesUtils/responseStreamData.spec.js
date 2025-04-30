const assert = require('assert');
const http = require('http');
const sinon = require('sinon');

const werelogs = require('werelogs');
const logger = new werelogs.Logger('test:routesUtils.responseStreamData');

const { responseStreamData } = require('../../../../lib/s3routes/routesUtils');
const AwsClient = require('../../../../lib/storage/data/external/AwsClient');
const DummyObjectStream = require('../../storage/data/DummyObjectStream');

werelogs.configure({
    level: 'debug',
    dump: 'error',
});

describe('routesUtils.responseStreamData', () => {
    describe('content length validation', () => {
        let response;
        let log;
        let sandbox;
        const mockClient = {
            get: (info, range, uid, cb) => cb(null, new DummyObjectStream(0, 15)),
        };

        beforeEach(() => {
            sandbox = sinon.createSandbox();
            response = {
                setHeader: sandbox.stub(),
                writeHead: sandbox.stub(),
                on: sandbox.stub(),
                once: sandbox.stub(),
                emit: sandbox.stub(),
                write: sandbox.stub().returns(true),
                end: sandbox.stub(),
                socket: { destroy: sandbox.stub() },
            };
            log = logger.newRequestLogger();
        });

        afterEach(() => {
            sandbox.restore();
        });

        it('should succeed when content length matches data locations total size', () => {
            const resHeaders = { 'Content-Length': '15' };
            const dataLocations = [
                { size: 10, key: 'value1' },
                { size: 5, key: 'value2' },
            ];

            responseStreamData(
                null,
                {},
                resHeaders,
                dataLocations,
                { client: mockClient },
                response,
                undefined,
                log,
            );

            sinon.assert.calledWith(response.writeHead, 200);
        });

        it('should fail when content length does not match total size', () => {
            const resHeaders = { 'Content-Length': '20' };
            const dataLocations = [
                { size: 10, key: 'value1' },
                { size: 5, key: 'value2' },
            ];

            responseStreamData(
                null,
                {},
                resHeaders,
                dataLocations,
                { client: mockClient },
                response,
                undefined,
                log,
            );

            sinon.assert.calledWith(response.writeHead, 500);
        });

        it('should succeed when data locations do not specify size', () => {
            const resHeaders = { 'Content-Length': '15' };
            const dataLocations = [
                { key: 'value1' },
                { key: 'value2' },
            ];

            responseStreamData(
                null,
                {},
                resHeaders,
                dataLocations,
                { client: mockClient },
                response,
                undefined,
                log,
            );

            sinon.assert.calledWith(response.writeHead, 200);
        });

        it('should succeed when Content-Length header is not set', () => {
            const resHeaders = {}; // No Content-Length header
            const dataLocations = [
                { size: 10, key: 'key1' },
                { size: 5, key: 'key2' },
            ];

            responseStreamData(
                null,
                {},
                resHeaders,
                dataLocations,
                { client: mockClient },
                response,
                undefined,
                log,
            );

            sinon.assert.calledWith(response.writeHead, 200);
        });
    });

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

    beforeAll(done => {
        awsClient = new AwsClient(awsConfig);
        httpServer = http.createServer((req, res) => {
            const objStream = new DummyObjectStream(0, 10000000);
            res.setHeader('content-length', 10000000);
            objStream.pipe(res);
        }).listen(8888);
        httpServer.on('listening', done);
        httpServer.on('error', err => assert.ifError(err));
    });

    afterAll(() => {
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
