const assert = require('assert');
const { parseLegalHoldXml } = require('../../../lib/s3middleware/objectLegalHold');
const DummyRequestLogger = require('../helpers').DummyRequestLogger;

const log = new DummyRequestLogger();

function generateXml(status) {
    return `<LegalHold><Status>${status}</Status></LegalHold>`;
}

const expectedLegalHoldOn = {
    legalHold: {
        status: 'ON',
    },
};

const expectedLegalHoldOff = {
    legalHold: {
        status: 'OFF',
    },
};

const failTests = [
    {
        name: 'should fail with empty status',
        params: { status: '' },
        error: 'MalformedXML',
        errMessage: 'request xml does not contain Status',
    },
    {
        name: 'should fail with invalid status',
        params: { status: 'on' },
        error: 'MalformedXML',
        errMessage: 'Status request xml must be one of "ON", "OFF"',
    },
];

describe('object legal hold validation', () => {
    failTests.forEach(test => {
        it(test.name, done => {
            const status = test.params.status;
            parseLegalHoldXml(generateXml(status), log, err => {
                assert(err[test.error]);
                assert.strictEqual(err.description, test.errMessage);
                done();
            });
        });
    });

    it('should pass with legal hold status ON', done => {
        parseLegalHoldXml(generateXml('ON'), log, (err, result) => {
            assert.ifError(err);
            assert.deepStrictEqual(result, expectedLegalHoldOn);
            done();
        });
    });

    it('should pass with legal hold status OFF', done => {
        parseLegalHoldXml(generateXml('OFF'), log, (err, result) => {
            assert.ifError(err);
            assert.deepStrictEqual(result, expectedLegalHoldOff);
            done();
        });
    });
});
