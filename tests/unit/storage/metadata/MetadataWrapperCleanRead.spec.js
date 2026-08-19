const assert = require('assert');
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

describe('MetadataWrapper::cleanRead', () => {
    const bucketName = 'test-bucket';
    const objName = 'test-object';
    let client;

    function buildWrapper(cleanRead) {
        const wrapper = new MetadataWrapper('mongodb', Object.assign({ cleanRead }, mongoOpts), null, logger);
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

    it('should refuse to enable clean read on a backend not implementing it', () => {
        assert.throws(() => new MetadataWrapper('mem', { cleanRead: true }, null, logger),
            /clean read is not supported by the memorybucket backend/);
    });

    it('should set the flag on the read and listing calls', done => {
        const metadata = buildWrapper(true);
        metadata.getObjectMD(bucketName, objName, {}, logger, () => {
            assert.strictEqual(client.getObject.firstCall.args[2].cleanRead, true);

            metadata.getObjectsMD(bucketName, [{ key: objName, params: {} }], logger, () => {
                assert.strictEqual(client.getObjects.firstCall.args[1][0].params.cleanRead, true);

                metadata.getBucketAndObjectMD(bucketName, objName, {}, logger, () => {
                    assert.strictEqual(client.getBucketAndObject.firstCall.args[2].cleanRead, true);

                    metadata.listObject(bucketName, {}, logger, () => {
                        assert.strictEqual(client.listObject.firstCall.args[1].cleanRead, true);

                        metadata.listMultipartUploads(bucketName, {}, logger, () => {
                            assert.strictEqual(client.listMultipartUploads.firstCall.args[1].cleanRead, true);
                            return done();
                        });
                    });
                });
            });
        });
    });

    it('should not set the flag on the internal and write calls', done => {
        const metadata = buildWrapper(true);
        metadata.listLifecycleObject(bucketName, {}, logger, () => {
            assert.strictEqual(client.listLifecycleObject.firstCall.args[1].cleanRead, undefined);

            metadata.putObjectMD(bucketName, objName, {}, {}, logger, () => {
                assert.strictEqual(client.putObject.firstCall.args[3].cleanRead, undefined);

                metadata.deleteObjectMD(bucketName, objName, {}, logger, () => {
                    assert.strictEqual(client.deleteObject.firstCall.args[2].cleanRead, undefined);
                    return done();
                });
            });
        });
    });

    it('should not set the flag when clean read is disabled', done => {
        const metadata = buildWrapper(false);
        const params = {};
        metadata.getObjectMD(bucketName, objName, params, logger, () => {
            assert.strictEqual(client.getObject.firstCall.args[2], params);

            metadata.listObject(bucketName, params, logger, () => {
                assert.strictEqual(client.listObject.firstCall.args[1], params);
                return done();
            });
        });
    });
});
