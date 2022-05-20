const assert = require('assert');
const BucketInfo = require('../../../lib/models/BucketInfo').default;
const { WebsiteConfiguration } =
    require('../../../lib/models/WebsiteConfiguration');

// create variables to populate dummyBucket
const bucketName = 'nameOfBucket';
const owner = 'canonicalID';
const ownerDisplayName = 'bucketOwner';
const emptyAcl = {
    Canned: 'private',
    FULL_CONTROL: [],
    WRITE: [],
    WRITE_ACP: [],
    READ: [],
    READ_ACP: [],
};

const filledAcl = {
    Canned: '',
    FULL_CONTROL: ['someOtherAccount'],
    WRITE: [],
    WRITE_ACP: ['yetAnotherAccount'],
    READ: [],
    READ_ACP: ['thisaccount'],
};

const acl = { undefined, emptyAcl, filledAcl };

const testDate = new Date().toJSON();

const testVersioningConfiguration = { Status: 'Enabled' };

const testWebsiteConfiguration = new WebsiteConfiguration({
    indexDocument: 'index.html',
    errorDocument: 'error.html',
    routingRules: [
        {
            redirect: {
                httpRedirectCode: '301',
                hostName: 'www.example.com',
                replaceKeyPrefixWith: '/documents',
            },
            condition: {
                httpErrorCodeReturnedEquals: 400,
                keyPrefixEquals: '/docs',
            },
        },
        {
            redirect: {
                protocol: 'http',
                replaceKeyWith: 'error.html',
            },
            condition: {
                keyPrefixEquals: 'ExamplePage.html',
            },
        },
    ],
});

const testLocationConstraint = 'us-west-1';

const testCorsConfiguration = [
    { id: 'test',
        allowedMethods: ['PUT', 'POST', 'DELETE'],
        allowedOrigins: ['http://www.example.com'],
        allowedHeaders: ['*'],
        maxAgeSeconds: 3000,
        exposeHeaders: ['x-amz-server-side-encryption'] },
    { allowedMethods: ['GET'],
        allowedOrigins: ['*'],
        allowedHeaders: ['*'],
        maxAgeSeconds: 3000 },
];

const testReplicationConfiguration = {
    role: 'STRING_VALUE',
    destination: 'STRING_VALUE',
    rules: [
        {
            storageClass: 'STANDARD',
            prefix: 'STRING_VALUE',
            enabled: true,
            id: 'STRING_VALUE',
        },
    ],
};

const testLifecycleConfiguration = {
    rules: [
        {
            ruleID: 'STRING_VALUE',
            ruleStatus: 'Enabled',
            filter: {
                rulePrefix: 'STRING_VALUE',
                tag: [
                    {
                        key: 'STRING_VALUE',
                        val: 'STRING_VALUE',
                    },
                    {
                        key: 'STRING_VALUE',
                        val: 'STRING_VALUE',
                    },
                ],
            },
            actions: [
                {
                    actionName: 'Expiration',
                    days: 5,
                    date: '2016-01-01T00:00:00.000Z',
                    deleteMarker: 'true',
                },
            ],
        },
    ],
};

const testUid = '99ae3446-7082-4c17-ac97-52965dc004ec';

const testBucketPolicy = {
    Version: '2012-10-17',
    Statement: [
        {
            Effect: 'Allow',
            Principal: '*',
            Resource: 'arn:aws:s3:::examplebucket',
            Action: 's3:*',
        },
    ],
};

const testobjectLockEnabled = false;

const testObjectLockConfiguration = {
    rule: {
        mode: 'GOVERNANCE',
        days: 1,
    },
};

const testNotificationConfiguration = {
    queueConfig: [
        {
            events: ['s3:ObjectCreated:*'],
            queueArn: 'arn:scality:bucketnotif:::target1',
            filterRules: [
                {
                    name: 'prefix',
                    value: 'logs/',
                },
                {
                    name: 'suffix',
                    value: '.log',
                },
            ],
            id: 'test-queue-config-1',
        },
        {
            events: ['s3:ObjectRemoved:Delete', 's3:ObjectCreated:Copy'],
            queueArn: 'arn:scality:bucketnotif:::target2',
            id: 'test-queue-config-2',
        },
    ],
};

const testBucketTagging = [
    {
        key: 'testKey1',
        value: 'testValue1',
    },
    {
        key: 'testKey2',
        value: 'testValue2',
    },
    {
        key: 'testKey3',
        value: 'testValue3',
    },
];

// create a dummy bucket to test getters and setters
Object.keys(acl).forEach(
    aclObj => describe(`different acl configurations : ${aclObj}`, () => {
        const dummyBucket = new BucketInfo(
            bucketName, owner, ownerDisplayName, testDate,
            BucketInfo.currentModelVersion(), acl[aclObj],
            false, false, {
                cryptoScheme: 1,
                algorithm: 'sha1',
                masterKeyId: 'somekey',
                mandatory: true,
            }, testVersioningConfiguration,
            testLocationConstraint,
            testWebsiteConfiguration,
            testCorsConfiguration,
            testReplicationConfiguration,
            testLifecycleConfiguration,
            testBucketPolicy,
            testUid,
            testobjectLockEnabled,
            testObjectLockConfiguration,
            testNotificationConfiguration,
            testBucketTagging);

        describe('serialize/deSerialize on BucketInfo class', () => {
            const serialized = dummyBucket.serialize();
            it('should serialize', done => {
                assert.strictEqual(typeof serialized, 'string');
                const bucketInfos = {
                    acl: dummyBucket._acl,
                    name: dummyBucket._name,
                    owner: dummyBucket._owner,
                    ownerDisplayName: dummyBucket._ownerDisplayName,
                    creationDate: dummyBucket._creationDate,
                    mdBucketModelVersion: dummyBucket._mdBucketModelVersion,
                    transient: dummyBucket._transient,
                    deleted: dummyBucket._deleted,
                    serverSideEncryption: dummyBucket._serverSideEncryption,
                    versioningConfiguration:
                        dummyBucket._versioningConfiguration,
                    locationConstraint: dummyBucket._locationConstraint,
                    websiteConfiguration: dummyBucket._websiteConfiguration
                        .getConfig(),
                    cors: dummyBucket._cors,
                    replicationConfiguration:
                        dummyBucket._replicationConfiguration,
                    lifecycleConfiguration:
                        dummyBucket._lifecycleConfiguration,
                    bucketPolicy: dummyBucket._bucketPolicy,
                    uid: dummyBucket._uid,
                    objectLockEnabled: dummyBucket._objectLockEnabled,
                    objectLockConfiguration:
                        dummyBucket._objectLockConfiguration,
                    notificationConfiguration: dummyBucket._notificationConfiguration,
                    tags: dummyBucket._tags,
                };
                assert.strictEqual(serialized, JSON.stringify(bucketInfos));
                done();
            });

            it('should deSerialize into an instance of BucketInfo', done => {
                const serialized = dummyBucket.serialize();
                const deSerialized = BucketInfo.deSerialize(serialized);
                assert.strictEqual(typeof deSerialized, 'object');
                assert(deSerialized instanceof BucketInfo);
                assert.deepStrictEqual(deSerialized, dummyBucket);
                done();
            });
        });

        describe('constructor', () => {
            it('this should have the right BucketInfo types', () => {
                assert.strictEqual(typeof dummyBucket.getName(), 'string');
                assert.strictEqual(typeof dummyBucket.getOwner(), 'string');
                assert.strictEqual(typeof dummyBucket.getOwnerDisplayName(),
                    'string');
                assert.strictEqual(typeof dummyBucket.getCreationDate(),
                    'string');
                assert.strictEqual(typeof dummyBucket.isObjectLockEnabled(),
                    'boolean');
            });
            it('this should have the right acl\'s types', () => {
                assert.strictEqual(typeof dummyBucket.getAcl(), 'object');
                assert.strictEqual(
                    typeof dummyBucket.getAcl().Canned, 'string');
                assert(Array.isArray(dummyBucket.getAcl().FULL_CONTROL));
                assert(Array.isArray(dummyBucket.getAcl().WRITE));
                assert(Array.isArray(dummyBucket.getAcl().WRITE_ACP));
                assert(Array.isArray(dummyBucket.getAcl().READ));
                assert(Array.isArray(dummyBucket.getAcl().READ_ACP));
            });
            it('this should have the right acls', () => {
                assert.deepStrictEqual(dummyBucket.getAcl(),
                    acl[aclObj] || emptyAcl);
            });
            it('this should have the right website config types', () => {
                const websiteConfig = dummyBucket.getWebsiteConfiguration();
                assert.strictEqual(typeof websiteConfig, 'object');
                assert.strictEqual(typeof websiteConfig._indexDocument,
                    'string');
                assert.strictEqual(typeof websiteConfig._errorDocument,
                    'string');
                assert(Array.isArray(websiteConfig._routingRules));
            });
            it('this should have the right cors config types', () => {
                const cors = dummyBucket.getCors();
                assert(Array.isArray(cors));
                assert(Array.isArray(cors[0].allowedMethods));
                assert(Array.isArray(cors[0].allowedOrigins));
                assert(Array.isArray(cors[0].allowedHeaders));
                assert(Array.isArray(cors[0].allowedMethods));
                assert(Array.isArray(cors[0].exposeHeaders));
                assert.strictEqual(typeof cors[0].maxAgeSeconds, 'number');
                assert.strictEqual(typeof cors[0].id, 'string');
            });
        });

        describe('getters on BucketInfo class', () => {
            it('getACl should return the acl', () => {
                assert.deepStrictEqual(dummyBucket.getAcl(),
                    acl[aclObj] || emptyAcl);
            });
            it('getName should return name', () => {
                assert.deepStrictEqual(dummyBucket.getName(), bucketName);
            });
            it('getOwner should return owner', () => {
                assert.deepStrictEqual(dummyBucket.getOwner(), owner);
            });
            it('getOwnerDisplayName should return ownerDisplayName', () => {
                assert.deepStrictEqual(dummyBucket.getOwnerDisplayName(),
                    ownerDisplayName);
            });
            it('getCreationDate should return creationDate', () => {
                assert.deepStrictEqual(dummyBucket.getCreationDate(), testDate);
            });
            it('getVersioningConfiguration should return configuration', () => {
                assert.deepStrictEqual(dummyBucket.getVersioningConfiguration(),
                    testVersioningConfiguration);
            });
            it('getWebsiteConfiguration should return configuration', () => {
                assert.deepStrictEqual(dummyBucket.getWebsiteConfiguration(),
                    testWebsiteConfiguration);
            });
            it('getLocationConstraint should return locationConstraint', () => {
                assert.deepStrictEqual(dummyBucket.getLocationConstraint(),
                    testLocationConstraint);
            });
            it('getCors should return CORS configuration', () => {
                assert.deepStrictEqual(dummyBucket.getCors(),
                    testCorsConfiguration);
            });
            it('getLifeCycleConfiguration should return configuration', () => {
                assert.deepStrictEqual(dummyBucket.getLifecycleConfiguration(),
                    testLifecycleConfiguration);
            });
            it('getBucketPolicy should return policy', () => {
                assert.deepStrictEqual(
                    dummyBucket.getBucketPolicy(), testBucketPolicy);
            });
            it('getUid should return unique id of bucket', () => {
                assert.deepStrictEqual(dummyBucket.getUid(), testUid);
            });
            it('object lock should be disabled by default', () => {
                assert.deepStrictEqual(
                    dummyBucket.isObjectLockEnabled(), false);
            });
            it('getObjectLockConfiguration should return configuration', () => {
                assert.deepStrictEqual(dummyBucket.getObjectLockConfiguration(),
                    testObjectLockConfiguration);
            });
            it('getNotificationConfiguration should return configuration', () => {
                assert.deepStrictEqual(dummyBucket.getNotificationConfiguration(),
                    testNotificationConfiguration);
            });
        });

        describe('setters on BucketInfo class', () => {
            it('setCannedAcl should set acl.Canned', () => {
                const testAclCanned = 'public-read';
                dummyBucket.setCannedAcl(testAclCanned);
                assert.deepStrictEqual(
                    dummyBucket.getAcl().Canned, testAclCanned);
            });
            it('setSpecificAcl should set the acl of a specified bucket',
                () => {
                    const typeOfGrant = 'WRITE';
                    dummyBucket.setSpecificAcl(owner, typeOfGrant);
                    const lastIndex =
                             dummyBucket.getAcl()[typeOfGrant].length - 1;
                    assert.deepStrictEqual(
                        dummyBucket.getAcl()[typeOfGrant][lastIndex], owner);
                });
            it('setFullAcl should set full set of ACLs', () => {
                const newACLs = {
                    Canned: '',
                    FULL_CONTROL: ['someOtherAccount'],
                    WRITE: [],
                    WRITE_ACP: ['yetAnotherAccount'],
                    READ: [],
                    READ_ACP: [],
                };
                dummyBucket.setFullAcl(newACLs);
                assert.deepStrictEqual(dummyBucket.getAcl().FULL_CONTROL,
                    ['someOtherAccount']);
                assert.deepStrictEqual(dummyBucket.getAcl().WRITE_ACP,
                    ['yetAnotherAccount']);
            });
            it('setName should set the bucket name', () => {
                const newName = 'newName';
                dummyBucket.setName(newName);
                assert.deepStrictEqual(dummyBucket.getName(), newName);
            });
            it('setOwner should set the owner', () => {
                const newOwner = 'newOwner';
                dummyBucket.setOwner(newOwner);
                assert.deepStrictEqual(dummyBucket.getOwner(), newOwner);
            });
            it('getOwnerDisplayName should return ownerDisplayName', () => {
                const newOwnerDisplayName = 'newOwnerDisplayName';
                dummyBucket.setOwnerDisplayName(newOwnerDisplayName);
                assert.deepStrictEqual(dummyBucket.getOwnerDisplayName(),
                    newOwnerDisplayName);
            });
            it('setLocationConstraint should set the locationConstraint',
                () => {
                    const newLocation = 'newLocation';
                    dummyBucket.setLocationConstraint(newLocation);
                    assert.deepStrictEqual(
                        dummyBucket.getLocationConstraint(), newLocation);
                });
            it('setVersioningConfiguration should set configuration', () => {
                const newVersioningConfiguration =
                    { Status: 'Enabled', MfaDelete: 'Enabled' };
                dummyBucket
                    .setVersioningConfiguration(newVersioningConfiguration);
                assert.deepStrictEqual(dummyBucket.getVersioningConfiguration(),
                    newVersioningConfiguration);
            });
            it('setWebsiteConfiguration should set configuration', () => {
                const newWebsiteConfiguration = {
                    redirectAllRequestsTo: {
                        hostName: 'www.example.com',
                        protocol: 'https',
                    },
                };
                dummyBucket
                    .setWebsiteConfiguration(newWebsiteConfiguration);
                assert.deepStrictEqual(dummyBucket.getWebsiteConfiguration(),
                    newWebsiteConfiguration);
            });
            it('setCors should set CORS configuration', () => {
                const newCorsConfiguration =
                    [{ allowedMethods: ['PUT'], allowedOrigins: ['*'] }];
                dummyBucket.setCors(newCorsConfiguration);
                assert.deepStrictEqual(dummyBucket.getCors(),
                    newCorsConfiguration);
            });
            it('setReplicationConfiguration should set replication ' +
                'configuration', () => {
                const newReplicationConfig = {
                    Role: 'arn:aws:iam::123456789012:role/src-resource,' +
                        'arn:aws:iam::123456789012:role/dest-resource',
                    Rules: [
                        {
                            Destination: {
                                Bucket: 'arn:aws:s3:::destination-bucket',
                            },
                            Prefix: 'test-prefix',
                            Status: 'Enabled',
                        },
                    ],
                };
                dummyBucket.setReplicationConfiguration(newReplicationConfig);
            });
            it('setLifecycleConfiguration should set lifecycle ' +
                'configuration', () => {
                const newLifecycleConfig = {
                    rules: [
                        {
                            ruleID: 'new-rule',
                            ruleStatus: 'Enabled',
                            filter: {
                                rulePrefix: 'test-prefix',
                            },
                            action: {
                                actionName: 'NoncurrentVersionExpiration',
                                days: 0,
                            },
                        },
                    ],
                };
                dummyBucket.setLifecycleConfiguration(newLifecycleConfig);
                assert.deepStrictEqual(dummyBucket.getLifecycleConfiguration(),
                    newLifecycleConfig);
            });
            it('setBucketPolicy should set bucket policy', () => {
                const newBucketPolicy = {
                    Version: '2012-10-17',
                    Statement: [
                        {
                            Effect: 'Deny',
                            Principal: '*',
                            Resource: 'arn:aws:s3:::examplebucket',
                            Action: 's3:*',
                        },
                    ],
                };
                dummyBucket.setBucketPolicy(newBucketPolicy);
                assert.deepStrictEqual(
                    dummyBucket.getBucketPolicy(), newBucketPolicy);
            });
            it('setObjectLockConfiguration should set object lock ' +
                'configuration', () => {
                const newObjectLockConfig = {
                    rule: {
                        mode: 'COMPLIANCE',
                        years: 1,
                    },
                };
                dummyBucket.setObjectLockConfiguration(newObjectLockConfig);
                assert.deepStrictEqual(dummyBucket.getObjectLockConfiguration(),
                    newObjectLockConfig);
            });
            [true, false].forEach(bool => {
                it('setObjectLockEnabled should set object lock status', () => {
                    dummyBucket.setObjectLockEnabled(bool);
                    assert.deepStrictEqual(dummyBucket.isObjectLockEnabled(),
                        bool);
                });
            });
            it('setNotificationConfiguration should set notification configuration', () => {
                const newNotifConfig = {
                    queueConfig: [
                        {
                            events: ['s3:ObjectRemoved:*'],
                            queueArn: 'arn:scality:bucketnotif:::target3',
                            filterRules: [
                                {
                                    name: 'prefix',
                                    value: 'configs/',
                                },
                            ],
                            id: 'test-config-3',
                        },
                    ],
                };
                dummyBucket.setNotificationConfiguration(newNotifConfig);
                assert.deepStrictEqual(
                    dummyBucket.getNotificationConfiguration(), newNotifConfig);
            });
            it('setUid should set bucket uid', () => {
                const testUid = '7751ec04-da87-44a1-99b4-95ebb345d40e';
                dummyBucket.setUid(testUid);
                assert.deepStrictEqual(
                    dummyBucket.getUid(), testUid);
            });
        });
    }),
);
