const assert = require('assert');
const { parseString } = require('xml2js');

const ObjectLockConfiguration =
    require('../../../lib/models/ObjectLockConfiguration.js');

function checkError(parsedXml, err, errMessage, cb) {
    const config = new ObjectLockConfiguration(parsedXml).
        getValidatedObjectLockConfiguration();
    assert.strictEqual(config.error[err], true);
    assert.strictEqual(config.error.description, errMessage);
    cb();
}

function generateRule(testParams) {
    if (testParams.key === 'Rule') {
        return `<Rule>${testParams.value}</Rule>`;
    }
    if (testParams.key === 'DefaultRetention') {
        return `<Rule><DefaultRetention>${testParams.value} ` +
            '</DefaultRetention></Rule>';
    }
    const mode = testParams.key === 'Mode' ?
        `<Mode>${testParams.value}</Mode>` : '<Mode>GOVERNANCE</Mode>';

    let time = '<Days>1</Days>';
    if (testParams.key === 'Days') {
        time = `<Days>${testParams.value}</Days>`;
    }
    if (testParams.key === 'Years') {
        time = `<Years>${testParams.value}</Years>`;
    }
    return `<Rule><DefaultRetention>${mode}${time}</DefaultRetention></Rule>`;
}

function generateXml(testParams) {
    const Enabled = testParams.key === 'ObjectLockEnabled' ?
        `<ObjectLockEnabled>${testParams.value}</ObjectLockEnabled>` :
        '<ObjectLockEnabled>Enabled</ObjectLockEnabled>';
    const Rule = generateRule(testParams);
    const ObjectLock = testParams.key === 'ObjectLockConfiguration' ? '' :
        `<ObjectLockConfiguration>${Enabled}${Rule}` +
        '</ObjectLockConfiguration>';
    return ObjectLock;
}

function generateParsedXml(testParams, cb) {
    const xml = generateXml(testParams);
    parseString(xml, (err, parsedXml) => {
        assert.equal(err, null, 'Error parsing xml');
        cb(parsedXml);
    });
}

const failTests = [
    {
        name: 'fail with empty configuration',
        params: { key: 'ObjectLockConfiguration' },
        error: 'MalformedXML',
        errorMessage: 'request xml is undefined or empty',
    },
    {
        name: 'fail with empty ObjectLockEnabled',
        params: { key: 'ObjectLockEnabled', value: '' },
        error: 'MalformedXML',
        errorMessage: 'request xml does not include valid ObjectLockEnabled',
    },
    {
        name: 'fail with invalid value for ObjectLockEnabled',
        params: { key: 'ObjectLockEnabled', value: 'Disabled' },
        error: 'MalformedXML',
        errorMessage: 'request xml does not include valid ObjectLockEnabled',
    },
    {
        name: 'fail with empty rule',
        params: { key: 'Rule', value: '' },
        error: 'MalformedXML',
        errorMessage: 'Rule request xml does not contain DefaultRetention',
    },
    {
        name: 'fail with empty DefaultRetention',
        params: { key: 'DefaultRetention', value: '' },
        error: 'MalformedXML',
        errorMessage: 'DefaultRetention request xml does not contain Mode or ' +
            'retention period (Days or Years)',
    },
    {
        name: 'fail with empty mode',
        params: { key: 'Mode', value: '' },
        error: 'MalformedXML',
        errorMessage: 'request xml does not contain Mode',
    },
    {
        name: 'fail with invalid mode',
        params: { key: 'Mode', value: 'COMPLOVERNANCE' },
        error: 'MalformedXML',
        errorMessage: 'Mode request xml must be one of "GOVERNANCE", ' +
            '"COMPLIANCE"',
    },
    {
        name: 'fail with lowercase mode',
        params: { key: 'Mode', value: 'governance' },
        error: 'MalformedXML',
        errorMessage: 'Mode request xml must be one of "GOVERNANCE", ' +
            '"COMPLIANCE"',
    },
    {
        name: 'fail with empty retention period',
        params: { key: 'Days', value: '' },
        error: 'MalformedXML',
        errorMessage: 'request xml does not contain Days or Years',
    },
    {
        name: 'fail with NaN retention period',
        params: { key: 'Days', value: 'one' },
        error: 'MalformedXML',
        errorMessage: 'request xml does not contain valid retention period',
    },
    {
        name: 'fail with retention period less than 1',
        params: { key: 'Days', value: 0 },
        error: 'InvalidArgument',
        errorMessage: 'retention period must be a positive integer',
    },
    {
        name: 'fail with Days retention period greater than 36500',
        params: { key: 'Days', value: 36501 },
        error: 'InvalidArgument',
        errorMessage: 'retention period is too large',
    },
    {
        name: 'fail with Years retention period great than 100',
        params: { key: 'Years', value: 101 },
        error: 'InvalidArgument',
        errorMessage: 'retention period is too large',
    },
];

const passTests = [
    {
        name: 'pass with GOVERNANCE retention mode and valid Days ' +
            'retention period',
        params: {},
    },
    {
        name: 'pass with COMPLIANCE retention mode',
        params: { key: 'Mode', value: 'COMPLIANCE' },
    },
    {
        name: 'pass with valid Years retention period',
        params: { key: 'Years', value: 1 },
    },
];

describe('ObjectLockConfiguration class getValidatedObjectLockConfiguration',
() => {
    it('should return MalformedXML error if request xml is empty', done => {
        const errMessage = 'request xml is undefined or empty';
        checkError('', 'MalformedXML', errMessage, done);
    });

    failTests.forEach(test => {
        it(`should ${test.name}`, done => {
            generateParsedXml(test.params, xml => {
                checkError(xml, test.error, test.errorMessage, done);
            });
        });
    });

    passTests.forEach(test => {
        it(`should ${test.name}`, done => {
            generateParsedXml(test.params, xml => {
                const config = new ObjectLockConfiguration(xml).
                    getValidatedObjectLockConfiguration();
                assert.ifError(config.error);
                done();
            });
        });
    });
});
