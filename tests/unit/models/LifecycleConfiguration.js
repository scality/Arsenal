const assert = require('assert');
const { parseString } = require('xml2js');

const LifecycleConfiguration =
    require('../../../lib/models/LifecycleConfiguration.js');

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
    { tag: 'LifecycleConfiguration',
        errMessage: 'request xml is undefined or empty' },
    { tag: 'Rule',
        errMessage: 'request xml does not include at least one rule' },
    { tag: 'Status', errMessage: 'Rule xml does not include Status' },
    { tag: 'Filter', errMessage: 'Rule xml does not include valid Filter ' +
        'or Prefix' },
    { tag: 'Action', errMessage: 'Rule does not include valid action' }];

const validActions = [
    { tag: 'Expiration',
        errMessage: 'Expiration action does not include an action time' },
    { tag: 'NoncurrentVersionExpiration',
        errMessage: 'NoncurrentVersionExpiration action does not include ' +
        'NoncurrentDays' },
    { tag: 'AbortIncompleteMultipartUpload',
        errMessage: 'AbortIncompleteMultipartUpload action does not ' +
        'include DaysAfterInitiation' }];

const invalidActions = [
    { tag: 'foo', errMessage: 'Rule does not include valid action' },
    { tag: 'invalid-days-value',
        errMessage: 'Expiration days is not a positive integer' },
    { tag: 'abortMPU-tag',
        errMessage: 'Tag-based filter cannot be used with ' +
        'AbortIncompleteMultipartUpload action' }];

const notImplementedActions = [
    { tag: 'Transition',
        errMessage: 'Transition lifecycle action not yet implemented' },
    { tag: 'NoncurrentVersionTransition',
        errMessage: 'Transition lifecycle action not yet implemented' }];

const invalidFilters = [
    { tag: 'two-prefixes',
        errMessage: 'Filter includes more than one Prefix' },
    { tag: 'invalid-tag',
        errMessage: 'Tag XML does not contain both Key and Value' }];

const invalidRequests = [
    { tag: 'not-unique-id',
        errMessage: 'Rule ID must be unique' },
    { tag: 'key-too-long',
        errMessage: 'Tag Key must be a length between 1 and 128 char' }];

function generateFilter(errorTag, tagValue) {
    let Filter;
    if (tagValue && tagValue.filter === 'two-prefixes') {
        Filter = '<Filter><Prefix>foo</Prefix>' +
            '<Prefix>foo2</Prefix></Filter>';
    } else if (tagValue && tagValue.filter === 'invalid-tag') {
        Filter = '<Filter><Tag></Tag></Filter>';
    } else {
        Filter = '';
    }
    return Filter;
}

function generateAction(errorTag, tagValue) {
    const xmlObj = {};
    if (tagValue && tagValue.action === 'invalid-days-value') {
        xmlObj.actions = '<Expiration><Days>0</Days></Expiration>';
    } else if (tagValue && tagValue.action === 'abortMPU-tag') {
        xmlObj.actions = '<AbortIncompleteMultipartUpload>' +
            '</AbortIncompleteMultipartUpload>';
        xmlObj.filter = '<Filter><Tag><Key>key</Key>' +
            '<Value></Value></Tag></Filter>';
    } else {
        xmlObj.actions = tagValue && tagValue.action ?
            `<${tagValue.action}></${tagValue.action}>` : '';
    }
    return xmlObj;
}

function generateRule(errorTag, tagValue, ID, Status, Filter, Action) {
    let Rule;
    if (tagValue && tagValue.rule === 'not-unique-id') {
        Rule = `<Rule>${ID + Status + Filter + Action}</Rule>` +
        `<Rule>${ID + Status + Filter + Action}</Rule>`;
    } else if (tagValue && tagValue.rule === 'too-many-rules') {
        for (let i = 0; i <= 1000; i++) {
            // eslint-disable-next-line no-param-reassign
            ID = `<ID>foo${i}</ID>`;
            Rule = `${Rule}<Rule>${ID + Status + Filter + Action}</Rule>`;
        }
    } else if (tagValue && tagValue.rule === 'key-too-long') {
        const key = 'a'.repeat(129);
        // eslint-disable-next-line no-param-reassign
        Filter = `<Filter><Tag><Key>${key}</Key><Value></Value></Tag></Filter>`;
        Rule = `${Rule}<Rule>${ID + Status + Filter + Action}</Rule>`;
    } else {
        Rule = '';
    }
    return Rule;
}

function generateXml(errorTag, tagValue) {
    let ID;
    let Status;
    let Filter;
    let Action;
    let Rule;
    if (errorTag === 'ID') {
        ID = tagValue && tagValue.id ? `<ID>${tagValue.id}</ID>` : '';
    } else {
        ID = '<ID>foo</ID>';
    }
    if (errorTag === 'Status') {
        Status = tagValue && tagValue.status ?
            `<Status>${tagValue.status}</Status>` : '';
    } else {
        Status = '<Status>Enabled</Status>';
    }
    if (errorTag === 'Filter') {
        Filter = generateFilter(errorTag, tagValue);
    } else {
        Filter = '<Filter></Filter>';
    }
    if (errorTag === 'Action') {
        const xmlObj = generateAction(errorTag, tagValue);
        Action = xmlObj.actions;
        Filter = xmlObj.filter ? xmlObj.filter : Filter;
    } else {
        Action = '<Expiration><Days>1</Days></Expiration>';
    }
    if (errorTag === 'Rule') {
        Rule = generateRule(errorTag, tagValue, ID, Status, Filter, Action);
    } else {
        Rule = `<Rule>${ID + Status + Filter + Action}</Rule>`;
    }
    const Lifecycle = errorTag === 'LifecycleConfiguration' ? '' :
        `<LifecycleConfiguration>${Rule}` +
        '</LifecycleConfiguration>';
    return Lifecycle;
}

function generateParsedXml(errorTag, tagValue, cb) {
    const xml = generateXml(errorTag, tagValue);
    parseString(xml, (err, parsedXml) => {
        assert.equal(err, null, 'Error parsing xml');
        cb(parsedXml);
    });
}

function checkError(parsedXml, error, errMessage, cb) {
    const lifecycleConfig =
        new LifecycleConfiguration(parsedXml).
        getLifecycleConfiguration();
    assert.strictEqual(
        lifecycleConfig.error[error], true);
    assert.strictEqual(
        lifecycleConfig.error.description, errMessage);
    cb();
}

describe('LifecycleConfiguration class getLifecycleConfiguration', () => {
    const tagValue = {};
    requiredTags.forEach(tag => {
        it(`should return MalformedXML error if ${tag.tag} tag is missing`,
        done => {
            generateParsedXml(tag.tag, tagValue, parsedXml => {
                checkError(parsedXml, 'MalformedXML', tag.errMessage, done);
            });
        });
    });
    validActions.forEach(action => {
        it(`should return MalformedXML error if time for ${action.tag} ` +
        'is not included', done => {
            tagValue.action = action.tag;
            generateParsedXml('Action', tagValue, parsedXml => {
                checkError(parsedXml, 'MalformedXML', action.errMessage, done);
            });
        });
    });
    invalidActions.forEach(action => {
        it(`should return MalformedXML error for invalid action ${action.tag}`,
        done => {
            tagValue.action = action.tag;
            generateParsedXml('Action', tagValue, parsedXml => {
                checkError(parsedXml, 'MalformedXML', action.errMessage, done);
            });
        });
    });
    notImplementedActions.forEach(action => {
        it(`should return NotImplemented error for ${action.tag} action`,
        done => {
            tagValue.action = action.tag;
            generateParsedXml('Action', tagValue, parsedXml => {
                checkError(parsedXml, 'NotImplemented',
                    action.errMessage, done);
            });
        });
    });
    invalidFilters.forEach(filter => {
        it(`should return MalformedXML error for ${filter.tag} filter error`,
        done => {
            tagValue.filter = filter.tag;
            generateParsedXml('Filter', tagValue, parsedXml => {
                checkError(parsedXml, 'MalformedXML', filter.errMessage, done);
            });
        });
    });
    it('should return MalformedXML error if invalid status', done => {
        tagValue.status = 'foo';
        const errMessage = 'Status is not valid';
        generateParsedXml('Status', tagValue, parsedXml => {
            checkError(parsedXml, 'MalformedXML', errMessage, done);
        });
    });
    it('should return InvalidArgument error if invalid ID', done => {
        tagValue.id = 'a'.repeat(256);
        const errMessage = 'Rule ID is greater than 255 characters long';
        generateParsedXml('ID', tagValue, parsedXml => {
            checkError(parsedXml, 'InvalidArgument', errMessage, done);
        });
    });
    it('should return MalformedXML error if over 1000 rules', done => {
        tagValue.rule = 'too-many-rules';
        const errMessage = 'request xml includes over max limit of 1000 rules';
        generateParsedXml('Rule', tagValue, parsedXml => {
            checkError(parsedXml, 'MalformedXML', errMessage, done);
        });
    });
    invalidRequests.forEach(req => {
        it(`should return InvalidRequest error for ${req.tag}`, done => {
            tagValue.rule = req.tag;
            generateParsedXml('Rule', tagValue, parsedXml => {
                checkError(parsedXml, 'InvalidRequest', req.errMessage, done);
            });
        });
    });
});
