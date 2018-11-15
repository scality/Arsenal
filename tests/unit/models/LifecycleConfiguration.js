const assert = require('assert');
const { parseString } = require('xml2js');
const errors = require('../../../lib/errors');

const LifecycleConfiguration =
    require('../../../lib/models/LifecycleConfiguration.js');

const days = {
    AbortIncompleteMultipartUpload: 'DaysAfterInitiation',
    NoncurrentVersionExpiration: 'NoncurrentDays',
    Expiration: 'Days',
};

const mockConfig = {
    replicationEndpoints: [
        {
            site: 'a',
        },
        {
            site: 'b',
        },
    ],
};

const MAX_DAYS = 2147483647; // Max 32-bit signed binary integer.
const date = new Date();
date.setUTCHours(0, 0, 0, 0);

/**
 * Format of xml request:
 <LifecycleConfiguration>
    <Rule>
        <ID>id1</ID>
        <Filter>
            <Prefix>logs/</Prefix>
        </Filter>
        <Status>Enabled</Status>
        <Expiration>
            <Days>365</Days>
        </Expiration>
    </Rule>
    <Rule>
        <ID>DeleteAfterBecomingNonCurrent</ID>
        <Filter>
            <And>
                <Prefix>logs/</Prefix>
                <Tag>
                    <Key>key1</Key>
                    <Value>value1</Value>
                </Tag>
            </And>
        </Filter>
        <Status>Enabled</Status>
        <NoncurrentVersionExpiration>
            <NoncurrentDays>1</NoncurrentDays>
        </NoncurrentVersionExpiration>
    </Rule>
</LifecycleConfiguration>
 */

const requiredTags = [
    { tag: 'LifecycleConfiguration', error: 'MalformedXML',
        errMessage: 'request xml is undefined or empty' },
    { tag: 'Rule', error: 'MissingRequiredParameter',
        errMessage: 'missing required key \'Rules\' in ' +
        'LifecycleConfiguration' },
    { tag: 'Status', error: 'MissingRequiredParameter',
        errMessage: 'Rule xml does not include Status' },
    { tag: 'Filter', error: 'MalformedXML',
        errMessage: 'Rule xml does not include valid Filter or Prefix' },
    { tag: 'Action', error: 'InvalidRequest',
        errMessage: 'Rule does not include valid action' }];

const invalidActions = [
    { tag: 'AbortIncompleteMultipartUpload', label: 'no-time',
        error: 'MalformedXML',
        errMessage: 'AbortIncompleteMultipartUpload action does not ' +
        'include DaysAfterInitiation' },
    { tag: 'AbortIncompleteMultipartUpload', label: 'no-tags',
        error: 'InvalidRequest', errMessage: 'Tag-based filter cannot be ' +
        'used with AbortIncompleteMultipartUpload action' },
    { tag: 'AbortIncompleteMultipartUpload', label: 'invalid-days',
        error: 'InvalidArgument',
        errMessage: 'DaysAfterInitiation is not a positive integer' },
    { tag: 'Expiration', label: 'no-time', error: 'MalformedXML',
        errMessage: 'Expiration action does not include an action time' },
    { tag: 'Expiration', label: 'mult-times', error: 'MalformedXML',
        errMessage: 'Expiration action includes more than one time' },
    { tag: 'Expiration', label: 'non-iso', error: 'InvalidArgument',
        errMessage: 'Date must be in ISO 8601 format' },
    { tag: 'Expiration', label: 'invalid-days', error: 'InvalidArgument',
        errMessage: 'Expiration days is not a positive integer' },
    { tag: 'Expiration', label: 'no-tags', inTag: 'ExpiredObjectDeleteMarker',
        error: 'InvalidRequest',
        errMessage: 'Tag-based filter cannot be used with ' +
        'ExpiredObjectDeleteMarker action' },
    { tag: 'Expiration', label: 'invalid-eodm', error: 'MalformedXML',
        errMessage: 'ExpiredObjDeleteMarker is not true or false' },
    { tag: 'NoncurrentVersionExpiration', label: 'no-time',
        error: 'MalformedXML',
        errMessage: 'NoncurrentVersionExpiration action does not include ' +
        'NoncurrentDays' },
    { tag: 'NoncurrentVersionExpiration', label: 'invalid-days',
        error: 'InvalidArgument',
        errMessage: 'NoncurrentDays is not a positive integer' }];

const invalidFilters = [
    { tag: 'Filter', label: 'also-prefix', error: 'MalformedXML',
        errMessage: 'Rule xml should not include both Filter and Prefix' },
    { tag: 'Filter', label: 'and-prefix-tag', error: 'MalformedXML',
        errMessage: 'Filter should only include one of And, Prefix, or ' +
        'Tag key' },
    { tag: 'And', label: 'only-prefix', error: 'MalformedXML',
        errMessage: 'And should include Prefix and Tags or more than one Tag' },
    { tag: 'And', label: 'single-tag', error: 'MalformedXML',
        errMessage: 'And should include Prefix and Tags or more than one Tag' },
    { tag: 'Tag', label: 'no-key', error: 'MissingRequiredParameter',
        errMessage: 'Tag XML does not contain both Key and Value' },
    { tag: 'Tag', label: 'no-value', error: 'MissingRequiredParameter',
        errMessage: 'Tag XML does not contain both Key and Value' },
    { tag: 'Tag', label: 'key-too-long', error: 'InvalidRequest',
        errMessage: 'Tag Key must be a length between 1 and 128 char' }];

function generateAction(errorTag, tagObj) {
    const xmlObj = {};
    if (tagObj) {
        let middleTags = '';
        if (tagObj.label === 'no-time') {
            middleTags = '';
        }
        if (tagObj.label === 'no-tags') {
            middleTags = tagObj.inTag ?
                `<${tagObj.inTag}>true</${tagObj.inTag}>` :
                `<${days[tagObj.tag]}>1</${days[tagObj.tag]}>`;
            xmlObj.filter = '<Filter><Tag><Key>key</Key>' +
            '<Value></Value></Tag></Filter>';
        }
        if (tagObj.label === 'invalid-days') {
            middleTags = `<${days[tagObj.tag]}>0</${days[tagObj.tag]}>`;
        }
        if (tagObj.label === 'mult-times') {
            middleTags = `<Days>1</Days><Date>${date}</Date>`;
        }
        if (tagObj.label === 'non-iso') {
            middleTags = '<Date>03-08-2018</Date>';
        }
        if (tagObj.label === 'invalid-eodm') {
            middleTags = '<ExpiredObjectDeleteMarker>foo' +
                '</ExpiredObjectDeleteMarker>';
        }
        xmlObj.actions = `<${tagObj.tag}>${middleTags}</${tagObj.tag}>`;
    } else {
        xmlObj.actions = '';
    }
    return xmlObj;
}

function generateFilter(errorTag, tagObj) {
    let Filter;
    let middleTags = '';
    if (tagObj) {
        if (tagObj.label === 'and-prefix-tag') {
            middleTags = '<And></And><Prefix></Prefix><Tag></Tag>';
        }
        if (tagObj.label === 'only-prefix') {
            middleTags = '<And><Prefix></Prefix></And>';
        }
        if (tagObj.label === 'single-tag') {
            middleTags = '<And><Tags><Key>fo</Key><Value></Value></Tags></And>';
        }
        if (tagObj.label === 'no-key') {
            middleTags = '<Tag><Value></Value></Tag>';
        }
        if (tagObj.label === 'no-value') {
            middleTags = '<Tag><Key></Key></Tag>';
        }
        if (tagObj.label === 'key-too-long') {
            const longKey = 'a'.repeat(129);
            middleTags = `<Tag><Key>${longKey}</Key><Value></Value></Tag>`;
        }
        if (tagObj.label === 'mult-prefixes') {
            middleTags = '<Prefix>foo</Prefix><Prefix>bar</Prefix>' +
                `<Prefix>${tagObj.lastPrefix}</Prefix>`;
        }
        if (tagObj.label === 'mult-tags') {
            middleTags = '<And><Tag><Key>color</Key><Value>blue</Value></Tag>' +
                '<Tag><Key>shape</Key><Value>circle</Value></Tag></And>';
        }
        Filter = `<Filter>${middleTags}</Filter>`;
        if (tagObj.label === 'also-prefix') {
            Filter = '<Filter></Filter><Prefix></Prefix>';
        }
    } else {
        Filter = '';
    }
    return Filter;
}

function generateRule(errorTag, tagObj, ID, Status, Filter, Action) {
    let Rule;
    if (tagObj && tagObj.rule === 'not-unique-id') {
        Rule = `<Rule>${ID + Status + Filter + Action}</Rule>` +
        `<Rule>${ID + Status + Filter + Action}</Rule>`;
    } else if (tagObj && tagObj.rule === 'too-many-rules') {
        for (let i = 0; i <= 1000; i++) {
            // eslint-disable-next-line no-param-reassign
            ID = `<ID>foo${i}</ID>`;
            Rule = `${Rule}<Rule>${ID + Status + Filter + Action}</Rule>`;
        }
    } else {
        Rule = '';
    }
    return Rule;
}

function generateXml(errorTag, tagObj) {
    let ID;
    let Status;
    let Filter;
    let Action;
    let Rule;
    if (errorTag === 'ID') {
        ID = tagObj && tagObj.id ? `<ID>${tagObj.id}</ID>` : '';
    } else {
        ID = '<ID>foo</ID>';
    }
    if (errorTag === 'Status') {
        Status = tagObj && tagObj.status ?
            `<Status>${tagObj.status}</Status>` : '';
    } else {
        Status = '<Status>Enabled</Status>';
    }
    if (errorTag === 'Filter') {
        Filter = generateFilter(errorTag, tagObj);
    } else {
        Filter = '<Filter></Filter>';
    }
    if (errorTag === 'Action') {
        const xmlObj = generateAction(errorTag, tagObj);
        Action = xmlObj.actions;
        Filter = xmlObj.filter ? xmlObj.filter : Filter;
    } else {
        Action = '<Expiration><Days>1</Days></Expiration>';
    }
    if (errorTag === 'Rule') {
        Rule = generateRule(errorTag, tagObj, ID, Status, Filter, Action);
    } else {
        Rule = `<Rule>${ID + Status + Filter + Action}</Rule>`;
    }
    const Lifecycle = errorTag === 'LifecycleConfiguration' ? '' :
        `<LifecycleConfiguration>${Rule}` +
        '</LifecycleConfiguration>';
    return Lifecycle;
}

function generateParsedXml(errorTag, tagObj, cb) {
    const xml = generateXml(errorTag, tagObj);
    parseString(xml, (err, parsedXml) => {
        assert.equal(err, null, 'Error parsing xml');
        cb(parsedXml);
    });
}

function checkError(parsedXml, error, errMessage, cb) {
    const lcConfig = new LifecycleConfiguration(parsedXml, mockConfig)
        .getLifecycleConfiguration();
    assert.strictEqual(lcConfig.error[error], true);
    assert.strictEqual(lcConfig.error.description, errMessage);
    cb();
}

describe('LifecycleConfiguration class getLifecycleConfiguration', () => {
    let tagObj;
    beforeEach(() => {
        tagObj = {};
    });

    it('should return MalformedXML error if request xml is empty', done => {
        const errMessage = 'request xml is undefined or empty';
        checkError('', 'MalformedXML', errMessage, done);
    });

    requiredTags.forEach(t => {
        it(`should return ${t.error} error if ${t.tag} tag is missing`,
        done => {
            generateParsedXml(t.tag, null, parsedXml => {
                checkError(parsedXml, t.error, t.errMessage, done);
            });
        });
    });

    invalidActions.forEach(a => {
        it(`should return ${a.error} for ${a.label} action error`,
        done => {
            generateParsedXml('Action', a, parsedXml => {
                checkError(parsedXml, a.error, a.errMessage, done);
            });
        });
    });

    invalidFilters.forEach(filter => {
        it(`should return ${filter.error} for ${filter.label} filter error`,
        done => {
            generateParsedXml('Filter', filter, parsedXml => {
                checkError(parsedXml, filter.error, filter.errMessage, done);
            });
        });
    });

    it('should return MalformedXML error if invalid status', done => {
        tagObj.status = 'foo';
        const errMessage = 'Status is not valid';
        generateParsedXml('Status', tagObj, parsedXml => {
            checkError(parsedXml, 'MalformedXML', errMessage, done);
        });
    });

    it('should return InvalidRequest error if ID not unique', done => {
        tagObj.rule = 'not-unique-id';
        const errMessage = 'Rule ID must be unique';
        generateParsedXml('Rule', tagObj, parsedXml => {
            checkError(parsedXml, 'InvalidRequest', errMessage, done);
        });
    });

    it('should return InvalidArgument error if invalid ID', done => {
        tagObj.id = 'a'.repeat(256);
        const errMessage = 'Rule ID is greater than 255 characters long';
        generateParsedXml('ID', tagObj, parsedXml => {
            checkError(parsedXml, 'InvalidArgument', errMessage, done);
        });
    });

    it('should return MalformedXML error if over 1000 rules', done => {
        tagObj.rule = 'too-many-rules';
        const errMessage = 'request xml includes over max limit of 1000 rules';
        generateParsedXml('Rule', tagObj, parsedXml => {
            checkError(parsedXml, 'MalformedXML', errMessage, done);
        });
    });

    it('should apply all unique Key tags if multiple tags included', done => {
        tagObj.label = 'mult-tags';
        generateParsedXml('Filter', tagObj, parsedXml => {
            const lcConfig = new LifecycleConfiguration(parsedXml, mockConfig)
                .getLifecycleConfiguration();
            const expected = [{ key: 'color', val: 'blue' },
                { key: 'shape', val: 'circle' }];
            assert.deepStrictEqual(expected, lcConfig.rules[0].filter.tags);
            done();
        });
    });
});

describe('LifecycleConfiguration', () => {
    const lifecycleConfiguration = new LifecycleConfiguration({}, mockConfig);
    function getParsedXML() {
        return {
            LifecycleConfiguration: {
                Rule: [{
                    ID: ['test-id'],
                    Prefix: [''],
                    Status: ['Enabled'],
                    Expiration: [{
                        Days: 1,
                    }],
                }],
            },
        };
    }

    describe('::_getRuleFilter', () => {
        it('should get Prefix', () => {
            const rule = getParsedXML().LifecycleConfiguration.Rule[0];
            const ruleFilter = lifecycleConfiguration._getRuleFilter(rule);
            assert.strictEqual(ruleFilter, "prefix ''");
        });

        it('should get Filter.Prefix', () => {
            const rule = getParsedXML().LifecycleConfiguration.Rule[0];
            delete rule.Prefix;
            rule.Filter = [{ Prefix: [''] }];
            const ruleFilter = lifecycleConfiguration._getRuleFilter(rule);
            assert.strictEqual(ruleFilter, "filter '(prefix=)'");
        });

        it('should get Filter.Tag', () => {
            const rule = getParsedXML().LifecycleConfiguration.Rule[0];
            delete rule.Prefix;
            rule.Filter = [{ Tag: [{ Key: ['a'], Value: [''] }] }];
            const ruleFilter = lifecycleConfiguration._getRuleFilter(rule);
            assert.strictEqual(ruleFilter, "filter '(tag: key=a, value=)'");
        });

        it('should get Filter.And', () => {
            const rule = getParsedXML().LifecycleConfiguration.Rule[0];
            delete rule.Prefix;
            rule.Filter = [{
                And: [{
                    Prefix: [''],
                    Tag: [{
                        Key: ['a'],
                        Value: ['b'],
                    },
                    {
                        Key: ['c'],
                        Value: ['d'],
                    }],
                }],
            }];
            const ruleFilter = lifecycleConfiguration._getRuleFilter(rule);
            assert.strictEqual(ruleFilter, 'filter ' +
                "'(prefix= and tag: key=a, value=b and tag: key=c, value=d)'");
        });

        it('should get Filter.And without Prefix', () => {
            const rule = getParsedXML().LifecycleConfiguration.Rule[0];
            delete rule.Prefix;
            rule.Filter = [{
                And: [{
                    Tag: [{
                        Key: ['a'],
                        Value: ['b'],
                    },
                    {
                        Key: ['c'],
                        Value: ['d'],
                    }],
                }],
            }];
            const ruleFilter = lifecycleConfiguration._getRuleFilter(rule);
            assert.strictEqual(ruleFilter,
                "filter '(tag: key=a, value=b and tag: key=c, value=d)'");
        });
    });

    describe('::_checkDays', () => {
        it(`should return no error when days value is 0 - ${MAX_DAYS}`, () => {
            const error = lifecycleConfiguration._checkDays({
                days: 0,
            });
            assert.strictEqual(error, null);
        });

        it('should return error when exceeding max value', () => {
            const error = lifecycleConfiguration._checkDays({
                days: MAX_DAYS + 1,
                field: 'a',
                ancestor: 'b',
            });
            const msg = "'a' in b action must not exceed 2147483647";
            const expected = errors.MalformedXML.customizeDescription(msg);
            assert.deepStrictEqual(error, expected);
        });

        it('should return error when negative value', () => {
            const error = lifecycleConfiguration._checkDays({
                days: -1,
                field: 'a',
                ancestor: 'b',
            });
            const msg = "'a' in b action must be nonnegative";
            const expected = errors.InvalidArgument.customizeDescription(msg);
            assert.deepStrictEqual(error, expected);
        });
    });

    describe('::_checkStorageClasses', () => {
        it('should return no error when StorageClass is first one used', () => {
            const error = lifecycleConfiguration._checkStorageClasses({
                usedStorageClasses: [],
                storageClass: 'a',
            });
            assert.strictEqual(error, null);
        });

        it('should return no error when StorageClass has not been used', () => {
            const error = lifecycleConfiguration._checkStorageClasses({
                usedStorageClasses: ['a'],
                storageClass: 'b',
            });
            assert.strictEqual(error, null);
        });

        it('should return error when unknown StorageClass is given', () => {
            const error = lifecycleConfiguration._checkStorageClasses({
                storageClass: 'c',
            });
            const msg = "'StorageClass' must be one of 'a', 'b'";
            const expected = errors.MalformedXML.customizeDescription(msg);
            assert.deepStrictEqual(error, expected);
        });

        it('should return error when StorageClass has been used', () => {
            const error = lifecycleConfiguration._checkStorageClasses({
                usedStorageClasses: ['a'],
                storageClass: 'a',
                field: 'a',
                ancestor: 'b',
                rule: getParsedXML().LifecycleConfiguration.Rule[0],
            });
            const msg = "'StorageClass' must be different for 'b' actions " +
                "in same 'Rule' with prefix ''";
            const expected = errors.InvalidRequest.customizeDescription(msg);
            assert.deepStrictEqual(error, expected);
        });
    });

    describe('::_checkTimeType', () => {
        it('should return no error when first time type in rule', () => {
            const error = lifecycleConfiguration._checkTimeType({
                usedTimeType: null,
                currentTimeType: 'Date',
                rule: {},
            });
            assert.strictEqual(error, null);
        });

        it('should return no error when time type is same as others', () => {
            const error = lifecycleConfiguration._checkTimeType({
                usedTimeType: 'Date',
                currentTimeType: 'Date',
                rule: {},
            });
            assert.strictEqual(error, null);
        });

        it('should return error when time type differs from others', () => {
            const error = lifecycleConfiguration._checkTimeType({
                usedTimeType: 'Date',
                currentTimeType: 'Days',
                rule: getParsedXML().LifecycleConfiguration.Rule[0],
            });
            const msg = "Found mixed 'Date' and 'Days' based Transition " +
                "actions in lifecycle rule for prefix ''";
            const expected = errors.InvalidRequest.customizeDescription(msg);
            assert.deepStrictEqual(error, expected);
        });

        it('should return error when time type differs across expiration',
        () => {
            const error = lifecycleConfiguration._checkTimeType({
                usedTimeType: 'Date',
                currentTimeType: 'Date',
                rule: getParsedXML().LifecycleConfiguration.Rule[0],
            });
            const msg = "Found mixed 'Date' and 'Days' based Expiration and " +
                "Transition actions in lifecycle rule for prefix ''";
            const expected = errors.InvalidRequest.customizeDescription(msg);
            assert.deepStrictEqual(error, expected);
        });
    });

    describe('::_checkDate', () => {
        it('should return no error valid ISO date', () => {
            const date = '2016-01-01T00:00:00.000Z';
            const error = lifecycleConfiguration._checkDate(date);
            assert.strictEqual(error, null);
        });

        it('should return error when invalid ISO date', () => {
            const date = 'Fri, 01 Jan 2016 00:00:00 GMT';
            const error = lifecycleConfiguration._checkDate(date);
            const msg = 'Date must be in ISO 8601 format';
            const expected = errors.InvalidArgument.customizeDescription(msg);
            assert.deepStrictEqual(error, expected);
        });
    });

    describe('::_parseNoncurrentVersionTransition', () => {
        function getRule() {
            return {
                NoncurrentVersionTransition: [
                    {
                        NoncurrentDays: ['0'],
                        StorageClass: ['a'],
                    },
                    {
                        NoncurrentDays: ['1'],
                        StorageClass: ['b'],
                    },
                ],
            };
        }

        it('should return correctly parsed result object', () => {
            const rule = getRule();
            const result =
                lifecycleConfiguration._parseNoncurrentVersionTransition(rule);
            assert.deepStrictEqual(result, {
                nonCurrentVersionTransition: [
                    {
                        noncurrentDays: 0,
                        storageClass: 'a',
                    },
                    {
                        noncurrentDays: 1,
                        storageClass: 'b',
                    },
                ],
            });
        });

        it('should return parsed result object with error', () => {
            const rule = getRule();
            rule.NoncurrentVersionTransition[0].NoncurrentDays[0] = '-1';
            const result =
                lifecycleConfiguration._parseNoncurrentVersionTransition(rule);
            const msg = "'NoncurrentDays' in NoncurrentVersionTransition " +
                'action must be nonnegative';
            const error = errors.InvalidArgument.customizeDescription(msg);
            assert.deepStrictEqual(result.error, error);
        });
    });

    describe('::_parseTransition', () => {
        function getRule() {
            return {
                Transition: [
                    {
                        Days: ['0'],
                        StorageClass: ['a'],
                    },
                    {
                        Days: ['1'],
                        StorageClass: ['b'],
                    },
                ],
            };
        }

        it('should return correctly parsed result object', () => {
            const rule = getRule();
            const result = lifecycleConfiguration._parseTransition(rule);
            assert.deepStrictEqual(result, {
                transition: [
                    {
                        days: 0,
                        storageClass: 'a',
                    },
                    {
                        days: 1,
                        storageClass: 'b',
                    },
                ],
            });
        });

        it('should return parsed result object with error', () => {
            const rule = getRule();
            rule.Transition[0].Days[0] = '-1';
            const result = lifecycleConfiguration._parseTransition(rule);
            const msg = "'Days' in Transition action must be nonnegative";
            const error = errors.InvalidArgument.customizeDescription(msg);
            assert.deepStrictEqual(result.error, error);
        });
    });
});
