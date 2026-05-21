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
    describe('V1 Prefix validation', () => {
        it('should succeed for a valid configuration without a prefix', () => {
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
            expect(instance.getDestination()).toBeUndefined();
            const rules = instance.getRules();
            expect(rules.length).toEqual(1);
            expect(rules[0].enabled).toBe(true);
            expect(typeof rules[0].id).toBe('string');
            expect(rules[0].prefix).toEqual('');
            expect(rules[0].destination).toEqual('arn:aws:s3:::crr-dest');
            expect(rules[0].account).toBeUndefined();
            expect(instance.getFormat()).toEqual('v1');
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
            expect(instance.getDestination()).toBeUndefined();
            expect(instance.getRules()).toEqual([
                {
                    enabled: true,
                    id: 'ImagesRule',
                    prefix: 'main/images/',
                    destination: 'arn:aws:s3:::crr-dest',
                },
                {
                    enabled: false,
                    id: 'DocsAndProjects',
                    prefix: 'main/documents/',
                    destination: 'arn:aws:s3:::crr-dest',
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

        it('should accept V1 rules targeting different destination buckets', () => {
            const repConfig = {
                Role: [TEST_ROLE],
                Rule: [
                    {
                        ID: ['rule1'],
                        Prefix: ['a/'],
                        Status: ['Enabled'],
                        Destination: [{ Bucket: ['arn:aws:s3:::bucket-a'] }],
                    },
                    {
                        ID: ['rule2'],
                        Prefix: ['b/'],
                        Status: ['Enabled'],
                        Destination: [{ Bucket: ['arn:aws:s3:::bucket-b'] }],
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
            const rules = instance.getRules()!;
            expect(rules[0].destination).toEqual('arn:aws:s3:::bucket-a');
            expect(rules[1].destination).toEqual('arn:aws:s3:::bucket-b');
            expect(instance.getFormat()).toEqual('v1');
        });

        it('should accept overlapping prefixes when rules share a site but target distinct destination buckets', () => {
            const repConfig = {
                Role: [TEST_ROLE],
                Rule: [
                    {
                        ID: ['rule1'],
                        Prefix: [''],
                        Status: ['Enabled'],
                        Destination: [
                            {
                                Bucket: ['arn:aws:s3:::bucket-a'],
                                Account: ['692632726100'],
                                StorageClass: ['ring'],
                            },
                        ],
                    },
                    {
                        ID: ['rule2'],
                        Prefix: [''],
                        Status: ['Enabled'],
                        Destination: [
                            {
                                Bucket: ['arn:aws:s3:::bucket-b'],
                                Account: ['692632726100'],
                                StorageClass: ['ring'],
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
        });

        it('should still reject overlapping prefixes when rules share site and destination', () => {
            const repConfig = {
                Role: [TEST_ROLE],
                Rule: [
                    {
                        ID: ['rule1'],
                        Prefix: ['prefix/'],
                        Status: ['Enabled'],
                        Destination: [
                            {
                                Bucket: ['arn:aws:s3:::bucket-shared'],
                                Account: ['692632726100'],
                                StorageClass: ['ring'],
                            },
                        ],
                    },
                    {
                        ID: ['rule2'],
                        Prefix: ['prefix/subprefix/'],
                        Status: ['Enabled'],
                        Destination: [
                            {
                                Bucket: ['arn:aws:s3:::bucket-shared'],
                                Account: ['692632726100'],
                                StorageClass: ['ring'],
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
            expect(result).toEqual(errors.InvalidRequest);
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
        expect(instance.getDestination()).toBeUndefined();
        const rules = instance.getRules();
        expect(rules.length).toEqual(1);
        expect(rules[0].enabled).toBe(true);
        // should have generated a new random ID
        expect(typeof rules[0].id).toBe('string');
        expect(rules[0].prefix).toEqual('');
        expect(rules[0].destination).toEqual('arn:aws:s3:::crr-dest');
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
                destination: 'arn:aws:s3:::crr-dest',
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

    it('should accept a single-ARN Role for V1 Scality destination', () => {
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
        expect(result).toBeUndefined();
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

    it('should return InvalidArgument when non-Scality destination has multiple roles', () => {
        const repConfig = {
            Role: ['arn:aws:iam::942839175607:role/role-a,arn:aws:iam::989181102323:role/role-b'],
            Rule: [
                {
                    Prefix: [''],
                    Status: ['Enabled'],
                    Destination: [
                        {
                            Bucket: ['arn:aws:s3:::crr-dest'],
                            StorageClass: ['awsbackend'],
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

    describe('V2 Prefix validation', () => {
        it('should succeed for a valid V2 configuration with Filter', () => {
            const repConfig = {
                Role: [TEST_ROLE],
                Rule: [
                    {
                        ID: ['rule1'],
                        Status: ['Enabled'],
                        Filter: [{ Prefix: ['docs/'] }],
                        Destination: [
                            {
                                Bucket: ['arn:aws:s3:::crr-dest'],
                                StorageClass: ['ring'],
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
            const rules = instance.getRules();
            expect(rules.length).toEqual(1);
            expect(rules[0].prefix).toEqual('docs/');
            expect(rules[0].destination).toEqual('arn:aws:s3:::crr-dest');
            expect(instance.getFormat()).toEqual('v2');
        });

        it('should succeed with empty Filter (no Prefix child, matches all objects)', () => {
            const repConfig = {
                Role: [TEST_ROLE],
                Rule: [
                    {
                        ID: ['rule1'],
                        Status: ['Enabled'],
                        Filter: [''],
                        Destination: [
                            {
                                Bucket: ['arn:aws:s3:::crr-dest'],
                                StorageClass: ['ring'],
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
            expect(instance.getRules()![0].prefix).toBeUndefined();
            expect(instance.getFormat()).toEqual('v2');
        });

        it('should reject overlapping prefixes in V2 format', () => {
            const repConfig = {
                Role: [TEST_ROLE],
                Rule: [
                    {
                        ID: ['rule1'],
                        Status: ['Enabled'],
                        Filter: [{ Prefix: ['docs'] }],
                        Destination: [
                            {
                                Bucket: ['arn:aws:s3:::bucket-a'],
                                StorageClass: ['ring'],
                            },
                        ],
                    },
                    {
                        ID: ['rule2'],
                        Status: ['Enabled'],
                        Filter: [{ Prefix: ['docs/2024'] }],
                        Destination: [
                            {
                                Bucket: ['arn:aws:s3:::bucket-a'],
                                StorageClass: ['ring'],
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
            expect(result).toEqual(errors.InvalidRequest);
        });

        it('should allow different destination buckets in V2 format', () => {
            const repConfig = {
                Role: [TEST_ROLE],
                Rule: [
                    {
                        ID: ['rule1'],
                        Status: ['Enabled'],
                        Filter: [{ Prefix: ['images/'] }],
                        Destination: [
                            {
                                Bucket: ['arn:aws:s3:::bucket-a'],
                                StorageClass: ['ring'],
                            },
                        ],
                    },
                    {
                        ID: ['rule2'],
                        Status: ['Enabled'],
                        Filter: [{ Prefix: ['docs/'] }],
                        Destination: [
                            {
                                Bucket: ['arn:aws:s3:::bucket-b'],
                                StorageClass: ['ring'],
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
            const rules = instance.getRules()!;
            expect(rules[0].destination).toEqual('arn:aws:s3:::bucket-a');
            expect(rules[1].destination).toEqual('arn:aws:s3:::bucket-b');
            expect(instance.getFormat()).toEqual('v2');
        });

        it('should allow overlapping prefixes when all rules have Priority', () => {
            const repConfig = {
                Role: [TEST_ROLE],
                Rule: [
                    {
                        ID: ['rule1'],
                        Status: ['Enabled'],
                        Priority: ['1'],
                        Filter: [{ Prefix: [''] }],
                        Destination: [
                            {
                                Bucket: ['arn:aws:s3:::bucket-a'],
                                StorageClass: ['ring'],
                            },
                        ],
                    },
                    {
                        ID: ['rule2'],
                        Status: ['Enabled'],
                        Priority: ['2'],
                        Filter: [{ Prefix: ['docs/'] }],
                        Destination: [
                            {
                                Bucket: ['arn:aws:s3:::bucket-b'],
                                StorageClass: ['ring'],
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
            const rules = instance.getRules()!;
            expect(rules[0].priority).toEqual(1);
            expect(rules[1].priority).toEqual(2);
            expect(instance.getFormat()).toEqual('v2');
        });

        it('should accept equal Priority values across rules', () => {
            const repConfig = {
                Role: [TEST_ROLE],
                Rule: [
                    {
                        ID: ['rule1'],
                        Status: ['Enabled'],
                        Priority: ['1'],
                        Filter: [{ Prefix: ['images/'] }],
                        Destination: [
                            {
                                Bucket: ['arn:aws:s3:::bucket-a'],
                                StorageClass: ['ring'],
                            },
                        ],
                    },
                    {
                        ID: ['rule2'],
                        Status: ['Enabled'],
                        Priority: ['1'],
                        Filter: [{ Prefix: ['docs/'] }],
                        Destination: [
                            {
                                Bucket: ['arn:aws:s3:::bucket-b'],
                                StorageClass: ['ring'],
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
            expect(instance.getFormat()).toEqual('v2');
        });

        it('should allow overlapping prefixes when storageClass differs', () => {
            const repConfig = {
                Role: [TEST_ROLE],
                Rule: [
                    {
                        ID: ['rule1'],
                        Status: ['Enabled'],
                        Filter: [{ Prefix: ['docs/'] }],
                        Destination: [
                            {
                                Bucket: ['arn:aws:s3:::bucket-a'],
                                StorageClass: ['ring'],
                            },
                        ],
                    },
                    {
                        ID: ['rule2'],
                        Status: ['Enabled'],
                        Filter: [{ Prefix: ['docs/2024'] }],
                        Destination: [
                            {
                                Bucket: ['arn:aws:s3:::bucket-b'],
                                StorageClass: ['awsbackend'],
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
            expect(instance.parseConfiguration()).toBeUndefined();
        });

        it('should reject overlapping prefixes when only one rule has Priority', () => {
            const repConfig = {
                Role: [TEST_ROLE],
                Rule: [
                    {
                        ID: ['rule1'],
                        Status: ['Enabled'],
                        Priority: ['1'],
                        Filter: [{ Prefix: ['docs/'] }],
                        Destination: [
                            {
                                Bucket: ['arn:aws:s3:::bucket-a'],
                                StorageClass: ['ring'],
                            },
                        ],
                    },
                    {
                        ID: ['rule2'],
                        Status: ['Enabled'],
                        Filter: [{ Prefix: ['docs/2024'] }],
                        Destination: [
                            {
                                Bucket: ['arn:aws:s3:::bucket-a'],
                                StorageClass: ['ring'],
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
            expect(instance.parseConfiguration()).toEqual(errors.InvalidRequest);
        });

        it('should reject overlapping prefixes when priorities are equal', () => {
            const repConfig = {
                Role: [TEST_ROLE],
                Rule: [
                    {
                        ID: ['rule1'],
                        Status: ['Enabled'],
                        Priority: ['1'],
                        Filter: [{ Prefix: ['docs/'] }],
                        Destination: [
                            {
                                Bucket: ['arn:aws:s3:::bucket-a'],
                                StorageClass: ['ring'],
                            },
                        ],
                    },
                    {
                        ID: ['rule2'],
                        Status: ['Enabled'],
                        Priority: ['1'],
                        Filter: [{ Prefix: ['docs/2024'] }],
                        Destination: [
                            {
                                Bucket: ['arn:aws:s3:::bucket-a'],
                                StorageClass: ['ring'],
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
            expect(instance.parseConfiguration()).toEqual(errors.InvalidRequest);
        });

        it('should reject overlap between non-adjacent rules in sorted order', () => {
            const repConfig = {
                Role: [TEST_ROLE],
                Rule: [
                    {
                        ID: ['rule1'],
                        Status: ['Enabled'],
                        Priority: ['1'],
                        Filter: [{ Prefix: [''] }],
                        Destination: [
                            {
                                Bucket: ['arn:aws:s3:::bucket-a'],
                                StorageClass: ['ring'],
                            },
                        ],
                    },
                    {
                        ID: ['rule2'],
                        Status: ['Enabled'],
                        Priority: ['2'],
                        Filter: [{ Prefix: ['a/'] }],
                        Destination: [
                            {
                                Bucket: ['arn:aws:s3:::bucket-a'],
                                StorageClass: ['ring'],
                            },
                        ],
                    },
                    {
                        ID: ['rule3'],
                        Status: ['Enabled'],
                        Priority: ['1'],
                        Filter: [{ Prefix: ['a/b/'] }],
                        Destination: [
                            {
                                Bucket: ['arn:aws:s3:::bucket-a'],
                                StorageClass: ['ring'],
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
            expect(instance.parseConfiguration()).toEqual(errors.InvalidRequest);
        });

        it('should reject overlapping prefixes on a shared site in multi-site storageClass', () => {
            const repConfig = {
                Role: [TEST_ROLE],
                Rule: [
                    {
                        ID: ['rule1'],
                        Status: ['Enabled'],
                        Filter: [{ Prefix: ['docs/'] }],
                        Destination: [
                            {
                                Bucket: ['arn:aws:s3:::bucket-a'],
                                StorageClass: ['ring,awsbackend'],
                            },
                        ],
                    },
                    {
                        ID: ['rule2'],
                        Status: ['Enabled'],
                        Filter: [{ Prefix: ['docs/2024'] }],
                        Destination: [
                            {
                                Bucket: ['arn:aws:s3:::bucket-a'],
                                StorageClass: ['ring'],
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
            expect(instance.parseConfiguration()).toEqual(errors.InvalidRequest);
        });

        it('should accept Priority on a V1 rule', () => {
            const repConfig = {
                Role: [TEST_ROLE],
                Rule: [
                    {
                        ID: ['rule1'],
                        Status: ['Enabled'],
                        Priority: ['1'],
                        Prefix: ['docs/'],
                        Destination: [
                            {
                                Bucket: ['arn:aws:s3:::bucket-a'],
                                StorageClass: ['ring'],
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
            const rules = instance.getRules()!;
            expect(rules[0].priority).toEqual(1);
            expect(instance.getFormat()).toEqual('v1');
        });

        it('should reject a negative Priority', () => {
            const repConfig = {
                Role: [TEST_ROLE],
                Rule: [
                    {
                        ID: ['rule1'],
                        Status: ['Enabled'],
                        Priority: ['-1'],
                        Filter: [{ Prefix: [''] }],
                        Destination: [
                            {
                                Bucket: ['arn:aws:s3:::bucket-a'],
                                StorageClass: ['ring'],
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

        it('should reject an empty Priority element', () => {
            const repConfig = {
                Role: [TEST_ROLE],
                Rule: [
                    {
                        ID: ['rule1'],
                        Status: ['Enabled'],
                        Priority: [''],
                        Filter: [{ Prefix: [''] }],
                        Destination: [
                            {
                                Bucket: ['arn:aws:s3:::bucket-a'],
                                StorageClass: ['ring'],
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
            expect(instance.parseConfiguration()).toEqual(errors.InvalidArgument);
        });

        it('should accept mixed Priority presence across rules', () => {
            const repConfig = {
                Role: [TEST_ROLE],
                Rule: [
                    {
                        ID: ['rule1'],
                        Status: ['Enabled'],
                        Priority: ['1'],
                        Filter: [{ Prefix: ['images/'] }],
                        Destination: [
                            {
                                Bucket: ['arn:aws:s3:::bucket-a'],
                                StorageClass: ['ring'],
                            },
                        ],
                    },
                    {
                        ID: ['rule2'],
                        Status: ['Enabled'],
                        Filter: [{ Prefix: ['docs/'] }],
                        Destination: [
                            {
                                Bucket: ['arn:aws:s3:::bucket-b'],
                                StorageClass: ['ring'],
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
            const rules = instance.getRules()!;
            expect(rules[0].priority).toEqual(1);
            expect(rules[1].priority).toBeUndefined();
            expect(instance.getFormat()).toEqual('v2');
        });

        it('should accept a single-ARN Role for CRR (shared role name)', () => {
            const repConfig = {
                Role: ['arn:aws:iam::111111111111:role/crr-trust-role'],
                Rule: [
                    {
                        ID: ['rule1'],
                        Status: ['Enabled'],
                        Filter: [{ Prefix: [''] }],
                        Destination: [
                            {
                                Bucket: ['arn:aws:s3:::bucket-a'],
                                StorageClass: ['ring'],
                                Account: ['222222222222'],
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
            const rules = instance.getRules()!;
            expect(rules[0].account).toEqual('222222222222');
            expect(instance.getFormat()).toEqual('v2');
        });

        it('should expose v2 format and omit top-level destination in V2', () => {
            const repConfig = {
                Role: [TEST_ROLE],
                Rule: [
                    {
                        ID: ['rule1'],
                        Status: ['Enabled'],
                        Filter: [{ Prefix: [''] }],
                        Destination: [
                            {
                                Bucket: ['arn:aws:s3:::bucket-a'],
                                StorageClass: ['ring'],
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
            expect(instance.parseConfiguration()).toBeUndefined();
            expect(instance.getFormat()).toEqual('v2');
            expect(instance.getDestination()).toBeUndefined();
        });

        it('should return InvalidArgument if V2 prefix is longer than 1024 characters', () => {
            const repConfig = {
                Role: [TEST_ROLE],
                Rule: [
                    {
                        ID: ['rule1'],
                        Status: ['Enabled'],
                        Filter: [{ Prefix: [new Array(1025).fill('X').join('')] }],
                        Destination: [
                            {
                                Bucket: ['arn:aws:s3:::crr-dest'],
                                StorageClass: ['ring'],
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

        it('should detect V2 from Account element (without Filter)', () => {
            const repConfig = {
                Role: [TEST_ROLE],
                Rule: [
                    {
                        ID: ['rule1'],
                        Status: ['Enabled'],
                        Destination: [
                            {
                                Bucket: ['arn:aws:s3:::bucket-a'],
                                StorageClass: ['ring'],
                                Account: ['222222222222'],
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
            expect(instance.getFormat()).toEqual('v2');
            expect(instance.getRules()![0].account).toEqual('222222222222');
        });

        it('should return InvalidArgument when Account is not a 12-digit ID', () => {
            const repConfig = {
                Role: [TEST_ROLE],
                Rule: [
                    {
                        ID: ['rule1'],
                        Status: ['Enabled'],
                        Filter: [{ Prefix: [''] }],
                        Destination: [
                            {
                                Bucket: ['arn:aws:s3:::bucket-a'],
                                StorageClass: ['ring'],
                                Account: ['not-a-valid-account'],
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

        it('should parse Account into the rule', () => {
            const repConfig = {
                Role: [TEST_ROLE],
                Rule: [
                    {
                        ID: ['rule1'],
                        Status: ['Enabled'],
                        Filter: [{ Prefix: [''] }],
                        Destination: [
                            {
                                Bucket: ['arn:aws:s3:::bucket-a'],
                                StorageClass: ['ring'],
                                Account: ['222222222222'],
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
            const rules = instance.getRules()!;
            expect(rules[0].account).toEqual('222222222222');
            expect(instance.getFormat()).toEqual('v2');
        });

        it('should not set per-rule account when Account is not specified', () => {
            const repConfig = {
                Role: [TEST_ROLE],
                Rule: [
                    {
                        ID: ['rule1'],
                        Status: ['Enabled'],
                        Filter: [{ Prefix: [''] }],
                        Destination: [
                            {
                                Bucket: ['arn:aws:s3:::bucket-a'],
                                StorageClass: ['ring'],
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
            const rules = instance.getRules()!;
            expect(rules[0].account).toBeUndefined();
            expect(instance.getFormat()).toEqual('v2');
        });

        it('should parse V2 XML configuration with multiple destinations', done => {
            const xml = `
                <ReplicationConfiguration>
                    <Role>${TEST_ROLE}</Role>
                    <Rule>
                        <ID>rule1-dest-A</ID>
                        <Status>Enabled</Status>
                        <Filter><Prefix>images/</Prefix></Filter>
                        <Destination>
                            <Bucket>arn:aws:s3:::bucket-a</Bucket>
                            <StorageClass>ring</StorageClass>
                            <Account>222222222222</Account>
                        </Destination>
                    </Rule>
                    <Rule>
                        <ID>rule1-dest-B</ID>
                        <Status>Enabled</Status>
                        <Filter><Prefix>docs/</Prefix></Filter>
                        <Destination>
                            <Bucket>arn:aws:s3:::bucket-b</Bucket>
                            <StorageClass>ring</StorageClass>
                            <Account>333333333333</Account>
                        </Destination>
                    </Rule>
                </ReplicationConfiguration>
            `;
            parseString(xml, (err, parsedXml) => {
                expect(err).toBeNull();
                const repConf = new ReplicationConfiguration(parsedXml, null, mockS3ServerConfig);
                const repConfErr = repConf.parseConfiguration();
                expect(repConfErr).toBeUndefined();
                const rules = repConf.getRules()!;
                expect(rules.length).toEqual(2);
                expect(rules[0].destination).toEqual('arn:aws:s3:::bucket-a');
                expect(rules[0].account).toEqual('222222222222');
                expect(rules[1].destination).toEqual('arn:aws:s3:::bucket-b');
                expect(rules[1].account).toEqual('333333333333');
                expect(repConf.getFormat()).toEqual('v2');
                done();
            });
        });
    });

    describe('getConfigXML()', () => {
        it('should generate V1 XML from configuration', () => {
            const config = {
                role: TEST_ROLE,
                destination: 'arn:aws:s3:::crr-dest',
                rules: [
                    {
                        id: 'rule1',
                        prefix: 'docs/',
                        enabled: true,
                        storageClass: 'STANDARD',
                    },
                ],
            };
            const xml = ReplicationConfiguration.getConfigXML(config);
            expect(xml).toContain('<Prefix>docs/</Prefix>');
            expect(xml).toContain('<Status>Enabled</Status>');
            expect(xml).toContain('<StorageClass>STANDARD</StorageClass>');
            expect(xml).not.toContain('<Filter>');
            expect(xml).not.toContain('<Priority>');
        });

        it('should generate V2 XML when format hint is "v2" (no priorities)', () => {
            const config = {
                role: TEST_ROLE,
                rules: [
                    {
                        id: 'rule1',
                        prefix: 'docs/',
                        enabled: true,
                        storageClass: 'ring',
                        destination: 'arn:aws:s3:::bucket-a',
                    },
                ],
                format: 'v2' as const,
            };
            const xml = ReplicationConfiguration.getConfigXML(config);
            expect(xml).toContain('<Filter><Prefix>docs/</Prefix></Filter>');
            expect(xml).not.toContain('<Priority>');
            expect(xml).toContain('<Bucket>arn:aws:s3:::bucket-a</Bucket>');
        });

        it('should generate V2 XML for multi-destination rules', () => {
            const config = {
                role: TEST_ROLE,
                destination: 'arn:aws:s3:::bucket-a',
                rules: [
                    {
                        id: 'rule1',
                        prefix: '',
                        enabled: true,
                        storageClass: 'ring',
                        destination: 'arn:aws:s3:::bucket-a',
                        account: '222222222222',
                    },
                    {
                        id: 'rule2',
                        prefix: 'docs/',
                        enabled: true,
                        storageClass: 'ring',
                        destination: 'arn:aws:s3:::bucket-b',
                        account: '333333333333',
                    },
                ],
                format: 'v2' as const,
            };
            const xml = ReplicationConfiguration.getConfigXML(config);
            expect(xml).toContain('<Filter><Prefix/></Filter>');
            expect(xml).toContain('<Filter><Prefix>docs/</Prefix></Filter>');
            expect(xml).toContain('<Bucket>arn:aws:s3:::bucket-a</Bucket>');
            expect(xml).toContain('<Bucket>arn:aws:s3:::bucket-b</Bucket>');
            expect(xml).toContain('<Account>222222222222</Account>');
            expect(xml).toContain('<Account>333333333333</Account>');
        });
    });

    describe('round-trip parse / getConfigXML', () => {
        const parseXML = (xml: string): any => {
            let parsed: any;
            let parseErr: Error | undefined;
            parseString(xml, (err: Error | null, result: any) => {
                parseErr = err ?? undefined;
                parsed = result;
            });
            if (parseErr) {
                throw parseErr;
            }
            return parsed;
        };

        const roundTrip = (xml: string) => {
            const inst1 = new ReplicationConfiguration(parseXML(xml), null, mockS3ServerConfig);
            expect(inst1.parseConfiguration()).toBeUndefined();
            const meta1 = inst1.getReplicationConfiguration();

            const emitted = ReplicationConfiguration.getConfigXML(meta1);

            const inst2 = new ReplicationConfiguration(parseXML(emitted), null, mockS3ServerConfig);
            expect(inst2.parseConfiguration()).toBeUndefined();
            const meta2 = inst2.getReplicationConfiguration();

            expect(meta2).toEqual(meta1);
            return { meta1, emitted };
        };

        it('round-trips a V2 multi-destination configuration', () => {
            const xml = `<?xml version="1.0" encoding="UTF-8"?>
                <ReplicationConfiguration xmlns="http://s3.amazonaws.com/doc/2006-03-01/">
                    <Role>${TEST_ROLE}</Role>
                    <Rule>
                        <ID>rule1</ID>
                        <Status>Enabled</Status>
                        <Filter><Prefix>images/</Prefix></Filter>
                        <Destination>
                            <Bucket>arn:aws:s3:::bucket-a</Bucket>
                            <StorageClass>ring</StorageClass>
                            <Account>222222222222</Account>
                        </Destination>
                    </Rule>
                    <Rule>
                        <ID>rule2</ID>
                        <Status>Enabled</Status>
                        <Filter><Prefix>docs/</Prefix></Filter>
                        <Destination>
                            <Bucket>arn:aws:s3:::bucket-b</Bucket>
                            <StorageClass>ring</StorageClass>
                            <Account>333333333333</Account>
                        </Destination>
                    </Rule>
                </ReplicationConfiguration>`;
            const { meta1 } = roundTrip(xml);
            expect(meta1.format).toEqual('v2');
            expect(meta1.rules[0].destination).toEqual('arn:aws:s3:::bucket-a');
            expect(meta1.rules[1].destination).toEqual('arn:aws:s3:::bucket-b');
            expect(meta1.rules[0].account).toEqual('222222222222');
            expect(meta1.rules[1].account).toEqual('333333333333');
        });

        it('round-trips a V1 configuration carrying Account', () => {
            const xml = `<?xml version="1.0" encoding="UTF-8"?>
                <ReplicationConfiguration xmlns="http://s3.amazonaws.com/doc/2006-03-01/">
                    <Role>${TEST_ROLE}</Role>
                    <Rule>
                        <ID>rule1</ID>
                        <Status>Enabled</Status>
                        <Prefix>images/</Prefix>
                        <Destination>
                            <Bucket>arn:aws:s3:::bucket-a</Bucket>
                            <StorageClass>ring</StorageClass>
                            <Account>222222222222</Account>
                        </Destination>
                    </Rule>
                </ReplicationConfiguration>`;
            const { meta1 } = roundTrip(xml);
            expect(meta1.format).toEqual('v1');
            expect(meta1.rules[0].destination).toEqual('arn:aws:s3:::bucket-a');
            expect(meta1.rules[0].account).toEqual('222222222222');
        });

        it('emits pure V1 with byte-stable legacy wire shape', () => {
            const xml =
                `<?xml version="1.0" encoding="UTF-8"?>` +
                `<ReplicationConfiguration xmlns="http://s3.amazonaws.com/doc/2006-03-01/">` +
                `<Role>${TEST_ROLE}</Role>` +
                `<Rule>` +
                `<ID>rule1</ID>` +
                `<Status>Enabled</Status>` +
                `<Prefix>images/</Prefix>` +
                `<Destination>` +
                `<Bucket>arn:aws:s3:::bucket-a</Bucket>` +
                `<StorageClass>STANDARD</StorageClass>` +
                `</Destination>` +
                `</Rule>` +
                `</ReplicationConfiguration>`;
            const { emitted, meta1 } = roundTrip(xml);
            expect(meta1.format).toEqual('v1');

            const expected =
                `<?xml version="1.0" encoding="UTF-8"?>` +
                `<ReplicationConfiguration xmlns="http://s3.amazonaws.com/doc/2006-03-01/">` +
                `<Rule>` +
                `<ID>rule1</ID>` +
                `<Prefix>images/</Prefix>` +
                `<Status>Enabled</Status>` +
                `<Destination>` +
                `<Bucket>arn:aws:s3:::bucket-a</Bucket>` +
                `<StorageClass>STANDARD</StorageClass>` +
                `</Destination>` +
                `</Rule>` +
                `<Role>${TEST_ROLE}</Role>` +
                `</ReplicationConfiguration>`;
            expect(emitted).toEqual(expected);
        });

        it('round-trips a configuration with no prefix on any rule', () => {
            const xml = `<?xml version="1.0" encoding="UTF-8"?>
                <ReplicationConfiguration xmlns="http://s3.amazonaws.com/doc/2006-03-01/">
                    <Role>${TEST_ROLE}</Role>
                    <Rule>
                        <ID>rule1</ID>
                        <Status>Enabled</Status>
                        <Destination>
                            <Bucket>arn:aws:s3:::bucket-a</Bucket>
                            <StorageClass>ring</StorageClass>
                        </Destination>
                    </Rule>
                </ReplicationConfiguration>`;
            const { meta1 } = roundTrip(xml);
            expect(meta1.format).toEqual('v2');
            expect(meta1.rules[0].prefix).toBeUndefined();
        });

        it('preserves the "no Prefix" vs "empty Prefix" distinction on the wire (v2)', () => {
            // <Filter/> (no Prefix child) round-trips to <Filter/>
            const noPrefixXml = `<?xml version="1.0" encoding="UTF-8"?>
                <ReplicationConfiguration xmlns="http://s3.amazonaws.com/doc/2006-03-01/">
                    <Role>${TEST_ROLE}</Role>
                    <Rule>
                        <ID>rule1</ID>
                        <Status>Enabled</Status>
                        <Filter/>
                        <Destination><Bucket>arn:aws:s3:::bucket-a</Bucket><StorageClass>ring</StorageClass></Destination>
                    </Rule>
                </ReplicationConfiguration>`;
            const { emitted: emittedNoPrefix, meta1: metaNoPrefix } = roundTrip(noPrefixXml);
            expect(metaNoPrefix.rules[0].prefix).toBeUndefined();
            expect(emittedNoPrefix).toContain('<Filter/>');
            expect(emittedNoPrefix).not.toContain('<Prefix');

            // <Filter><Prefix></Prefix></Filter> round-trips with prefix=''
            const emptyPrefixXml = `<?xml version="1.0" encoding="UTF-8"?>
                <ReplicationConfiguration xmlns="http://s3.amazonaws.com/doc/2006-03-01/">
                    <Role>${TEST_ROLE}</Role>
                    <Rule>
                        <ID>rule1</ID>
                        <Status>Enabled</Status>
                        <Filter><Prefix></Prefix></Filter>
                        <Destination><Bucket>arn:aws:s3:::bucket-a</Bucket><StorageClass>ring</StorageClass></Destination>
                    </Rule>
                </ReplicationConfiguration>`;
            const { emitted: emittedEmptyPrefix, meta1: metaEmptyPrefix } = roundTrip(emptyPrefixXml);
            expect(metaEmptyPrefix.rules[0].prefix).toEqual('');
            expect(emittedEmptyPrefix).toContain('<Filter><Prefix/></Filter>');
        });

        it('round-trips legacy metadata without a format field (falls back to v1)', () => {
            const legacyMeta = {
                role: TEST_ROLE,
                destination: 'arn:aws:s3:::bucket-a',
                rules: [
                    {
                        id: 'rule1',
                        prefix: 'images/',
                        enabled: true,
                        storageClass: 'ring',
                    },
                ],
            } as any;

            const emitted = ReplicationConfiguration.getConfigXML(legacyMeta);
            expect(emitted).toContain('<Prefix>images/</Prefix>');
            expect(emitted).not.toContain('<Filter>');

            const inst = new ReplicationConfiguration(parseXML(emitted), null, mockS3ServerConfig);
            expect(inst.parseConfiguration()).toBeUndefined();
            const meta2 = inst.getReplicationConfiguration();

            expect(meta2.format).toEqual('v1');
            expect(meta2.rules[0].prefix).toEqual('images/');
            expect(meta2.rules[0].destination).toEqual('arn:aws:s3:::bucket-a');
        });

        it('emits V2 with Filter, Priority and Account on the wire', () => {
            const xml =
                `<?xml version="1.0" encoding="UTF-8"?>` +
                `<ReplicationConfiguration xmlns="http://s3.amazonaws.com/doc/2006-03-01/">` +
                `<Role>${TEST_ROLE}</Role>` +
                `<Rule>` +
                `<ID>rule1</ID>` +
                `<Status>Enabled</Status>` +
                `<Priority>1</Priority>` +
                `<Filter><Prefix>images/</Prefix></Filter>` +
                `<Destination>` +
                `<Bucket>arn:aws:s3:::bucket-a</Bucket>` +
                `<StorageClass>ring</StorageClass>` +
                `<Account>222222222222</Account>` +
                `</Destination>` +
                `</Rule>` +
                `</ReplicationConfiguration>`;
            const { emitted, meta1 } = roundTrip(xml);
            expect(meta1.format).toEqual('v2');

            const expected =
                `<?xml version="1.0" encoding="UTF-8"?>` +
                `<ReplicationConfiguration xmlns="http://s3.amazonaws.com/doc/2006-03-01/">` +
                `<Rule>` +
                `<ID>rule1</ID>` +
                `<Priority>1</Priority>` +
                `<Filter><Prefix>images/</Prefix></Filter>` +
                `<Status>Enabled</Status>` +
                `<Destination>` +
                `<Bucket>arn:aws:s3:::bucket-a</Bucket>` +
                `<StorageClass>ring</StorageClass>` +
                `<Account>222222222222</Account>` +
                `</Destination>` +
                `</Rule>` +
                `<Role>${TEST_ROLE}</Role>` +
                `</ReplicationConfiguration>`;
            expect(emitted).toEqual(expected);
        });
    });

    describe('validateConfig()', () => {
        it('should validate a V1 config', () => {
            expect(() =>
                ReplicationConfiguration.validateConfig({
                    role: TEST_ROLE,
                    destination: 'arn:aws:s3:::crr-dest',
                    rules: [
                        {
                            prefix: '',
                            enabled: true,
                            id: 'rule1',
                            storageClass: 'STANDARD',
                        },
                    ],
                }),
            ).not.toThrow();
        });

        it('should validate a V2 config with per-rule destination and account', () => {
            expect(() =>
                ReplicationConfiguration.validateConfig({
                    role: TEST_ROLE,
                    rules: [
                        {
                            prefix: '',
                            enabled: true,
                            id: 'rule1',
                            storageClass: 'ring',
                            destination: 'arn:aws:s3:::bucket-a',
                            account: '222222222222',
                        },
                    ],
                    format: 'v2',
                }),
            ).not.toThrow();
        });

        it('accepts a config with null top-level destination', () => {
            expect(() =>
                ReplicationConfiguration.validateConfig({
                    role: TEST_ROLE,
                    destination: null as any,
                    rules: [
                        {
                            prefix: '',
                            enabled: true,
                            id: 'rule1',
                            storageClass: 'ring',
                            destination: 'arn:aws:s3:::bucket-a',
                            account: '222222222222',
                        },
                    ],
                }),
            ).not.toThrow();
        });
    });

    describe('resolveSourceRole()', () => {
        it('returns the first comma-half of a pair', () => {
            expect(
                ReplicationConfiguration.resolveSourceRole('arn:aws:iam::111:role/src,arn:aws:iam::222:role/dst'),
            ).toEqual('arn:aws:iam::111:role/src');
        });
        it('returns the value verbatim when no comma', () => {
            expect(ReplicationConfiguration.resolveSourceRole('arn:aws:iam::111:role/src')).toEqual(
                'arn:aws:iam::111:role/src',
            );
        });
    });

    describe('resolveDestinationRole()', () => {
        it('returns the destination half unchanged when no account', () => {
            expect(
                ReplicationConfiguration.resolveDestinationRole('arn:aws:iam::111:role/src,arn:aws:iam::222:role/dst'),
            ).toEqual('arn:aws:iam::222:role/dst');
        });

        it('returns the single ARN unchanged when no account and no comma', () => {
            expect(ReplicationConfiguration.resolveDestinationRole('arn:aws:iam::111:role/crr-role')).toEqual(
                'arn:aws:iam::111:role/crr-role',
            );
        });

        it('substitutes account into the destination half of a comma-pair', () => {
            expect(
                ReplicationConfiguration.resolveDestinationRole(
                    'arn:aws:iam::111:role/src,arn:aws:iam::222:role/dst',
                    '333',
                ),
            ).toEqual('arn:aws:iam::333:role/dst');
        });

        it('substitutes account into a single-ARN role', () => {
            expect(ReplicationConfiguration.resolveDestinationRole('arn:aws:iam::111:role/crr-role', '333')).toEqual(
                'arn:aws:iam::333:role/crr-role',
            );
        });

        it('returns undefined for an empty topRole', () => {
            expect(ReplicationConfiguration.resolveDestinationRole('')).toBeUndefined();
        });
    });

    describe('resolveBackends()', () => {
        const crrSites = new Set(['crr-a', 'crr-b']);
        const isCloud = (site: string) => !crrSites.has(site);

        it('returns [] when no rule matches', () => {
            const out = ReplicationConfiguration.resolveBackends(
                {
                    role: 'arn:aws:iam::111:role/src',
                    rules: [
                        {
                            id: 'r',
                            prefix: 'docs',
                            enabled: true,
                            storageClass: 'crr-a',
                        },
                    ],
                },
                'logs/a',
                isCloud,
            );
            expect(out).toEqual([]);
        });

        it('stamps per-backend destination and role for CRR sites', () => {
            const out = ReplicationConfiguration.resolveBackends(
                {
                    role: 'arn:aws:iam::111:role/src,arn:aws:iam::000:role/repRule',
                    rules: [
                        {
                            id: 'r1',
                            prefix: '',
                            enabled: true,
                            priority: 1,
                            storageClass: 'crr-a',
                            destination: 'arn:aws:s3:::bucket-a',
                            account: '222',
                        },
                        {
                            id: 'r2',
                            prefix: '',
                            enabled: true,
                            priority: 2,
                            storageClass: 'crr-b',
                            destination: 'arn:aws:s3:::bucket-b',
                            account: '333',
                        },
                    ],
                },
                'k',
                isCloud,
            );
            const by = Object.fromEntries(out.map(b => [b.site, b]));
            expect(by['crr-a'].destination).toEqual('arn:aws:s3:::bucket-a');
            expect(by['crr-a'].role).toEqual('arn:aws:iam::222:role/repRule');
            expect(by['crr-b'].destination).toEqual('arn:aws:s3:::bucket-b');
            expect(by['crr-b'].role).toEqual('arn:aws:iam::333:role/repRule');
        });

        it('omits destination and role for cloud sites', () => {
            const out = ReplicationConfiguration.resolveBackends(
                {
                    role: 'arn:aws:iam::111:role/src',
                    rules: [
                        {
                            id: 'r',
                            prefix: '',
                            enabled: true,
                            storageClass: 'cloud-a',
                            destination: 'arn:aws:s3:::ignored',
                            account: '999',
                        },
                    ],
                },
                'k',
                isCloud,
            );
            expect(out).toEqual([
                {
                    site: 'cloud-a',
                    status: 'PENDING',
                    dataStoreVersionId: '',
                },
            ]);
        });

        it('dedups CRR backends on (site, destination, role)', () => {
            const out = ReplicationConfiguration.resolveBackends(
                {
                    role: 'arn:aws:iam::111:role/src',
                    rules: [
                        {
                            id: 'low',
                            prefix: '',
                            enabled: true,
                            priority: 1,
                            storageClass: 'crr-a',
                            destination: 'arn:aws:s3:::bucket-a',
                            account: '222',
                        },
                        {
                            id: 'high',
                            prefix: '',
                            enabled: true,
                            priority: 10,
                            storageClass: 'crr-a',
                            destination: 'arn:aws:s3:::bucket-a',
                            account: '222',
                        },
                    ],
                },
                'k',
                isCloud,
            );
            expect(out).toHaveLength(1);
        });

        it('keeps two CRR backends for same site, different destinations', () => {
            const out = ReplicationConfiguration.resolveBackends(
                {
                    role: 'arn:aws:iam::111:role/src',
                    rules: [
                        {
                            id: 'r1',
                            prefix: '',
                            enabled: true,
                            storageClass: 'crr-a',
                            destination: 'arn:aws:s3:::bucket-x',
                            account: '222',
                        },
                        {
                            id: 'r2',
                            prefix: '',
                            enabled: true,
                            storageClass: 'crr-a',
                            destination: 'arn:aws:s3:::bucket-y',
                            account: '222',
                        },
                    ],
                },
                'k',
                isCloud,
            );
            expect(out).toHaveLength(2);
            const buckets = out.map(b => b.destination).sort();
            expect(buckets).toEqual(['arn:aws:s3:::bucket-x', 'arn:aws:s3:::bucket-y']);
        });

        it('dedups cloud backends on site alone', () => {
            const out = ReplicationConfiguration.resolveBackends(
                {
                    role: 'arn:aws:iam::111:role/src',
                    rules: [
                        {
                            id: 'r1',
                            prefix: '',
                            enabled: true,
                            priority: 1,
                            storageClass: 'cloud-a',
                        },
                        {
                            id: 'r2',
                            prefix: '',
                            enabled: true,
                            priority: 2,
                            storageClass: 'cloud-a',
                        },
                    ],
                },
                'k',
                isCloud,
            );
            expect(out).toHaveLength(1);
        });

        it('expands legacy V1 comma-separated storageClass', () => {
            const out = ReplicationConfiguration.resolveBackends(
                {
                    role: 'arn:aws:iam::111:role/src,arn:aws:iam::222:role/dst',
                    destination: 'arn:aws:s3:::legacy-bucket',
                    rules: [
                        {
                            id: 'r',
                            prefix: '',
                            enabled: true,
                            storageClass: 'crr-a,crr-b',
                        },
                    ],
                },
                'k',
                isCloud,
            );
            expect(out.map(b => b.site).sort()).toEqual(['crr-a', 'crr-b']);
            out.forEach(b => {
                expect(b.destination).toEqual('arn:aws:s3:::legacy-bucket');
                expect(b.role).toEqual('arn:aws:iam::222:role/dst');
            });
        });

        it('strips :preferred_read suffix from storageClass', () => {
            const out = ReplicationConfiguration.resolveBackends(
                {
                    role: 'arn:aws:iam::111:role/src',
                    rules: [
                        {
                            id: 'r',
                            prefix: '',
                            enabled: true,
                            storageClass: 'crr-a:preferred_read',
                            destination: 'arn:aws:s3:::bucket-a',
                        },
                    ],
                },
                'k',
                isCloud,
            );
            expect(out[0].site).toEqual('crr-a');
        });

        it('uses highest-priority rule fields on dedup collision', () => {
            const out = ReplicationConfiguration.resolveBackends(
                {
                    role: 'arn:aws:iam::111:role/src,arn:aws:iam::000:role/repRule',
                    rules: [
                        {
                            id: 'low',
                            prefix: '',
                            enabled: true,
                            priority: 1,
                            storageClass: 'crr-a',
                            destination: 'arn:aws:s3:::bucket-a',
                            account: '222',
                        },
                        {
                            id: 'high',
                            prefix: 'docs',
                            enabled: true,
                            priority: 10,
                            storageClass: 'crr-a',
                            destination: 'arn:aws:s3:::bucket-a',
                            account: '222',
                        },
                    ],
                },
                'docs/file',
                isCloud,
            );

            expect(out).toHaveLength(1);
            expect(out[0].destination).toEqual('arn:aws:s3:::bucket-a');
            expect(out[0].role).toEqual('arn:aws:iam::222:role/repRule');
        });

        it('treats missing priority as lowest', () => {
            const out = ReplicationConfiguration.resolveBackends(
                {
                    role: 'arn:aws:iam::111:role/src,arn:aws:iam::000:role/repRule',
                    rules: [
                        {
                            id: 'no-prio',
                            prefix: '',
                            enabled: true,
                            storageClass: 'crr-a',
                            destination: 'arn:aws:s3:::bucket-A',
                            account: '222',
                        },
                        {
                            id: 'with-prio',
                            prefix: '',
                            enabled: true,
                            priority: 1,
                            storageClass: 'crr-a',
                            destination: 'arn:aws:s3:::bucket-A',
                            account: '222',
                        },
                    ],
                },
                'k',
                isCloud,
            );

            expect(out).toHaveLength(1);
        });

        it('skips rules without storageClass', () => {
            const out = ReplicationConfiguration.resolveBackends(
                {
                    role: 'arn:aws:iam::111:role/src',
                    rules: [
                        {
                            id: 'no-sc',
                            prefix: '',
                            enabled: true,
                        },
                        {
                            id: 'r2',
                            prefix: '',
                            enabled: true,
                            storageClass: 'crr-a',
                            destination: 'arn:aws:s3:::bucket-a',
                        },
                    ],
                },
                'k',
                isCloud,
            );

            expect(out).toHaveLength(1);
            expect(out[0].site).toEqual('crr-a');
        });

        it('skips disabled rules', () => {
            const out = ReplicationConfiguration.resolveBackends(
                {
                    role: 'arn:aws:iam::111:role/src',
                    rules: [
                        {
                            id: 'r1',
                            prefix: '',
                            enabled: false,
                            storageClass: 'crr-a',
                            destination: 'arn:aws:s3:::bucket-a',
                            account: '222',
                        },
                        {
                            id: 'r2',
                            prefix: '',
                            enabled: true,
                            storageClass: 'crr-b',
                            destination: 'arn:aws:s3:::bucket-b',
                            account: '333',
                        },
                    ],
                },
                'k',
                isCloud,
            );

            expect(out).toHaveLength(1);
            expect(out[0].site).toEqual('crr-b');
        });

        it('handles mixed CRR + cloud sites in one call', () => {
            const out = ReplicationConfiguration.resolveBackends(
                {
                    role: 'arn:aws:iam::111:role/src,arn:aws:iam::000:role/repRule',
                    rules: [
                        {
                            id: 'r-crr',
                            prefix: '',
                            enabled: true,
                            storageClass: 'crr-a',
                            destination: 'arn:aws:s3:::bucket-a',
                            account: '222',
                        },
                        {
                            id: 'r-cloud',
                            prefix: '',
                            enabled: true,
                            storageClass: 'cloud-a',
                        },
                    ],
                },
                'k',
                isCloud,
            );

            expect(out).toHaveLength(2);
            const by = Object.fromEntries(out.map(b => [b.site, b]));
            expect(by['crr-a'].destination).toEqual('arn:aws:s3:::bucket-a');
            expect(by['crr-a'].role).toEqual('arn:aws:iam::222:role/repRule');
            expect(by['cloud-a'].destination).toBeUndefined();
            expect(by['cloud-a'].role).toBeUndefined();
        });

        it('expands V2 comma-separated storageClass into one backend per cloud site', () => {
            const out = ReplicationConfiguration.resolveBackends(
                {
                    role: 'arn:aws:iam::111:role/src',
                    rules: [
                        {
                            id: 'r',
                            prefix: '',
                            enabled: true,
                            priority: 1,
                            storageClass: 'cloud-a,cloud-b',
                        },
                    ],
                },
                'k',
                isCloud,
            );

            expect(out.map(b => b.site).sort()).toEqual(['cloud-a', 'cloud-b']);
            out.forEach(b => {
                expect(b.destination).toBeUndefined();
                expect(b.role).toBeUndefined();
            });
        });

        it('expands V2 comma-separated storageClass into one backend per CRR site', () => {
            const out = ReplicationConfiguration.resolveBackends(
                {
                    role: 'arn:aws:iam::111:role/src,arn:aws:iam::222:role/dst',
                    rules: [
                        {
                            id: 'r',
                            prefix: '',
                            enabled: true,
                            priority: 1,
                            storageClass: 'crr-a,crr-b',
                            destination: 'arn:aws:s3:::bucket-a',
                        },
                    ],
                },
                'k',
                isCloud,
            );

            expect(out.map(b => b.site).sort()).toEqual(['crr-a', 'crr-b']);
            out.forEach(b => {
                expect(b.destination).toEqual('arn:aws:s3:::bucket-a');
                expect(b.role).toEqual('arn:aws:iam::222:role/dst');
            });
        });

        it('uses single-ARN role unchanged when rule has no account', () => {
            const out = ReplicationConfiguration.resolveBackends(
                {
                    role: 'arn:aws:iam::111:role/crr-role',
                    rules: [
                        {
                            id: 'r',
                            prefix: '',
                            enabled: true,
                            storageClass: 'crr-a',
                            destination: 'arn:aws:s3:::bucket-a',
                        },
                    ],
                },
                'k',
                isCloud,
            );

            expect(out[0].role).toEqual('arn:aws:iam::111:role/crr-role');
        });

        it('substitutes account into single-ARN role when rule has account', () => {
            const out = ReplicationConfiguration.resolveBackends(
                {
                    role: 'arn:aws:iam::111:role/crr-role',
                    rules: [
                        {
                            id: 'r',
                            prefix: '',
                            enabled: true,
                            storageClass: 'crr-a',
                            destination: 'arn:aws:s3:::bucket-a',
                            account: '222',
                        },
                    ],
                },
                'k',
                isCloud,
            );

            expect(out[0].role).toEqual('arn:aws:iam::222:role/crr-role');
        });

        it('handles mixed account presence across rules (comma-pair role)', () => {
            const out = ReplicationConfiguration.resolveBackends(
                {
                    role: 'arn:aws:iam::111:role/src,arn:aws:iam::222:role/dst',
                    rules: [
                        {
                            id: 'no-acct',
                            prefix: '',
                            enabled: true,
                            storageClass: 'crr-a',
                            destination: 'arn:aws:s3:::bucket-a',
                        },
                        {
                            id: 'with-acct',
                            prefix: '',
                            enabled: true,
                            storageClass: 'crr-b',
                            destination: 'arn:aws:s3:::bucket-b',
                            account: '333',
                        },
                    ],
                },
                'k',
                isCloud,
            );

            const by = Object.fromEntries(out.map(b => [b.site, b]));
            expect(by['crr-a'].role).toEqual('arn:aws:iam::222:role/dst');
            expect(by['crr-b'].role).toEqual('arn:aws:iam::333:role/dst');
        });

        it('preserves dataStoreVersionId from existingBackends', () => {
            const out = ReplicationConfiguration.resolveBackends(
                {
                    role: 'arn:aws:iam::111:role/src',
                    rules: [
                        {
                            id: 'r',
                            prefix: '',
                            enabled: true,
                            storageClass: 'crr-a',
                            destination: 'arn:aws:s3:::bucket-a',
                        },
                    ],
                },
                'k',
                isCloud,
                [
                    {
                        site: 'crr-a',
                        status: 'COMPLETED',
                        dataStoreVersionId: 'v-123',
                        destination: 'arn:aws:s3:::bucket-a',
                        role: 'arn:aws:iam::111:role/src',
                    },
                ],
            );
            expect(out[0].dataStoreVersionId).toEqual('v-123');
            expect(out[0].status).toEqual('PENDING');
        });

        it('matches existingBackends per (site, destination, role) for CRR', () => {
            const out = ReplicationConfiguration.resolveBackends(
                {
                    role: 'arn:aws:iam::111:role/src,arn:aws:iam::222:role/dst',
                    rules: [
                        {
                            id: 'r1',
                            prefix: '',
                            enabled: true,
                            storageClass: 'crr-a',
                            destination: 'arn:aws:s3:::bucket-x',
                        },
                        {
                            id: 'r2',
                            prefix: '',
                            enabled: true,
                            storageClass: 'crr-a',
                            destination: 'arn:aws:s3:::bucket-y',
                        },
                    ],
                },
                'k',
                isCloud,
                [
                    {
                        site: 'crr-a',
                        status: 'COMPLETED',
                        dataStoreVersionId: 'v-x',
                        destination: 'arn:aws:s3:::bucket-x',
                        role: 'arn:aws:iam::222:role/dst',
                    },
                    {
                        site: 'crr-a',
                        status: 'COMPLETED',
                        dataStoreVersionId: 'v-y',
                        destination: 'arn:aws:s3:::bucket-y',
                        role: 'arn:aws:iam::222:role/dst',
                    },
                ],
            );
            const byDest = Object.fromEntries(out.map(b => [b.destination, b.dataStoreVersionId]));
            expect(byDest['arn:aws:s3:::bucket-x']).toEqual('v-x');
            expect(byDest['arn:aws:s3:::bucket-y']).toEqual('v-y');
        });
    });
});
