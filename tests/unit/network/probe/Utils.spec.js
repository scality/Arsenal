const assert = require('assert');
const errors = require('../../../../lib/errors');
const { sendError, sendSuccess } = require('../../../../lib/network/probe/Utils');
const sinon = require('sinon');

describe('network.probe.Utils', () => {
    let mockLogger;

    beforeEach(() => {
        mockLogger = {
            debug: sinon.fake(),
        };
    });

    afterEach(() => {
        sinon.restore();
    });

    it('send success will return 200 OK', done => {
        const mockRes = {
            writeHead: sinon.fake(status => assert.strictEqual(200, status)),
            end: sinon.fake(msg => {
                assert.strictEqual(msg, 'OK');
                done();
            }),
        };
        sendSuccess(mockRes, mockLogger);
    });

    it('send success will return 200 and optional message', done => {
        const mockRes = {
            writeHead: sinon.fake(status => assert.strictEqual(200, status)),
            end: sinon.fake(msg => {
                assert.strictEqual(msg, 'Granted');
                done();
            }),
        };
        sendSuccess(mockRes, mockLogger, 'Granted');
    });

    it('send error will return send an Arsenal Error and code', done => {
        const mockRes = {
            writeHead: sinon.fake(status => assert.strictEqual(405, status)),
            end: sinon.fake(msg => {
                assert.deepStrictEqual(
                    JSON.parse(msg),
                    {
                        errorType: 'MethodNotAllowed',
                        errorMessage: errors.MethodNotAllowed.description,
                    }
                );
                done();
            }),
        };
        sendError(mockRes, mockLogger, errors.MethodNotAllowed);
    });

    it('send error will return send an Arsenal Error and code using optional message', done => {
        const mockRes = {
            writeHead: sinon.fake(status => assert.strictEqual(405, status)),
            end: sinon.fake(msg => {
                assert.deepStrictEqual(
                    JSON.parse(msg),
                    {
                        errorType: 'MethodNotAllowed',
                        errorMessage: 'Very much not allowed',
                    }
                );
                done();
            }),
        };
        sendError(mockRes, mockLogger, errors.MethodNotAllowed, 'Very much not allowed');
    });
});
