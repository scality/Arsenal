const assert = require('assert');
const { parseLegalHoldXml } =
    require('../../../lib/s3middleware/objectLegalHold');
const DummyRequestLogger = require('../helpers').DummyRequestLogger;

const log = new DummyRequestLogger();

function generateXml(status) {
    return `<LegalHold><Status>${status}</Status></LegalHold>`;
}

const failTests = [
    {
        description: 'should fail with empty status',
        params: { status: '' },
        error: 'MalformedXML',
        errMessage: 'request xml does not contain Status',
    },
    {
        description: 'should fail with invalid status "on"',
        params: { status: 'on' },
        error: 'MalformedXML',
        errMessage: 'Status request xml must be one of "ON", "OFF"',
    },
    {
        description: 'should fail with invalid status "On"',
        params: { status: 'On' },
        error: 'MalformedXML',
        errMessage: 'Status request xml must be one of "ON", "OFF"',
    },
    {
        description: 'should fail with invalid status "off"',
        params: { status: 'off' },
        error: 'MalformedXML',
        errMessage: 'Status request xml must be one of "ON", "OFF"',
    },
    {
        description: 'should fail with invalid status "Off"',
        params: { status: 'Off' },
        error: 'MalformedXML',
        errMessage: 'Status request xml must be one of "ON", "OFF"',
    },
];

describe('object legal hold validation', () => {
    failTests.forEach(test => {
        it(test.description, done => {
            const status = test.params.status;
            parseLegalHoldXml(generateXml(status), log, err => {
                assert(err[test.error]);
                assert.strictEqual(err.description, test.errMessage);
                done();
            });
        });
    });

    it('should pass with legal hold status "ON"', done => {
        parseLegalHoldXml(generateXml('ON'), log, (err, result) => {
            assert.ifError(err);
            assert.strictEqual(result, true);
            done();
        });
    });

    it('should pass with legal hold status "OFF"', done => {
        parseLegalHoldXml(generateXml('OFF'), log, (err, result) => {
            assert.ifError(err);
            assert.strictEqual(result, false);
            done();
        });
    });
});
