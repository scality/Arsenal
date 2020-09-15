const assert = require('assert');
const {
    parseRetentionXml,
    convertToXml,
} = require('../../../lib/s3middleware/objectRetention');
const DummyRequestLogger = require('../helpers').DummyRequestLogger;

const log = new DummyRequestLogger();

const date = new Date();
date.setDate(date.getDate() + 1);
const failDate = new Date('05/01/2020');
const passDate = new Date();
passDate.setDate(passDate.getDate() + 2);


function buildXml(key, value) {
    const mode = key === 'Mode' ?
        `<Mode>${value}</Mode>` :
        '<Mode>GOVERNANCE</Mode>';
    const retainDate = key === 'RetainDate' ?
        `<RetainUntilDate>${value}</RetainUntilDate>` :
        `<RetainUntilDate>${date}</RetainUntilDate>`;
    const retention = key === 'Retention' ?
        `<Retention>${value}</Retention>` :
        `<Retention>${mode}${retainDate}</Retention>`;
    return retention;
}

const expectedRetention = {
    mode: 'GOVERNANCE',
    date: passDate.toISOString(),
};

const expectedXml =
    '<Retention xmlns="http://s3.amazonaws.com/doc/2006-03-01/">' +
    '<Mode>GOVERNANCE</Mode>' +
    `<RetainUntilDate>${passDate.toISOString()}</RetainUntilDate>` +
    '</Retention>';

const failTests = [
    {
        name: 'should fail with empty retention',
        params: { key: 'Retention', value: '' },
        error: 'MalformedXML',
        errMessage: 'request xml does not contain Retention',
    },
    {
        name: 'should fail with empty mode',
        params: { key: 'Mode', value: '' },
        error: 'MalformedXML',
        errMessage: 'request xml does not contain Mode',
    },
    {
        name: 'should fail with empty retain until date',
        params: { key: 'RetainDate', value: '' },
        error: 'MalformedXML',
        errMessage: 'request xml does not contain RetainUntilDate',
    },
    {
        name: 'should fail with invalid mode',
        params: { key: 'Mode', value: 'GOVERPLIANCE' },
        error: 'MalformedXML',
        errMessage: 'Mode request xml must be one of "GOVERNANCE", ' +
            '"COMPLIANCE"',
    },
    {
        name: 'should fail with retain until date in UTC format',
        params: { key: 'RetainDate', value: `${date.toUTCString()}` },
        error: 'InvalidRequest',
        errMessage: 'RetainUntilDate timestamp must be ISO-8601 format',
    },
    {
        name: 'should fail with retain until date in GMT format',
        params: { key: 'RetainDate', value: `${date.toString()}` },
        error: 'InvalidRequest',
        errMessage: 'RetainUntilDate timestamp must be ISO-8601 format',
    },
    {
        name: 'should fail with retain until date in past',
        params: { key: 'RetainDate', value: failDate.toISOString() },
        error: 'InvalidRequest',
        errMessage: 'RetainUntilDate must be in the future',
    },
];

describe('object Retention validation', () => {
    failTests.forEach(t => {
        it(t.name, done => {
            parseRetentionXml(buildXml(t.params.key, t.params.value), log,
            err => {
                assert(err[t.error]);
                assert.strictEqual(err.description, t.errMessage);
                done();
            });
        });
    });

    it('should pass with valid retention', done => {
        parseRetentionXml(buildXml('RetainDate', passDate.toISOString()), log,
        (err, result) => {
            assert.ifError(err);
            assert.deepStrictEqual(result, expectedRetention);
            done();
        });
    });
});

describe('object Retention xml', () => {
    it('should return empty string if no retention date', done => {
        const xml = convertToXml('GOVERNANCE', '');
        assert.equal(xml, '');
        done();
    });

    it('should return empty string if no retention mode', done => {
        const xml = convertToXml('', passDate.toISOString());
        assert.equal(xml, '');
        done();
    });

    it('should return xml string', done => {
        const xml = convertToXml('GOVERNANCE', passDate.toISOString());
        assert.strictEqual(xml, expectedXml);
        done();
    });
});
