const assert = require('assert');
const http = require('http');
const stream = require('stream');
const EventEmitter = require('events');
const sinon = require('sinon');
const werelogs = require('werelogs');

const RESTClient = require('../../../../lib/network/rest/RESTClient').default;

const clientLogApi = new werelogs.Werelogs({
    level: 'info',
    dump: 'error',
});

// Regression test for ARSN-594: a data backend client must invoke its
// callback at most once. RESTClient.get() has two independent completion
// paths - the response handler and the request 'error' handler - and a socket
// error arriving after the response would otherwise call the callback a second
// time. The higher-level retrieveData() converges every backend's callback
// into an async.eachSeries iteration callback, and a double invocation there
// throws "Callback was already called", crashing the server process.
describe('RESTClient single-callback guarantee (ARSN-594)', () => {
    afterEach(() => {
        sinon.restore();
    });

    it('get() must invoke its callback at most once when the socket errors ' +
       'after the response was received', done => {
        const client = new RESTClient({
            host: 'localhost', port: 6677, logApi: clientLogApi,
        });

        // Fake ClientRequest we can drive: deliver a successful response,
        // then emit a socket 'error' afterwards (connection reset mid-stream).
        const fakeRequest = new EventEmitter();
        fakeRequest.setNoDelay = () => {};
        fakeRequest.end = () => {};

        const fakeResponse = new stream.Readable({ read() {} });
        fakeResponse.statusCode = 200;

        sinon.stub(http, 'request').callsFake((reqParams, responseCb) => {
            // Deliver on the next tick so the caller has attached its 'error'
            // handler to the returned request first.
            process.nextTick(() => {
                responseCb(fakeResponse);
                // 'readable' fires -> success path -> callback invocation #1
                fakeResponse.push('data');
                fakeResponse.push(null);
                // a socket error arrives AFTER the response -> this would be a
                // second callback invocation without the once() guard
                process.nextTick(() =>
                    fakeRequest.emit('error', new Error('socket hang up')));
            });
            return fakeRequest;
        });

        let callCount = 0;
        let firstErr;
        let firstRes;
        client.get('0'.repeat(40), undefined, 'requid-arsn594', (err, res) => {
            callCount += 1;
            if (callCount === 1) {
                firstErr = err;
                firstRes = res;
            }
        });

        setTimeout(() => {
            client.destroy();
            assert.strictEqual(callCount, 1,
                'get callback should be called exactly once, was called ' +
                `${callCount} times`);
            assert.ifError(firstErr);
            assert.strictEqual(firstRes, fakeResponse);
            done();
        }, 100);
    });
});
