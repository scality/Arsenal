const sinon = require('sinon');
const { default: Vault } = require('../../../lib/auth/Vault');
const { prepareStream } = require('../../../lib/s3middleware/prepareStream');
const { Transform } = require('stream');
const DummyRequestLogger = require('../helpers').DummyRequestLogger;

const log = new DummyRequestLogger();

describe('prepareStream', () => {
    const vault = new Vault();
    const stream = {
        headers: {},
        pipe: sinon.stub(),
    };

    beforeEach(() => {
        stream.headers['x-amz-content-sha256'] = 'STREAMING-AWS4-HMAC-SHA256-PAYLOAD';
    });

    it('should return the stream if sha256 header is not streaming', () => {
        stream.headers['x-amz-content-sha256'] = 'NOT-STREAMING';
        const result = prepareStream(stream, {}, vault, log);
        expect(result).toEqual(stream);
    });

    it('should pipe using V4Transform if sha256 header is streaming', () => {
        const result = prepareStream(stream, {}, vault, log);
        expect(result).toBeInstanceOf(Transform);
    });
});

