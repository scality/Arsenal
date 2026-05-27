import { errors } from '../../../index';
import { parseString } from 'xml2js';

const { default: ReplicationConfiguration } = require('../../../lib/models/ReplicationConfiguration');

const mockS3ServerConfig = {
    locationConstraints: {
        ring: {
            type: 'scality',
            objectId: 'ring',
        },
        awsbackend: {
            type: 'aws_s3',
            objectId: 'awsbackend',
        },
        gcpbackend: {
            type: 'gcp',
            objectId: 'gcpbackend',
        },
        azurebackend: {
            type: 'azure',
            objectId: 'azurebackend',
        },
        'dmf-1': {
            type: 'dmf',
            objectId: 'dmf-1',
            isCold: true,
        },
    },
    replicationEndpoints: [
        {
            site: 'ring',
            default: true,
        },
        {
            type: 'aws_s3',
            site: 'awsbackend',
        },
        {
            type: 'gcp',
            site: 'gcpbackend',
        },
        {
            type: 'azure',
            site: 'azurebackend',
        },
        {
            type: 'dmf',
            site: 'dmf-1',
        },
    ],
};

const TEST_ROLE = 'arn:aws:iam::942839175607:role/crr-trust-role,arn:aws:iam::989181102323:role/crr-trust-role';

function getPreferredReadXMLConfig(hasPreferredRead) {
    return (
        `
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
`
    );
}

describe('ReplicationConfiguration.parseConfiguration()', () => {
    // --- Valid Configurations ---
    describe('Prefix validation', () => {
        it('should succeed for a valid configuration without a prefix', () => {
            const repConfig = {
                Role: [TEST_ROLE],
                Rule: [
                    {
                        Status: ['Enabled'],
                        Destination: [
                            {
                                Bucket: ['arn:aws:s3:::crr-dest'],
                            },
                        ],
                    },
                ],
            };
            const instance = new ReplicationConfiguration(
                { ReplicationConfiguration: repConfig },
                null,
                mockS3ServerConfig,
            );
            const result = instance.parseConfiguration();
            expect(result).toBeUndefined();
            expect(instance.getRole()).toEqual(TEST_ROLE);
            expect(instance.getDestination()).toEqual('arn:aws:s3:::crr-dest');
            const rules = instance.getRules();
            expect(rules.length).toEqual(1);
            expect(rules[0].enabled).toBe(true);
            expect(typeof rules[0].id).toBe('string');
            expect(rules[0].prefix).toEqual('');
        });

        it('should succeed for multiple valid rules with non-overlapping prefixes', () => {
            const repConfig = {
                Role: [TEST_ROLE],
                Rule: [
                    {
                        ID: ['ImagesRule'],
                        Prefix: ['main/images/'],
                        Status: ['Enabled'],
                        Destination: [{ Bucket: ['arn:aws:s3:::crr-dest'] }],
                    },
                    {
                        ID: ['DocsAndProjects'],
                        Prefix: ['main/documents/'],
                        Status: ['Disabled'],
                        Destination: [{ Bucket: ['arn:aws:s3:::crr-dest'] }],
                    },
                ],
            };
            const instance = new ReplicationConfiguration(
                { ReplicationConfiguration: repConfig },
                null,
                mockS3ServerConfig,
            );
            const result = instance.parseConfiguration();
            expect(result).toBeUndefined();
            expect(instance.getRole()).toEqual(TEST_ROLE);
            expect(instance.getDestination()).toEqual('arn:aws:s3:::crr-dest');
            expect(instance.getRules()).toEqual([
                {
                    enabled: true,
                    id: 'ImagesRule',
                    prefix: 'main/images/',
                },
                {
                    enabled: false,
                    id: 'DocsAndProjects',
                    prefix: 'main/documents/',
                },
            ]);
        });

        it('should return InvalidRequest when config has multiple rules with overlapping prefixes', () => {
            const repConfig = {
                Role: [TEST_ROLE],
                Rule: [
                    {
                        ID: ['rule1'],
                        Prefix: ['prefix/'],
                        Status: ['Enabled'],
                        Destination: [{ Bucket: ['arn:aws:s3:::crr-dest'] }],
                    },
                    {
                        ID: ['rule2'],
                        Prefix: ['prefix/subprefix/'],
                        Status: ['Enabled'],
                        Destination: [{ Bucket: ['arn:aws:s3:::crr-dest'] }],
                    },
                ],
            };
            const instance = new ReplicationConfiguration(
                { ReplicationConfiguration: repConfig },
                null,
                mockS3ServerConfig,
            );
            const result = instance.parseConfiguration();
            expect(result).toEqual(errors.InvalidRequest);
        });

        it('should return InvalidArgument if a prefix is longer than 1024 characters', () => {
            const repConfig = {
                Role: [TEST_ROLE],
                Rule: [
                    {
                        Prefix: [new Array(1025).fill('X').join('')],
                        Status: ['Enabled'],
                        Destination: [
                            {
                                Bucket: ['arn:aws:s3:::crr-dest'],
                            },
                        ],
                    },
                ],
            };
            const instance = new ReplicationConfiguration(
                { ReplicationConfiguration: repConfig },
                null,
                mockS3ServerConfig,
            );
            const result = instance.parseConfiguration();
            expect(result).toEqual(errors.InvalidArgument);
        });

        it('should return MalformedXML if a prefix is an array with more than 1 value', () => {
            const repConfig = {
                Rule: [
                    {
                        ID: ['rule1'],
                        Prefix: ['foo', 'bar'],
                        Status: ['Enabled'],
                        Destination: [{ Bucket: ['arn:aws:s3:::crr-dest'] }],
                    },
                ],
            };
            const instance = new ReplicationConfiguration(
                { ReplicationConfiguration: repConfig },
                null,
                mockS3ServerConfig,
            );
            const result = instance.parseConfiguration();
            expect(result).toEqual(errors.MalformedXML);
        });

        it('should return MalformedXML if a prefix is an object', () => {
            const repConfig = {
                Rule: [
                    {
                        ID: ['rule1'],
                        Prefix: [{ foo: 'bar' }],
                        Status: ['Enabled'],
                        Destination: [{ Bucket: ['arn:aws:s3:::crr-dest'] }],
                    },
                ],
            };
            const instance = new ReplicationConfiguration(
                { ReplicationConfiguration: repConfig },
                null,
                mockS3ServerConfig,
            );
            const result = instance.parseConfiguration();
            expect(result).toEqual(errors.MalformedXML);
        });
    });

    it('should succeed for a minimal valid configuration without storage class', () => {
        const repConfig = {
            Role: [TEST_ROLE],
            Rule: [
                {
                    Prefix: [''],
                    Status: ['Enabled'],
                    Destination: [
                        {
                            Bucket: ['arn:aws:s3:::crr-dest'],
                        },
                    ],
                },
            ],
        };
        const instance = new ReplicationConfiguration(
            { ReplicationConfiguration: repConfig },
            null,
            mockS3ServerConfig,
        );
        const result = instance.parseConfiguration();
        expect(result).toBeUndefined();
        expect(instance.getRole()).toEqual(TEST_ROLE);
        expect(instance.getDestination()).toEqual('arn:aws:s3:::crr-dest');
        const rules = instance.getRules();
        expect(rules.length).toEqual(1);
        expect(rules[0].enabled).toBe(true);
        // should have generated a new random ID
        expect(typeof rules[0].id).toBe('string');
        expect(rules[0].prefix).toEqual('');
    });

    it('should succeed for a minimal valid configuration including Rule ID and destination StorageClass', () => {
        const repConfig = {
            Role: [TEST_ROLE],
            Rule: [
                {
                    ID: ['RuleID'],
                    Prefix: [''],
                    Status: ['Enabled'],
                    Destination: [
                        {
                            Bucket: ['arn:aws:s3:::crr-dest'],
                            StorageClass: ['STANDARD'],
                        },
                    ],
                },
            ],
        };
        const instance = new ReplicationConfiguration(
            { ReplicationConfiguration: repConfig },
            null,
            mockS3ServerConfig,
        );
        const result = instance.parseConfiguration();
        expect(result).toBeUndefined();
        expect(instance.getRules()).toEqual([
            {
                enabled: true,
                id: 'RuleID',
                prefix: '',
                storageClass: 'STANDARD',
            },
        ]);
    });

    // --- Invalid Configurations ---

    it('should return MalformedXML when config is missing a Role array', () => {
        const repConfig = {
            Rule: [
                {
                    Prefix: [''],
                    Status: ['Enabled'],
                    Destination: [
                        {
                            Bucket: ['arn:aws:s3:::crr-dest'],
                        },
                    ],
                },
            ],
        };
        const instance = new ReplicationConfiguration(
            { ReplicationConfiguration: repConfig },
            null,
            mockS3ServerConfig,
        );
        const result = instance.parseConfiguration();
        expect(result).toEqual(errors.MalformedXML);
    });

    it('should return InvalidArgument when Scality destination has a single role', () => {
        const repConfig = {
            Role: ['arn:aws:iam::942839175607:role/crr-trust-role'],
            Rule: [
                {
                    Prefix: [''],
                    Status: ['Enabled'],
                    Destination: [
                        {
                            Bucket: ['arn:aws:s3:::crr-dest'],
                        },
                    ],
                },
            ],
        };
        const instance = new ReplicationConfiguration(
            { ReplicationConfiguration: repConfig },
            null,
            mockS3ServerConfig,
        );
        const result = instance.parseConfiguration();
        expect(result).toEqual(errors.InvalidArgument);
    });

    it('should return InvalidArgument when Scality destination has two comma-separated roles but one is invalid', () => {
        const repConfig = {
            Role: [`invalidarn:${TEST_ROLE}`],
            Rule: [
                {
                    Prefix: [''],
                    Status: ['Enabled'],
                    Destination: [
                        {
                            Bucket: ['arn:aws:s3:::crr-dest'],
                        },
                    ],
                },
            ],
        };
        const instance = new ReplicationConfiguration(
            { ReplicationConfiguration: repConfig },
            null,
            mockS3ServerConfig,
        );
        const result = instance.parseConfiguration();
        expect(result).toEqual(errors.InvalidArgument);
    });

    it('should return MalformedXML when config has an empty Rule array', () => {
        const repConfig = {
            Role: [TEST_ROLE],
            Rule: [],
        };
        const instance = new ReplicationConfiguration(
            { ReplicationConfiguration: repConfig },
            null,
            mockS3ServerConfig,
        );
        const result = instance.parseConfiguration();
        expect(result).toEqual(errors.MalformedXML);
    });

    it('should return InvalidArgument if a Rule ID exceeds 255 characters', () => {
        const repConfig = {
            Role: [TEST_ROLE],
            Rule: [
                {
                    ID: [new Array(256).fill('X').join('')],
                    Prefix: [''],
                    Status: ['Enabled'],
                    Destination: [
                        {
                            Bucket: ['arn:aws:s3:::crr-dest'],
                        },
                    ],
                },
            ],
        };
        const instance = new ReplicationConfiguration(
            { ReplicationConfiguration: repConfig },
            null,
            mockS3ServerConfig,
        );
        const result = instance.parseConfiguration();
        expect(result).toEqual(errors.InvalidArgument);
    });

    it('should return InvalidRequest when config has duplicate Rule IDs', () => {
        const repConfig = {
            Role: [TEST_ROLE],
            Rule: [
                {
                    ID: ['rule1'],
                    Prefix: ['a/'],
                    Status: ['Enabled'],
                    Destination: [{ Bucket: ['arn:aws:s3:::crr-dest'] }],
                },
                {
                    ID: ['rule1'],
                    Prefix: ['b/'],
                    Status: ['Enabled'],
                    Destination: [{ Bucket: ['arn:aws:s3:::crr-dest'] }],
                },
            ],
        };
        const instance = new ReplicationConfiguration(
            { ReplicationConfiguration: repConfig },
            null,
            mockS3ServerConfig,
        );
        const result = instance.parseConfiguration();
        expect(result).toEqual(errors.InvalidRequest);
    });

    it('should return MalformedXML when config has a rule with an invalid Status value', () => {
        const repConfig = {
            Role: [TEST_ROLE],
            Rule: [
                {
                    Prefix: [''],
                    Status: ['Invalid'],
                    Destination: [{ Bucket: ['arn:aws:s3:::crr-dest'] }],
                },
            ],
        };
        const instance = new ReplicationConfiguration(
            { ReplicationConfiguration: repConfig },
            null,
            mockS3ServerConfig,
        );
        const result = instance.parseConfiguration();
        expect(result).toEqual(errors.MalformedXML);
    });

    it('should return MalformedXML when the provided storage class is invalid', () => {
        const repConfig = {
            Role: [TEST_ROLE],
            Rule: [
                {
                    Prefix: [''],
                    Status: ['Enabled'],
                    Destination: [
                        {
                            Bucket: ['arn:aws:s3:::crr-dest'],
                            StorageClass: ['INVALID'],
                        },
                    ],
                },
            ],
        };
        const instance = new ReplicationConfiguration(
            { ReplicationConfiguration: repConfig },
            null,
            mockS3ServerConfig,
        );
        const result = instance.parseConfiguration();
        expect(result).toEqual(errors.MalformedXML);
    });

    it('should return InvalidRequest with a config containing more than 1000 rules', () => {
        const repConfig = {
            Role: [TEST_ROLE],
            Rule: [] as any[],
        };
        for (let i = 0; i < 1001; ++i) {
            repConfig.Rule.push({
                ID: [`rule${i}`],
                Prefix: [`prefix${i}/`],
                Status: ['Enabled'],
                Destination: [
                    {
                        Bucket: ['arn:aws:s3:::crr-dest'],
                    },
                ],
            });
        }
        const instance = new ReplicationConfiguration(
            { ReplicationConfiguration: repConfig },
            null,
            mockS3ServerConfig,
        );
        const result = instance.parseConfiguration();
        expect(result).toEqual(errors.InvalidRequest);
    });

    it('should return InvalidRequest if StorageClass not provided and cloudserver config has no replication endpoint', () => {
        const repConfig = {
            Role: [TEST_ROLE],
            Rule: [
                {
                    Prefix: [''],
                    Status: ['Enabled'],
                    Destination: [
                        {
                            Bucket: ['arn:aws:s3:::crr-dest'],
                        },
                    ],
                },
            ],
        };
        const instance = new ReplicationConfiguration({ ReplicationConfiguration: repConfig }, null, {
            replicationEndpoints: [],
        });
        const result = instance.parseConfiguration();
        expect(result).toEqual(errors.InvalidRequest);
    });

    it('should return InvalidRequest if StorageClass provided and cloudserver config has no replication endpoint', () => {
        const repConfig = {
            Role: [TEST_ROLE],
            Rule: [
                {
                    Prefix: [''],
                    Status: ['Enabled'],
                    Destination: [
                        {
                            Bucket: ['arn:aws:s3:::crr-dest'],
                            StorageClass: ['STANDARD'],
                        },
                    ],
                },
            ],
        };
        const instance = new ReplicationConfiguration({ ReplicationConfiguration: repConfig }, null, {
            replicationEndpoints: [],
        });
        const result = instance.parseConfiguration();
        expect(result).toEqual(errors.InvalidRequest);
    });

    it('should parse replication config XML without preferred read', done => {
        const repConfigXML = getPreferredReadXMLConfig(false);
        parseString(repConfigXML, (err, parsedXml) => {
            expect(err).toBeNull();
            const repConf = new ReplicationConfiguration(parsedXml, null, mockS3ServerConfig);
            const repConfErr = repConf.parseConfiguration();
            expect(repConfErr).toBeUndefined();
            expect(repConf.getPreferredReadLocation()).toBeNull();
            done();
        });
    });

    it('should parse replication config XML with preferred read', done => {
        const repConfigXML = getPreferredReadXMLConfig(true);
        parseString(repConfigXML, (err, parsedXml) => {
            expect(err).toBeNull();
            const repConf = new ReplicationConfiguration(parsedXml, null, mockS3ServerConfig);
            const repConfErr = repConf.parseConfiguration();
            expect(repConfErr).toBeUndefined();
            expect(repConf.getPreferredReadLocation()).toEqual('gcpbackend');
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
            expect(err).toBeNull();
            const repConf = new ReplicationConfiguration(parsedXml, null, mockS3ServerConfig);
            const repConfErr = repConf.parseConfiguration();
            expect(repConfErr).toEqual(errors.MalformedXML);
            done();
        });
    });
});
