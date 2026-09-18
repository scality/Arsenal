const assert = require('assert');
const { promisify } = require('util');
const sinon = require('sinon');
const werelogs = require('werelogs');

const MetadataWrapper = require('../../../../lib/storage/metadata/MetadataWrapper');

const logger = new werelogs.Logger('MetadataWrapper', 'debug', 'debug');

const mongoOpts = {
    mongodb: {
        replicaSetHosts: 'localhost:27019',
        writeConcern: 'majority',
        replicaSet: 'rs0',
        readPreference: 'primary',
        database: 'metadata',
    },
};

describe('MetadataWrapper::hideNonLocalizedVersions', () => {
    const bucketName = 'test-bucket';
    const objName = 'test-object';
    let client;

    function buildWrapper(hideNonLocalizedVersions) {
        const wrapper = new MetadataWrapper(
            'mongodb',
            Object.assign({ hideNonLocalizedVersions }, mongoOpts),
            null,
            logger,
        );
        client = {
            getObject: sinon.stub().callsFake((bucket, key, params, log, cb) => cb(null, {})),
            getObjects: sinon.stub().callsFake((bucket, objects, log, cb) => cb(null, [])),
            getBucketAndObject: sinon.stub().callsFake((bucket, key, params, log, cb) => cb(null, {})),
            listObject: sinon.stub().callsFake((bucket, params, log, cb) => cb(null, { Contents: [] })),
            listLifecycleObject: sinon.stub().callsFake((bucket, params, log, cb) => cb(null, { Contents: [] })),
            listMultipartUploads: sinon.stub().callsFake((bucket, params, log, cb) => cb(null, { Uploads: [] })),
            putObject: sinon.stub().callsFake((bucket, key, objVal, params, log, cb) => cb(null)),
            deleteObject: sinon.stub().callsFake((bucket, key, params, log, cb) => cb(null)),
        };
        wrapper.client = client;
        return wrapper;
    }

    afterEach(() => {
        sinon.restore();
    });

    // the wrapper methods all take the logger as their last argument before
    // the callback
    function call(metadata, method, ...args) {
        return promisify(metadata[method].bind(metadata))(...args, logger);
    }

    it('should let the call override the deployment flag', async () => {
        const metadata = buildWrapper(true);
        await call(metadata, 'getObjectMD', bucketName, objName, { hideNonLocalizedVersions: false });
        assert.strictEqual(client.getObject.firstCall.args[2].hideNonLocalizedVersions, false);
    });

    it('should ignore the flag on a backend not implementing it', () => {
        const error = sinon.stub(logger, 'error');
        const metadata = new MetadataWrapper('mem', { hideNonLocalizedVersions: true }, null, logger);
        assert.strictEqual(metadata._hideNonLocalizedVersions, false);
        assert.strictEqual(error.calledOnce, true);
    });

    it('should set the flag on the read and listing calls', async () => {
        const metadata = buildWrapper(true);

        await call(metadata, 'getObjectMD', bucketName, objName, {});
        assert.strictEqual(client.getObject.firstCall.args[2].hideNonLocalizedVersions, true);

        await call(metadata, 'getObjectsMD', bucketName, [{ key: objName, params: {} }]);
        assert.strictEqual(client.getObjects.firstCall.args[1][0].params.hideNonLocalizedVersions, true);

        await call(metadata, 'getBucketAndObjectMD', bucketName, objName, {});
        assert.strictEqual(client.getBucketAndObject.firstCall.args[2].hideNonLocalizedVersions, true);

        await call(metadata, 'listObject', bucketName, {});
        assert.strictEqual(client.listObject.firstCall.args[1].hideNonLocalizedVersions, true);

        await call(metadata, 'listMultipartUploads', bucketName, {});
        assert.strictEqual(client.listMultipartUploads.firstCall.args[1].hideNonLocalizedVersions, true);
    });

    it('should not set the flag on the internal and write calls', async () => {
        const metadata = buildWrapper(true);

        await call(metadata, 'listLifecycleObject', bucketName, {});
        assert.strictEqual(client.listLifecycleObject.firstCall.args[1].hideNonLocalizedVersions, undefined);

        await call(metadata, 'putObjectMD', bucketName, objName, {}, {});
        assert.strictEqual(client.putObject.firstCall.args[3].hideNonLocalizedVersions, undefined);

        await call(metadata, 'deleteObjectMD', bucketName, objName, {});
        assert.strictEqual(client.deleteObject.firstCall.args[2].hideNonLocalizedVersions, undefined);
    });

    it('should not set the flag when the flag is disabled', async () => {
        const metadata = buildWrapper(false);
        const params = {};

        await call(metadata, 'getObjectMD', bucketName, objName, params);
        assert.strictEqual(client.getObject.firstCall.args[2], params);

        await call(metadata, 'listObject', bucketName, params);
        assert.strictEqual(client.listObject.firstCall.args[1], params);
    });
});
