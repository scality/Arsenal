const sinon = require('sinon');
const assert = require('assert');
const werelogs = require('werelogs');
const {
    setServerHeader,
    okHeaderResponse,
} = require('../../../../lib/s3routes/routesUtils');

const logger = new werelogs.Logger('test:setServerHeader', 'debug', 'debug');
const log = logger.newRequestLogger();

describe('setServerHeader', () => {
    let mockResponse;
    let sandbox;

    beforeEach(() => {
        sandbox = sinon.createSandbox();

        mockResponse = {
            headersSent: false,
            setHeader: sandbox.stub(),
            writeHead: sandbox.stub(),
            end: sandbox.stub().callsFake(callback => callback && callback()),
            statusCode: 200,
        };

        sandbox.stub(log, 'debug');
        sandbox.stub(log, 'end').returns({
            info: sandbox.stub(),
        });
    });

    afterEach(() => {
        // Reset to default after each test
        setServerHeader('S3 Server');
        sandbox.restore();
    });

    it('should use the default value "S3 Server" when not configured', () => {
        okHeaderResponse({}, mockResponse, 200, log);

        assert(mockResponse.setHeader.calledWith('server', 'S3 Server'));
    });

    it('should use a custom value when configured via setServerHeader', () => {
        setServerHeader('ScalityS3');

        okHeaderResponse({}, mockResponse, 200, log);

        assert(mockResponse.setHeader.calledWith('server', 'ScalityS3'));
    });
});
