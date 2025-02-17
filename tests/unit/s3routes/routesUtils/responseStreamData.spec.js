const assert = require('assert');
const http = require('http');
const sinon = require('sinon');

const werelogs = require('werelogs');
const logger = new werelogs.Logger('test:routesUtils.responseStreamData');

const { responseStreamData, retrieveData } = require('../../../../lib/s3routes/routesUtils');
const AwsClient = require('../../../../lib/storage/data/external/AwsClient');
const DummyObjectStream = require('../../storage/data/DummyObjectStream');
const DataWrapper = require('../../../../lib/storage/data/DataWrapper');

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

    afterEach(() => {
        sinon.restore();
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
            removeAllListeners: () => {},
            end: () => setTimeout(() => {
                const nOpenSockets = Object.keys(awsAgent.sockets).length;
                assert.strictEqual(nOpenSockets, 0);
                done();
            }, 1000),
            // fake a connection close from the S3 client by setting the "isclosed" flag
            isclosed: true,
        }, undefined, logger.newRequestLogger());
    });

    it('should send 503 when storage fails to GET the data', done => {
        const error = new Error('Not Found');
        error.code = 'NoSuchKey';
        sinon.stub(awsClient, 'get').callsFake((objectGetInfo, response, log, cb) => cb(error));
        const res = {
            setHeader: () => {},
            writeHead: (statusCode, headers) => {
                assert.strictEqual(statusCode, 503);
                assert.strictEqual(headers['Content-Type'], 'application/xml');
            },
            on: () => {},
            once: () => {},
            emit: () => {},
            write: () => {},
            removeAllListeners: () => {},
            end: () => done(),
        };
        responseStreamData(undefined, {}, {}, [{
            key: 'foo',
            size: 10000000,
        }], {
            client: awsClient,
            implName: 'impl',
            config: {},
            locStorageCheckFn: () => {},
        }, res, undefined, logger.newRequestLogger());
    });

    it('should not set the http headers when calling responseStreamData in case of storage layer error', done => {
        const res = {
            setHeader: () => {},
            writeHead: () => {
                this.headersSent = true;
            },
            on: () => {},
            once: () => {},
            emit: () => {},
            write: () => {},
            removeAllListeners: () => {},
            end: () => {
                assert.notStrictEqual(this.headersSent, true);
                done();
            },
        };
        responseStreamData(undefined, {}, {}, null, {
            client: awsClient,
            implName: 'impl',
            config: {},
            locStorageCheckFn: () => {},
        }, res, undefined, logger.newRequestLogger());
    });
});

describe('routesUtils.retrieveData', () => {
    let response;
    let dataWrapperStub;
    let retrieveDataParams;

    beforeEach(() => {
        response = {
            setHeader: sinon.spy(),
            writeHead: sinon.spy(),
            write: sinon.spy(),
            emit: sinon.spy(),
            end: () => {},
            once: sinon.spy(),
            on: sinon.spy(),
            removeAllListeners: sinon.spy(),
            isclosed: false,
        };

        dataWrapperStub = sinon.stub(DataWrapper.prototype, 'get');

        retrieveDataParams = {
            client: {},
            implName: 'impl',
            config: {},
            kms: {},
            metadata: {},
            locStorageCheckFn: () => {},
            vault: {},
        };
    });

    afterEach(() => {
        sinon.restore();
    });

    it('should end the response if no locations are provided', () => {
        response.end = sinon.spy();
        retrieveData([], retrieveDataParams, response, 200, logger.newRequestLogger());
        assert(response.end.calledOnce);
    });

    it('should log as debug and end response in case of data.get error', (done) => {
        const locations = [{ key: 'foo', size: 1000 }];
        const error = new Error('Storage failure');
        dataWrapperStub.callsArgWith(3, error);
        const log = logger.newRequestLogger();

        const fakeDebug = sinon.stub(log, 'debug');
        const fakeError = sinon.stub(log, 'error');
        sinon.stub(response, 'end').callsFake(() => {
            assert(fakeDebug.calledWith('failed to get object', { error, method: 'retrieveData' }));
            assert(fakeError.calledWith('abort response due to error', { error: error.code, errMsg: error.message }));
            assert(response.writeHead.calledOnce);
            done();
        });

        retrieveData(locations, retrieveDataParams, response, 200, log);
    });

    it('should stream data if locations are provided', (done) => {
        const locations = [{ key: 'foo', size: 1000 }];
        const dataStream = new DummyObjectStream(0, 1000);
        dataWrapperStub.callsArgWith(3, null, dataStream);
        const log = logger.newRequestLogger();

        retrieveData(locations, retrieveDataParams, response, 200, log);

        response.end = () => {
            assert(response.writeHead.calledOnce);
            done();
        };
    });
});
