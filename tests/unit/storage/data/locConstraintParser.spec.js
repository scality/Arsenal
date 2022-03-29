const assert = require('assert');
const parseLC =
    require('../../../../lib/storage/data/LocationConstraintParser');
const AwsClient = require('../../../../lib/storage/data/external/AwsClient');
const AzureClient =
    require('../../../../lib/storage/data/external/AzureClient');
const GcpClient = require('../../../../lib/storage/data/external/GcpClient');
const PfsClient = require('../../../../lib/storage/data/external/PfsClient');
const DataFileInterface =
    require('../../../../lib/storage/data/file/DataFileInterface');
const inMemory =
    require('../../../../lib/storage/data/in_memory/datastore').backend;
const DummyConfig = require('../../../utils/DummyConfig');

const memLocation = 'scality-internal-mem';
const fileLocation = 'scality-internal-file';
const awsLocation = 'awsbackend';
const awsHttpLocation = 'awsbackendhttp';
const azureLocation = 'azurebackend';
const gcpLocation = 'gcpbackend';
const pfsLocation = 'pfsbackend';
const dummyConfig = new DummyConfig();

const clients = parseLC(dummyConfig);

describe('locationConstraintParser', () => {
    it('should return object containing mem object', () => {
        assert.notStrictEqual(clients[memLocation], undefined);
        assert.strictEqual(typeof clients[memLocation], 'object');
        assert.deepEqual(clients[memLocation], inMemory);
    });
    it('should return object containing file object', () => {
        assert.notStrictEqual(clients[fileLocation], undefined);
        assert(clients[fileLocation] instanceof DataFileInterface);
    });

    it('should set correct options for https(default) aws_s3 type loc', () => {
        const client = clients[awsLocation];
        assert.notStrictEqual(client, undefined);
        assert(client instanceof AwsClient);
        assert.strictEqual(client._s3Params.sslEnabled, true);
        assert.strictEqual(client._s3Params.httpOptions.agent.protocol,
            'https:');
        assert.strictEqual(client._s3Params.httpOptions.agent.keepAlive, false);
        assert.strictEqual(client._s3Params.signatureVersion, 'v4');
    });

    it('should set correct options for http aws_s3 type location', () => {
        const client = clients[awsHttpLocation];
        assert.notStrictEqual(client, undefined);
        assert(client instanceof AwsClient);
        assert.strictEqual(client._s3Params.sslEnabled, false);
        assert.strictEqual(client._s3Params.httpOptions.agent.protocol,
            'http:');
        assert.strictEqual(client._s3Params.httpOptions.agent.keepAlive, false);
        assert.strictEqual(client._s3Params.signatureVersion, 'v2');
    });

    it('should set correct client for azure type location', () => {
        const client = clients[azureLocation];
        assert.notStrictEqual(client, undefined);
        assert(client instanceof AzureClient);
    });

    it('should set correct client for gcp type location', () => {
        const client = clients[gcpLocation];
        assert.notStrictEqual(client, undefined);
        assert(client instanceof GcpClient);
    });

    it('should set correct client for pfs type location', () => {
        const client = clients[pfsLocation];
        assert.notStrictEqual(client, undefined);
        assert(client instanceof PfsClient);
    });
});
