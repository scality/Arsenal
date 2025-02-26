const sinon = require('sinon');
const { routesUtils } = require("../../../../lib/s3routes");
const werelogs = require('werelogs');
const assert = require("assert");

const logger = new werelogs.Logger('ErrorHtmlResponse', 'debug', 'debug');
const log = logger.newRequestLogger();

describe('routesutils.okHeaderResponse', () => {
    it('should return 200 status code and no body', done => {
        const headers = {
            'x-amz-request-id': 'request-id',
            'x-amz-id-2': 'request-id',
        };
        const httpCode = 200;
        const res = {
            setHeader: sinon.stub(),
            writeHead: sinon.stub(),
            end: () => {
                assert.strictEqual(res.setHeader.callCount, 5);
                assert.strictEqual(res.writeHead.calledWith(httpCode), true);
                done();
            },
        };
        routesUtils.okHeaderResponse(headers, res, httpCode, log);
    });
});
