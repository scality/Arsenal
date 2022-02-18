const assert = require('assert');
const crypto = require('crypto');

const BackendInfo = require('../../../../lib/models/BackendInfo');
const DataWrapper = require('../../../../lib/storage/data/DataWrapper');
const DummyRequestLogger = require('../../helpers').DummyRequestLogger;
const MetadataWrapper =
    require('../../../../lib/storage/metadata/MetadataWrapper');
const MultipleBackendGateway =
    require('../../../../lib/storage/data/MultipleBackendGateway');

const clientName = 'mem';
const sproxydLocation = 'sproxydlocation';
const azureLocation = 'azurelocation';
const bucketName = 'dummybucket';
const objectKey = 'dummykey';
const cipherBundle = null;
const value = null;
const size = 0;
const keyContext = { bucketName, objectKey };
const log = new DummyRequestLogger();

const MockAzureClient = require('./mockClients/MockAzureClient');
const MockSproxydClient = require('./mockClients/MockSproxydClient');

function genSproxydKey() {
    return crypto.randomBytes(20).toString('hex');
}

function genExternalClients(sproxydLocation, azureLocation) {
    const clients = {};
    clients[sproxydLocation] = new MockSproxydClient();
    clients[sproxydLocation].clientType = 'scality';
    clients[azureLocation] = new MockAzureClient();
    clients[azureLocation].clientType = 'azure';
    return clients;
}

function genObjGetInfo(backend, key) {
    return {
        key: key || genSproxydKey(),
        bucketName,
        dataStoreName: `${backend}location`,
    };
}

function dummyStorageCheckFn(location, size, log, cb) {
    return cb();
}

function getDataWrapper() {
    const mbg = new MultipleBackendGateway(
        genExternalClients(sproxydLocation, azureLocation),
        new MetadataWrapper(clientName, {}));
    const implName = 'multipleBackends';
    const config = null;
    const kms = null;
    const metadata = null;
    const fn = dummyStorageCheckFn;
    const vault = null;
    return new DataWrapper(mbg, implName, config, kms, metadata, fn, vault);
}

let dw;

describe('Routes from DataWrapper to backend client', () => {
    beforeAll(() => {
        dw = getDataWrapper();
    });

    it('should follow object put path successfully for sproxyd backend', () => {
        const backendInfo = new BackendInfo(null, null, sproxydLocation);
        dw.put(cipherBundle, value, size, keyContext, backendInfo, log,
            (err, data) => {
                assert.ifError(err);
                assert(typeof data, 'object');
            });
    });

    it('should follow object get path successfully for sproxyd backend', () => {
        const objectGetInfo = genObjGetInfo('sproxyd');
        const response = null;
        dw.get(objectGetInfo, response, log, err => {
            assert.ifError(err);
        });
    });

    it('should follow object delete path successfully for sproxyd backend',
        () => {
            const objectGetInfo = genObjGetInfo('sproxyd');
            dw.delete(objectGetInfo, log, err => {
                assert.ifError(err);
            });
        });

    it('should follow object put path successfully for Azure backend', () => {
        const backendInfo = new BackendInfo(null, null, azureLocation);
        dw.put(cipherBundle, value, size, keyContext, backendInfo, log,
            (err, data) => {
                assert.ifError(err);
                assert(typeof data, 'object');
            });
    });

    it('should follow object get path successfully for Azure backend', () => {
        const objectGetInfo = genObjGetInfo('azure', objectKey);
        const response = null;
        dw.get(objectGetInfo, response, log, err => {
            assert.ifError(err);
        });
    });

    it('should follow object delete path successfully for Azure backend',
        () => {
            const objectGetInfo = genObjGetInfo('azure', objectKey);
            dw.delete(objectGetInfo, log, err => {
                assert.ifError(err);
            });
        });
});
