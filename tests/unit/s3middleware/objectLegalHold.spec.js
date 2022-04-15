const assert = require('assert');
const { convertToXml, parseLegalHoldXml } =
    require('../../../lib/s3middleware/objectLegalHold');
const DummyRequestLogger = require('../helpers').DummyRequestLogger;

const log = new DummyRequestLogger();

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

const generateXml = status =>
    '<?xml version="1.0" encoding="UTF-8" standalone="yes"?>' +
    `<LegalHold><Status>${status}</Status></LegalHold>`;

describe('object legal hold helpers: parseLegalHoldXml', () => {
    failTests.forEach(test => {
        it(test.description, done => {
            const status = test.params.status;
            parseLegalHoldXml(generateXml(status), log, err => {
                assert(err.is[test.error]);
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

describe('object legal hold helpers: convertToXml', () => {
    it('should return correct xml when legal hold status "ON"', () => {
        const xml = convertToXml(true);
        const expextedXml = generateXml('ON');
        assert.strictEqual(xml, expextedXml);
    });

    it('should return correct xml when legal hold status "OFF"', () => {
        const xml = convertToXml(false);
        const expextedXml = generateXml('OFF');
        assert.strictEqual(xml, expextedXml);
    });

    it('should return empty string when legal hold not set', () => {
        const xml = convertToXml(undefined);
        const expextedXml = '';
        assert.strictEqual(xml, expextedXml);
    });
});
