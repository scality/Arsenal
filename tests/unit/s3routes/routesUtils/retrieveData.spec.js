const assert = require('assert');
const sinon = require('sinon');
const werelogs = require('werelogs');
const { Readable } = require('stream');
const { retrieveData } = require('../../../../lib/s3routes/routesUtils');
const DataWrapper = require('../../../../lib/storage/data/DataWrapper');
const HttpResponseMock = require('../../../utils/HttpResponseMock');

const logger = new werelogs.Logger('retrieveData', 'debug', 'debug');

describe('retrieveData', () => {
    let log;
    let responseMock;

    beforeEach(() => {
        log = logger.newRequestLogger();
        responseMock = new HttpResponseMock();
        sinon.spy(responseMock, 'writeHead');
        sinon.spy(responseMock, 'end');
        sinon.spy(responseMock, 'destroy');

        sinon.spy(log, 'trace');
        sinon.spy(log, 'debug');
        sinon.spy(log, 'info');
        sinon.spy(log, 'error');
    });

    afterEach(() => {
        sinon.restore();
    });

    it('should handle empty locations array', () => {
        const locations = [];
        const retrieveDataParams = {};

        retrieveData(locations, retrieveDataParams, responseMock, 200, log);

        assert(responseMock.end.calledOnce);
        assert(!responseMock.writeHead.called);
    });

    it('should successfully stream single location data', (done) => {
        const locations = [{ key: 'test1' }];
        const retrieveDataParams = { client: {}, implName: 'test' };
        const mockStream = new Readable({
            read() {
                this.push('test data');
                // used to end the stream immediately
                this.push(null);
            },
        });

        sinon.stub(DataWrapper.prototype, 'get').yields(null, mockStream);

        retrieveData(locations, retrieveDataParams, responseMock, 200, log);

        mockStream.on('end', () => {
            assert(responseMock.writeHead.calledWith(200));
            assert(responseMock.end.calledOnce);
            assert(log.debug.calledWith('readable stream end reached'));
            done();
        });
    });

    it('should handle multiple locations sequentially', async () => {
        const locations = [{ key: 'test1' }, { key: 'test2' }];
        const retrieveDataParams = { client: {}, implName: 'test' };
        const mockStream1 = new Readable({ read() { this.push('data1'); this.push(null); } });
        const mockStream2 = new Readable({ read() { this.push('data2'); this.push(null); } });

        const dataWrapperGetStub = sinon.stub(DataWrapper.prototype, 'get');
        dataWrapperGetStub.withArgs(locations[0]).yields(null, mockStream1);
        dataWrapperGetStub.withArgs(locations[1]).yields(null, mockStream2);

        retrieveData(locations, retrieveDataParams, responseMock, 200, log);

        await new Promise((resolve) => {
            let streamsEnded = 0;
            const checkEnd = () => {
                streamsEnded++;
                if (streamsEnded === 2) resolve();
            };
            mockStream1.on('end', checkEnd);
            mockStream2.on('end', checkEnd);
        });

        assert(responseMock.writeHead.calledWith(200));
        assert(dataWrapperGetStub.calledTwice);
        assert(responseMock.end.calledOnce);
    });

    it('should handle error from data.get', (done) => {
        const locations = [{ key: 'test1' }];
        const retrieveDataParams = { client: {}, implName: 'test' };
        const error = new Error('test error');

        sinon.stub(DataWrapper.prototype, 'get').yields(error);

        retrieveData(locations, retrieveDataParams, responseMock, 200, log);

        // Use process.nextTick to allow the callback to execute
        process.nextTick(() => {
            assert(log.error.calledWith('failed to get object', sinon.match({
                error,
                method: 'retrieveData',
            })));
            assert(responseMock.end.calledOnce);
            done();
        });
    });

    it('should destroy response on readable stream error', (done) => {
        const locations = [{ key: 'test1' }];
        const retrieveDataParams = { client: {}, implName: 'test' };
        const mockStream = new Readable({
            read() {
                this.push('test data');
                this.emit('error', new Error('stream error'));
            },
        });

        sinon.stub(DataWrapper.prototype, 'get').yields(null, mockStream);

        retrieveData(locations, retrieveDataParams, responseMock, 200, log);

        mockStream.once('error', () => {
            process.nextTick(() => {
                assert(responseMock.destroy.called);
                assert(log.error.calledWith('error piping data from source'));
                done();
            });
        });
    });

    it('should handle client closing connection before streaming', (done) => {
        const locations = [{ key: 'test1' }];
        const retrieveDataParams = { client: {}, implName: 'test' };
        const mockStream = sinon.createStubInstance(Readable);

        sinon.stub(DataWrapper.prototype, 'get').yields(null, mockStream);
        sinon.stub(responseMock, 'once').withArgs('close').yields();

        retrieveData(locations, retrieveDataParams, responseMock, 200, log);

        process.nextTick(() => {
            assert(log.debug.calledWith('response destroyed before readable could stream'));
            assert(!mockStream.pipe.called);
            done();
        });
    });

    it('should not send headers if already sent', () => {
        const locations = [{ key: 'test1' }];
        const retrieveDataParams = { client: {}, implName: 'test' };
        const mockStream = new Readable({ read() { this.push('data'); this.push(null); } });

        responseMock.headersSent = true;
        sinon.stub(DataWrapper.prototype, 'get').yields(null, mockStream);

        retrieveData(locations, retrieveDataParams, responseMock, 200, log);

        assert(!responseMock.writeHead.called);
    });

    it('should use correct HTTP code for range requests', (done) => {
        const locations = [{ key: 'test1' }];
        const retrieveDataParams = { client: {}, implName: 'test' };
        const mockStream = new Readable({ read() { this.push('data'); this.push(null); } });

        sinon.stub(DataWrapper.prototype, 'get').yields(null, mockStream);

        retrieveData(locations, retrieveDataParams, responseMock, 206, log);

        mockStream.on('end', () => {
            assert(responseMock.writeHead.calledWith(206));
            done();
        });
    });
});
