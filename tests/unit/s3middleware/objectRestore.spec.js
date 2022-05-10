const assert = require('assert');
const { convertToXml, parseRestoreRequestXml } =
    require('../../../lib/s3middleware/objectRestore');
const DummyRequestLogger = require('../helpers').DummyRequestLogger;

const log = new DummyRequestLogger();

const generateXml = (days, tier) => {
    const daysElement = days ? `<Days>${days}</Days>` : '';
    const tierElement = tier ? `<Tier>${tier}</Tier>` : '';
    return [
        '<RestoreRequest xmlns="http://s3.amazonaws.com/doc/2006-03-01/">',
        `${daysElement}`,
        `${tierElement}`,
        '</RestoreRequest>',
    ].join('');
};

const validDay = '1';
const invalidDays1 = 'abc';
const invalidDays2 = '0';
const invalidDays3 = '2147483648';
const standardTier = 'Standard';
const bulkTier = 'Bulk';
const expedited = 'Expedited';
const invalidTier = 'InvalidTier';

const failTests = [
    {
        description: 'should fail with empty request xml',
        requestXml: '',
        error: 'MalformedXML',
        errMessage: 'request xml is undefined or empty',
    },
    {
        description: 'should fail without RestoreRequest param',
        requestXml: '<OtherRequest></OtherRequest>',
        error: 'MalformedXML',
        errMessage: 'request xml does not contain RestoreRequest',
    },
    {
        description: 'should fail without RestoreRequest.Days param',
        requestXml: generateXml(null, null),
        error: 'MalformedXML',
        errMessage: 'request xml does not contain RestoreRequest.Days',
    },
    {
        description: 'should fail with RestoreRequest.Days param is not integer',
        requestXml: generateXml(invalidDays1, null),
        error: 'MalformedXML',
        errMessage: `RestoreRequest.Days is invalid type. [${invalidDays1}]`,
    },
    {
        description: 'should fail with RestoreRequest.Days param is not greater than 0',
        requestXml: generateXml(invalidDays2, null),
        error: 'MalformedXML',
        errMessage: `RestoreRequest.Days must be greater than 0. [${invalidDays2}]`,
    },
    {
        description: 'should fail with RestoreRequest.Days param is not less than 2147483648',
        requestXml: generateXml(invalidDays3, null),
        error: 'MalformedXML',
        errMessage: `RestoreRequest.Days must be less than 2147483648. [${invalidDays3}]`,
    },
    {
        description: 'should fail with RestoreRequest.Tier not in [\'Expedited\', \'Standard\', \'Bulk\']',
        requestXml: generateXml(validDay, invalidTier),
        error: 'MalformedXML',
        errMessage: `RestoreRequest.Tier is invalid value. [${invalidTier}]`,
    },
];


describe('object restore: parseRestoreRequestXml', () => {
    failTests.forEach(test => {
        it(test.description, done => {
            parseRestoreRequestXml(test.requestXml, log, err => {
                assert(err.is[test.error]);
                assert.strictEqual(err.description, test.errMessage);
                done();
            });
        });
    });

    it('should pass with valid days and standard tier', done => {
        parseRestoreRequestXml(generateXml(validDay, standardTier), log, (err, result) => {
            assert.ifError(err);
            assert.strictEqual(result.days, Number.parseInt(validDay, 10));
            assert.strictEqual(result.tier, standardTier);
            done();
        });
    });

    it('should pass with valid days and bulk tier', done => {
        parseRestoreRequestXml(generateXml(validDay, bulkTier), log, (err, result) => {
            assert.ifError(err);
            assert.strictEqual(result.days, Number.parseInt(validDay, 10));
            assert.strictEqual(result.tier, bulkTier);
            done();
        });
    });

    it('should pass with valid days and expedited tier', done => {
        parseRestoreRequestXml(generateXml(validDay, expedited), log, (err, result) => {
            assert.ifError(err);
            assert.strictEqual(result.days, Number.parseInt(validDay, 10));
            assert.strictEqual(result.tier, expedited);
            done();
        });
    });

    it('should set tier to Standard if not specified', done => {
        parseRestoreRequestXml(generateXml(validDay, null), log, (err, result) => {
            assert.ifError(err);
            assert.strictEqual(result.days, Number.parseInt(validDay, 10));
            assert.strictEqual(result.tier, standardTier);
            done();
        });
    });
});

describe('object restore: convertToXml', () => {
    it('should return correct xml with both day and tier', () => {
        const xml = convertToXml(validDay, standardTier);
        const expextedXml = generateXml(validDay, standardTier);
        assert.strictEqual(xml, expextedXml);
    });

    it('should return empty string when day not set', () => {
        const xml = convertToXml(null, standardTier);
        const expextedXml = '';
        assert.strictEqual(xml, expextedXml);
    });

    it('should return empty string when tier not set', () => {
        const xml = convertToXml(validDay, null);
        const expextedXml = '';
        assert.strictEqual(xml, expextedXml);
    });

    it('should return empty string when day and tier not set', () => {
        const xml = convertToXml(null, null);
        const expextedXml = '';
        assert.strictEqual(xml, expextedXml);
    });
});
