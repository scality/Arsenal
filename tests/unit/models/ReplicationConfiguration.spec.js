const assert = require('assert');
const { parseString } = require('xml2js');
const errors = require('../../../lib/errors').default;

const werelogs = require('werelogs');

const ReplicationConfiguration =
      require('../../../lib/models/ReplicationConfiguration').default;

const logger = new werelogs.Logger('test:ReplicationConfiguration');

const mockedConfig = {
    locationConstraints: {
        'ring': {
            type: 'scality',
            objectId: 'ring',
        },
        'awsbackend': {
            type: 'aws_s3',
            objectId: 'awsbackend',
        },
        'gcpbackend': {
            type: 'gcp',
            objectId: 'gcpbackend',
        },
        'azurebackend': {
            type: 'azure',
            objectId: 'azurebackend',
        },
        'dmf-1': {
            type: 'dmf',
            objectId: 'dmf-1',
            isCold: true,
        },
    },
    replicationEndpoints: [{
        type: 'scality',
        site: 'ring',
        default: true,
    }, {
        type: 'aws_s3',
        site: 'awsbackend',
    }, {
        type: 'gcp',
        site: 'gcpbackend',
    }, {
        type: 'azure',
        site: 'azurebackend',
    }, {
        type: 'dmf',
        site: 'dmf-1',
    }],
};


function getXMLConfig(hasPreferredRead) {
    return `
    <ReplicationConfiguration>
        <Role>arn:aws:iam::root:role/s3-replication-role</Role>
        <Rule>
            <ID>Replication-Rule-1</ID>
            <Status>Enabled</Status>
            <Prefix>someprefix/</Prefix>
            <Destination>
                <Bucket>arn:aws:s3:::destbucket</Bucket>
                <StorageClass>awsbackend,` +
        `gcpbackend${hasPreferredRead ? ':preferred_read' : ''},azurebackend` +
        `</StorageClass>
            </Destination>
        </Rule>
    </ReplicationConfiguration>
`;
}

describe('ReplicationConfiguration class', () => {
    it('should parse replication config XML without preferred read', done => {
        const repConfigXML = getXMLConfig(false);
        parseString(repConfigXML, (err, parsedXml) => {
            assert.ifError(err);
            const repConf = new ReplicationConfiguration(
                parsedXml, logger, mockedConfig);
            const repConfErr = repConf.parseConfiguration();
            assert.ifError(repConfErr);
            assert.strictEqual(repConf.getPreferredReadLocation(), null);
            done();
        });
    });
    it('should parse replication config XML with preferred read', done => {
        const repConfigXML = getXMLConfig(true);
        parseString(repConfigXML, (err, parsedXml) => {
            assert.ifError(err);
            const repConf = new ReplicationConfiguration(
                parsedXml, logger, mockedConfig);
            const repConfErr = repConf.parseConfiguration();
            assert.ifError(repConfErr);
            assert.strictEqual(repConf.getPreferredReadLocation(),
                'gcpbackend');
            done();
        });
    });

    it('should fail if replication to dmf location', done => {
        const repConfigXML = `
            <ReplicationConfiguration>
                <Role>arn:aws:iam::root:role/s3-replication-role</Role>
                <Rule>
                    <ID>Replication-Rule-1</ID>
                    <Status>Enabled</Status>
                    <Prefix>someprefix/</Prefix>
                    <Destination>
                        <Bucket>arn:aws:s3:::destbucket</Bucket>
                        <StorageClass>dmf-1</StorageClass>
                    </Destination>
                </Rule>
            </ReplicationConfiguration>
        `;

        parseString(repConfigXML, (err, parsedXml) => {
            assert.ifError(err);
            const repConf = new ReplicationConfiguration(
                parsedXml, logger, mockedConfig);
            const repConfErr = repConf.parseConfiguration();
            assert.deepStrictEqual(repConfErr, errors.MalformedXML);
            done();
        });
    });
});
