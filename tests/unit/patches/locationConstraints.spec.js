const assert = require('assert');
const { patchLocations } = require('../../../lib/patches/locationConstraints');
const {
    privateKey, accessKey, decryptedSecretKey, secretKey,
} = require('./creds.json');

const tests = [
    {
        locationType: 'location-mem-v1',
        locations: {
            name: 'legacy',
            objectId: 'legacy',
        },
        expected: {
            details: {
                supportsVersioning: true,
            },
            isTransient: false,
            legacyAwsBehavior: false,
            name: 'mem-loc',
            objectId: 'legacy',
            sizeLimitGB: null,
            type: 'mem',
        },
    },
    {
        locationType: 'location-file-v1',
        locations: {
            objectId: 'us-east-1',
            legacyAwsBehavior: true,
        },
        expected: {
            details: {
                supportsVersioning: true,
            },
            isTransient: false,
            legacyAwsBehavior: true,
            objectId: 'us-east-1',
            sizeLimitGB: null,
            type: 'file',
        },
    },
    {
        locationType: 'location-azure-v1',
        locations: {
            objectId: 'azurebackendtest',
            details: {
                bucketMatch: 'azurebucketmatch',
                endpoint: 'azure.end.point',
                bucketName: 'azurebucketname',
                accessKey,
                secretKey,
            },
        },
        expected: {
            details: {
                azureContainerName: 'azurebucketname',
                azureStorageAccessKey: decryptedSecretKey,
                azureStorageAccountName: accessKey,
                azureStorageEndpoint: 'azure.end.point',
                bucketMatch: 'azurebucketmatch',
            },
            isTransient: false,
            legacyAwsBehavior: false,
            objectId: 'azurebackendtest',
            sizeLimitGB: null,
            type: 'azure',
        },
    },
    {
        locationType: 'location-aws-s3-v1',
        locations: {
            objectId: 'awsbackendtest',
            details: {
                bucketMatch: 'awsbucketmatch',
                endpoint: 'aws.end.point',
                bucketName: 'awsbucketname',
                region: 'us-west-1',
                accessKey,
                secretKey,
            },
        },
        expected: {
            details: {
                awsEndpoint: 'aws.end.point',
                bucketMatch: 'awsbucketmatch',
                bucketName: 'awsbucketname',
                https: true,
                pathStyle: false,
                serverSideEncryption: false,
                supportsVersioning: true,
                region: 'us-west-1',
                credentials: {
                    accessKey,
                    secretKey: decryptedSecretKey,
                },
            },
            isTransient: false,
            legacyAwsBehavior: false,
            objectId: 'awsbackendtest',
            sizeLimitGB: null,
            type: 'aws_s3',
        },
    },
    {
        locationType: 'location-gcp-v1',
        locations: {
            name: 'gcpbackendtest',
            objectId: 'gcpbackendtest',
            details: {
                bucketMatch: 'gcpbucketmatch',
                endpoint: 'gcp.end.point',
                accessKey: 'gcpaccesskey',
                secretKey,
                bucketName: 'gcpbucketname',
            },
        },
        expected: {
            details: {
                bucketMatch: 'gcpbucketmatch',
                bucketName: 'gcpbucketname',
                credentials: {
                    accessKey: 'gcpaccesskey',
                    secretKey: decryptedSecretKey,
                },
                gcpEndpoint: 'gcp.end.point',
                mpuBucketName: undefined,
                https: true,
            },
            legacyAwsBehavior: false,
            isTransient: false,
            sizeLimitGB: null,
            type: 'gcp',
            objectId: 'gcpbackendtest',
        },
    },
    {
        locationType: 'location-scality-sproxyd-v1',
        locations: {
            name: 'sproxydbackendtest',
            objectId: 'sproxydbackendtest',
            details: {
                chordCos: 3,
                bootstrapList: ['localhost:8001', 'localhost:8002'],
                proxyPath: '/proxy/path',
            },
        },
        expected: {
            details: {
                connector: {
                    sproxyd: {
                        chordCos: 3,
                        bootstrap: [
                            'localhost:8001',
                            'localhost:8002',
                        ],
                        path: '/proxy/path',
                    },
                },
                supportsVersioning: true,
            },
            legacyAwsBehavior: false,
            isTransient: false,
            sizeLimitGB: null,
            type: 'scality',
            objectId: 'sproxydbackendtest',
        },
    },
    {
        locationType: 'location-scality-ring-s3-v1',
        locations: {
            objectId: 'httpsawsbackendtest',
            details: {
                bucketMatch: 'rings3bucketmatch',
                endpoint: 'https://secure.ring.end.point',
                accessKey: 'rings3accesskey',
                secretKey,
                bucketName: 'rings3bucketname',
                region: 'us-west-1',
            },
        },
        expected: {
            details: {
                awsEndpoint: 'secure.ring.end.point',
                bucketMatch: 'rings3bucketmatch',
                bucketName: 'rings3bucketname',
                credentials: {
                    accessKey: 'rings3accesskey',
                    secretKey: decryptedSecretKey,
                },
                https: true,
                pathStyle: true,
                region: 'us-west-1',
                serverSideEncryption: false,
                supportsVersioning: true,
            },
            legacyAwsBehavior: false,
            isTransient: false,
            sizeLimitGB: null,
            type: 'aws_s3',
            objectId: 'httpsawsbackendtest',
        },
    },
    {
        locationType: 'location-ceph-radosgw-s3-v1',
        locations: {
            objectId: 'cephbackendtest',
            details: {
                bucketMatch: 'cephbucketmatch',
                endpoint: 'https://secure.ceph.end.point',
                accessKey: 'cephs3accesskey',
                secretKey,
                bucketName: 'cephbucketname',
                region: 'us-west-1',
            },
        },
        expected: {
            details: {
                awsEndpoint: 'secure.ceph.end.point',
                bucketMatch: 'cephbucketmatch',
                bucketName: 'cephbucketname',
                credentials: {
                    accessKey: 'cephs3accesskey',
                    secretKey: decryptedSecretKey,
                },
                https: true,
                pathStyle: true,
                region: 'us-west-1',
                serverSideEncryption: false,
                supportsVersioning: true,
            },
            legacyAwsBehavior: false,
            isTransient: false,
            sizeLimitGB: null,
            type: 'aws_s3',
            objectId: 'cephbackendtest',
        },
    },
    {
        name: 'transient enabled',
        locationType: 'location-file-v1',
        locations: {
            objectId: 'transienttest',
            isTransient: true,
        },
        expected: {
            type: 'file',
            objectId: 'transienttest',
            legacyAwsBehavior: false,
            isTransient: true,
            sizeLimitGB: null,
            details: {
                supportsVersioning: true,
            },
        },
    },
    {
        name: 'limited size',
        locationType: 'location-file-v1',
        locations: {
            objectId: 'sizelimitedtest',
            sizeLimitGB: 1024,
        },
        expected: {
            type: 'file',
            objectId: 'sizelimitedtest',
            legacyAwsBehavior: false,
            isTransient: false,
            sizeLimitGB: 1024,
            details: {
                supportsVersioning: true,
            },
        },
    },
    {
        name: 'zero size limit',
        locationType: 'location-file-v1',
        locations: {
            objectId: 'sizezerotest',
            sizeLimitGB: 0,
        },
        expected: {
            type: 'file',
            objectId: 'sizezerotest',
            legacyAwsBehavior: false,
            isTransient: false,
            sizeLimitGB: null,
            details: {
                supportsVersioning: true,
            },
        },
    },
];

describe('patch location constriants', () => {
    const mockLog = {
        info: () => {},
    };

    tests.forEach(spec => {
        const testName = spec.name || `should patch ${spec.locationType}`;
        it(testName, () => {
            // copy specs to include extra attributes
            const locations = spec.locations;
            const expected = spec.expected;

            // add a name to the locations and expected without having to include it
            const locationName = spec.name || `name-${spec.locationType}`;
            locations.name = locationName;
            expected.name = locationName;

            // also add the location type
            locations.locationType = spec.locationType;
            expected.locationType = spec.locationType;

            assert.deepStrictEqual(
                patchLocations(
                    { [locationName]: locations },
                    { privateKey },
                    mockLog
                ),
                { [locationName]: expected }
            );
        });
    });


    it('undefined location', () => {
        assert.deepStrictEqual(
            patchLocations(
                undefined,
                { privateKey },
                mockLog
            ),
            {}
        );
    });

    it('bad location type', () => {
        assert.deepStrictEqual(
            patchLocations(
                {
                    name: {
                        locationType: 'bad-location',
                    },
                },
                { privateKey },
                mockLog
            ),
            {}
        );
    });
});
