const assert = require('assert');
const crypto = require('crypto');

const BackendInfo = require('../../../../lib/models/BackendInfo').default;
const DataWrapper = require('../../../../lib/storage/data/DataWrapper');
const DummyRequestLogger = require('../../helpers').DummyRequestLogger;
const MetadataWrapper = require('../../../../lib/storage/metadata/MetadataWrapper');
const MultipleBackendGateway = require('../../../../lib/storage/data/MultipleBackendGateway');
const errors = require('../../../../lib/errors').default;

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

class MockFailingSproxydClient extends MockSproxydClient {
    delete(key, reqUids, callback) {
        const error = new Error();
        error.code = 404;
        error.isExpected = true;
        return callback(error);
    }
}

function genFailingClients(sproxydLocation) {
    const clients = {};
    clients[sproxydLocation] = new MockFailingSproxydClient();
    clients[sproxydLocation].clientType = 'scality';
    return clients;
}

function dummyStorageCheckFn(location, size, log, cb) {
    return cb();
}

function getDataWrapper(clients) {
    const mbg = new MultipleBackendGateway(clients, new MetadataWrapper(clientName, {}));
    const implName = 'multipleBackends';
    const config = null;
    const kms = null;
    const metadata = null;
    const fn = dummyStorageCheckFn;
    const vault = null;
    return new DataWrapper(mbg, implName, config, kms, metadata, fn, vault);
}

let clients;
let failingClients;
let dw;
let fdw;

describe('Routes from DataWrapper to backend client', () => {
    beforeAll(() => {
        clients = genExternalClients(sproxydLocation, azureLocation);
        dw = getDataWrapper(clients);

        failingClients = genFailingClients(sproxydLocation);
        fdw = getDataWrapper(failingClients);
    });

    afterEach(() => {
        jest.restoreAllMocks();
    });

    it('should follow object put path successfully for sproxyd backend', () => {
        const putSpy = jest.spyOn(clients[sproxydLocation], 'put');
        const backendInfo = new BackendInfo(null, null, sproxydLocation);
        dw.put(cipherBundle, value, size, keyContext, backendInfo, log, (err, data) => {
            assert.ifError(err);
            assert(typeof data, 'object');
        });
        expect(putSpy).toHaveBeenCalled();
    });

    it('should follow object get path successfully for sproxyd backend', () => {
        const getSpy = jest.spyOn(clients[sproxydLocation], 'get');
        const objectGetInfo = genObjGetInfo('sproxyd');
        dw.get(objectGetInfo, null, log, err => {
            assert.ifError(err);
        });
        expect(getSpy).toHaveBeenCalled();
    });

    it('should follow object delete path successfully for sproxyd backend', () => {
        const deleteSpy = jest.spyOn(clients[sproxydLocation], 'delete');
        const objectGetInfo = genObjGetInfo('sproxyd');
        dw.delete(objectGetInfo, log, err => {
            assert.ifError(err);
        });
        expect(deleteSpy).toHaveBeenCalled();
    });

    it('should handle failing sproxyd request', () => {
        const deleteSpy = jest.spyOn(failingClients[sproxydLocation], 'delete');
        const objectGetInfo = genObjGetInfo('sproxyd');
        fdw.delete(objectGetInfo, log, err => {
            assert.deepStrictEqual(err, errors.ObjNotFound);
        });
        expect(deleteSpy).toHaveBeenCalled();
    });

    // ARSN-607: the head-check only verifies external cloud backend data
    // state. sproxydclient's head() expects a 40-char string key, but the
    // gateway holds the objectGetInfo object; it must skip scality backends
    // rather than pass them the object (which crashed object GET).
    it('should not send a head request to a sproxyd (scality) backend', done => {
        const headSpy = jest.spyOn(clients[sproxydLocation], 'head');
        const objectGetInfo = genObjGetInfo('sproxyd');
        dw.head([objectGetInfo], log, err => {
            assert.ifError(err);
            expect(headSpy).not.toHaveBeenCalled();
            done();
        });
    });

    it('should follow object put path successfully for Azure backend', () => {
        const putSpy = jest.spyOn(clients[azureLocation], 'put');
        const backendInfo = new BackendInfo(null, null, azureLocation);
        dw.put(cipherBundle, value, size, keyContext, backendInfo, log, (err, data) => {
            assert.ifError(err);
            assert(typeof data, 'object');
        });
        expect(putSpy).toHaveBeenCalled();
    });

    it('should follow object get path successfully for Azure backend', () => {
        const getSpy = jest.spyOn(clients[azureLocation], 'get');
        const objectGetInfo = genObjGetInfo('azure', objectKey);
        dw.get(objectGetInfo, null, log, err => {
            assert.ifError(err);
        });
        expect(getSpy).toHaveBeenCalled();
    });

    it('should follow object delete path successfully for Azure backend', () => {
        const deleteSpy = jest.spyOn(clients[azureLocation], 'delete');
        const objectGetInfo = genObjGetInfo('azure', objectKey);
        dw.delete(objectGetInfo, log, err => {
            assert.ifError(err);
        });
        expect(deleteSpy).toHaveBeenCalled();
    });

    it('should send a head request to an external (Azure) backend', done => {
        const headSpy = jest.spyOn(clients[azureLocation], 'head');
        const objectGetInfo = genObjGetInfo('azure', objectKey);
        dw.head([objectGetInfo], log, err => {
            assert.ifError(err);
            expect(headSpy).toHaveBeenCalled();
            done();
        });
    });
});
