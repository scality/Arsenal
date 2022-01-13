const assert = require('assert');
const { parseString } = require('xml2js');

const NotificationConfiguration =
    require('../../../lib/models/NotificationConfiguration.js');

function checkError(parsedXml, err, errMessage, cb) {
    const config = new NotificationConfiguration(parsedXml).
        getValidatedNotificationConfiguration();
    assert.strictEqual(config.error[err], true);
    assert.strictEqual(config.error.description, errMessage);
    cb();
}

function generateEvent(testParams) {
    const event = [];
    if (testParams.key === 'Event') {
        if (Array.isArray(testParams.value)) {
            testParams.value.forEach(v => {
                event.push(`${event}<Event>${v}</Event>`);
            });
        } else {
            event.push(`<Event>${testParams.value}</Event>`);
        }
    } else {
        event.push('<Event>s3:ObjectCreated:*</Event>');
    }
    return event.join('');
}

function generateFilter(testParams) {
    let filter = '';
    if (testParams.key === 'Filter') {
        filter = `<Filter>${testParams.value}</Filter>`;
    }
    if (testParams.key === 'S3Key') {
        filter = `<Filter><S3Key>${testParams.value}</S3Key></Filter>`;
    }
    if (testParams.key === 'FilterRule') {
        if (Array.isArray(testParams.value)) {
            testParams.value.forEach(v => {
                filter = `${filter}<Filter><S3Key><FilterRule>${v}` +
                    '</FilterRule></S3Key></Filter>';
            });
        } else {
            filter = `<Filter><S3Key><FilterRule>${testParams.value}` +
                '</FilterRule></S3Key></Filter>';
        }
    }
    return filter;
}

function generateXml(testParams) {
    const id = testParams.key === 'Id' ? `<Id>${testParams.value}</Id>` : '<Id>queue-id</Id>';
    const arn = testParams.key === 'QueueArn' ?
        `<Queue>${testParams.value}</Queue>` :
        '<Queue>arn:scality:bucketnotif:::target</Queue>';
    const event = generateEvent(testParams);
    const filter = generateFilter(testParams);
    let queueConfig = `<QueueConfiguration>${id}${arn}${event}${filter}` +
        '</QueueConfiguration>';
    if (testParams.key === 'QueueConfiguration') {
        if (testParams.value === 'double') {
            queueConfig = `${queueConfig}${queueConfig}`;
        } else {
            queueConfig = testParams.value;
        }
    }
    const notification = testParams.key === 'NotificationConfiguration' ? '' :
        `<NotificationConfiguration>${queueConfig}</NotificationConfiguration>`;
    return notification;
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
        params: { key: 'NotificationConfiguration' },
        error: 'MalformedXML',
        errorMessage: 'request xml is undefined or empty',
    },
    {
        name: 'fail with invalid id',
        params: { key: 'Id', value: 'a'.repeat(256) },
        error: 'InvalidArgument',
        errorMessage: 'queue configuration ID is greater than 255 characters long',
    },
    {
        name: 'fail with repeated id',
        params: { key: 'QueueConfiguration', value: 'double' },
        error: 'InvalidRequest',
        errorMessage: 'queue configuration ID must be unique',
    },
    {
        name: 'fail with empty QueueArn',
        params: { key: 'QueueArn', value: '' },
        error: 'MalformedXML',
        errorMessage: 'each queue configuration must contain a queue arn',
    },
    {
        name: 'fail with invalid QueueArn',
        params: { key: 'QueueArn', value: 'arn:scality:bucketnotif:target' },
        error: 'MalformedXML',
        errorMessage: 'queue arn is invalid',
    },
    {
        name: 'fail with invalid QueueArn partition',
        params: { key: 'QueueArn', value: 'arn:aws:bucketnotif:::target' },
        error: 'MalformedXML',
        errorMessage: 'queue arn is invalid',
    },
    {
        name: 'fail with empty event',
        params: { key: 'Event', value: '' },
        error: 'MalformedXML',
        errorMessage: 'each queue configuration must contain an event',
    },
    {
        name: 'fail with invalid event',
        params: { key: 'Event', value: 's3:BucketCreated:Put' },
        error: 'MalformedXML',
        errorMessage: 'event array contains invalid or unsupported event',
    },
    {
        name: 'fail with unsupported event',
        params: { key: 'Event', value: 's3:Replication:OperationNotTracked' },
        error: 'MalformedXML',
        errorMessage: 'event array contains invalid or unsupported event',
    },
    {
        name: 'fail with filter that does not contain S3Key',
        params: { key: 'Filter', value: '<FilterRule><Name>Prefix</Name><Value>logs/</Value></FilterRule>' },
        error: 'MalformedXML',
        errorMessage: 'if included, queue configuration filter must contain S3Key',
    },
    {
        name: 'fail with filter that does not contain a rule',
        params: { key: 'S3Key', value: '<Name>Prefix</Name><Value>logs/</Value>' },
        error: 'MalformedXML',
        errorMessage: 'if included, queue configuration filter must contain a rule',
    },
    {
        name: 'fail with filter rule that does not contain name and value',
        params: { key: 'FilterRule', value: '<Value>noname</Value>' },
        error: 'MalformedXML',
        errorMessage: 'each included filter must contain a name and value',
    },
    {
        name: 'fail with invalid name in filter rule',
        params: { key: 'FilterRule', value: '<Name>Invalid</Name><Value>logs/</Value>' },
        error: 'MalformedXML',
        errorMessage: 'filter Name must be one of Prefix or Suffix',
    },
];

const passTests = [
    {
        name: 'pass with empty QueueConfiguration',
        params: { key: 'QueueConfiguration', value: '[]' },
    },
    {
        name: 'pass with multiple events in one queue configuration',
        params: {
            key: 'Event', value: ['s3:ObjectCreated:Put', 's3:ObjectCreated:Copy'],
        },
    },
    {
        name: 'pass with multiple filter rules',
        params: {
            key: 'FilterRule',
            value: ['<Name>Prefix</Name><Value>logs/</Value>', '<Name>Suffix</Name><Value>.pdf</Value>'] },
    },
    {
        name: 'pass with no id',
        params: { key: 'Id', value: '' },
    },
    {
        name: 'pass with basic config', params: {},
    },
];

describe('NotificationConfiguration class getValidatedNotificationConfiguration',
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
                    const config = new NotificationConfiguration(xml).
                        getValidatedNotificationConfiguration();
                    assert.ifError(config.error);
                    done();
                });
            });
        });
    });
