const { EventEmitter } = require('events');

class DummyConfig extends EventEmitter {
    constructor(isLegacy) {
        super();

        this._isLegacy = isLegacy;
        this._createConfig();
    }

    _createLocationConfig() {
        this.locationConstraints = {
            'us-east-1': {
                type: 'file',
                objectId: 'us-east-1',
                legacyAwsBehavior: true,
                details: {
                    https: true,
                    pathStyle: false,
                    supportsVersioning: true,
                },
            },
            'scality-internal-file': {
                type: 'file',
                objectId: 'scality-internal-file',
                legacyAwsBehavior: false,
                details: {
                    https: true,
                    pathStyle: false,
                    supportsVersioning: true,
                },
            },
            'scality-internal-mem': {
                type: 'mem',
                objectId: 'scality-internal-mem',
                legacyAwsBehavior: false,
                details: {
                    https: true,
                    pathStyle: false,
                    supportsVersioning: true,
                },
            },
            'awsbackend': {
                type: 'aws_s3',
                objectId: 'awsbackend',
                legacyAwsBehavior: true,
                details: {
                    awsEndpoint: 's3.amazonaws.com',
                    bucketName: 'multitester555',
                    bucketMatch: true,
                    credentialsProfile: 'default',
                    https: true,
                    pathStyle: false,
                    supportsVersioning: true,
                },
            },
            'awsbackendhttp': {
                type: 'aws_s3',
                objectId: 'awsbackendhttp',
                legacyAwsBehavior: true,
                details: {
                    awsEndpoint: 's3.amazonaws.com',
                    bucketName: 'multitester555',
                    bucketMatch: true,
                    credentialsProfile: 'default',
                    https: false,
                    pathStyle: false,
                    supportsVersioning: true,
                },
            },
            'azurebackend': {
                type: 'azure',
                objectId: 'azurebackend',
                legacyAwsBehavior: true,
                details: {
                    azureStorageEndpoint:
                        'https://fakeaccountname.blob.core.fake.net/',
                    azureStorageAccountName: 'fakeaccountname',
                    azureStorageAccessKey: 'Fake00Key001',
                    bucketMatch: true,
                    azureContainerName: 's3test',
                    https: true,
                    pathStyle: false,
                    supportsVersioning: true,
                },
            },
            'gcpbackend': {
                type: 'gcp',
                objectId: 'gcpbackend',
                legacyAwsBehavior: true,
                details: {
                    gcpEndpoint: 'storage.googleapis.com',
                    bucketName: 'zenko-gcp-bucket',
                    mpuBucketName: 'zenko-gcp-mpu',
                    bucketMatch: true,
                    credentialsProfile: 'google',
                    https: true,
                    pathStyle: false,
                    supportsVersioning: true,
                },
            },
            'pfsbackend': {
                type: 'pfs',
                objectId: 'pfsbackend',
                legacyAwsBehavior: true,
                details: {
                    bucketMatch: true,
                    pfsDaemonEndpoint: { host: 'localhost', port: 8006 },
                    https: true,
                    pathStyle: false,
                    supportsVersioning: true,
                },
            },
        };
        if (this._isLegacy) {
            this.locationConstraints.legacy = {
                type: 'mem',
                objectId: 'legacy',
                legacyAwsBehavior: false,
                details: {},
            };
        }
    }

    _createConfig() {
        this._createLocationConfig();

        this.port = 8004;
        this.listenOn = [];
        this.replicationEndpoints = [];
        this.restEndpoints = {
            'localhost': 'us-east-1',
            '127.0.0.1': 'us-east-1',
            's3.amazonaws.com': 'us-east-1',
        };
        this.websiteEndpoints = [];
        this.clusters = false;
        this.cdmi = {};
        this.bucketd = { bootstrap: [] };
        this.vaultd = {};
        this.dataClient = { host: '127.0.0.1', port: 8005 };
        this.recordLog = { enabled: false };
        this.mongodb = {};
        this.redis = {};
        this.log = { logLevel: 'debug', dumpLevel: 'error' };
        this.kms = {};
        this.healthchecks = { allowFrom: ['127.0.0.1/8', '::1'] };
        this.outboundProxy = {};
        this.managementAgent = { host: 'localhost', port: 8010 };
        this.externalBackends = {
            // eslint-disable-next-line camelcase
            aws_s3: {
                httpAgent: {
                    keepAlive: false,
                    keepAliveMsecs: 1000,
                    maxFreeSockets: 256,
                    maxSockets: null,
                },
            },
            gcp: {
                httpAgent: {
                    keepAlive: true,
                    keepAliveMsecs: 1000,
                    maxFreeSockets: 256,
                    maxSockets: null,
                },
            },
        };
        this.backends = { data: 'mem' };
    }

    getAzureEndpoint(locationConstraint) {
        let azureStorageEndpoint =
            process.env[`${locationConstraint}_AZURE_STORAGE_ENDPOINT`] ||
            this.locationConstraints[locationConstraint]
            .details.azureStorageEndpoint;
        if (!azureStorageEndpoint.endsWith('/')) {
            // append the trailing slash
            azureStorageEndpoint = `${azureStorageEndpoint}/`;
        }
        return azureStorageEndpoint;
    }

    getAzureStorageAccountName(locationConstraint) {
        const { azureStorageAccountName } =
            this.locationConstraints[locationConstraint].details;
        const storageAccountNameFromEnv =
            process.env[`${locationConstraint}_AZURE_STORAGE_ACCOUNT_NAME`];
        return storageAccountNameFromEnv || azureStorageAccountName;
    }

    getAzureStorageCredentials(locationConstraint) {
        const { azureStorageAccessKey } =
            this.locationConstraints[locationConstraint].details;
        const storageAccessKeyFromEnv =
            process.env[`${locationConstraint}_AZURE_STORAGE_ACCESS_KEY`];
        return {
            storageAccountName:
                this.getAzureStorageAccountName(locationConstraint),
            storageAccessKey: storageAccessKeyFromEnv || azureStorageAccessKey,
        };
    }

    getPfsDaemonEndpoint(locationConstraint) {
        return process.env[`${locationConstraint}_PFSD_ENDPOINT`] ||
        this.locationConstraints[locationConstraint].details.pfsDaemonEndpoint;
    }
}

module.exports = DummyConfig;
