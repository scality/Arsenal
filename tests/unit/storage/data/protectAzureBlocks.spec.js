const assert = require('assert');

const MultipleBackendGateway = require('../../../../lib/storage/data/MultipleBackendGateway');
const DummyRequestLogger = require('../../helpers').DummyRequestLogger;

const bucketName = 'dummybucket';
const objectKey = 'dummykey';
const log = new DummyRequestLogger();

describe('MultipleBackendGateway::protectAzureBlocks', () => {
    it('should not throw when the location has no configured client', done => {
        const gateway = new MultipleBackendGateway({}, null, null);
        gateway.protectAzureBlocks(bucketName, objectKey, 'deleted-location', log, err => {
            assert.ifError(err);
            done();
        });
    });

    it('should skip clients that do not implement protectAzureBlocks', done => {
        const gateway = new MultipleBackendGateway({ somewhere: {} }, null, null);
        gateway.protectAzureBlocks(bucketName, objectKey, 'somewhere', log, err => {
            assert.ifError(err);
            done();
        });
    });

    it('should delegate to the client when it implements protectAzureBlocks', done => {
        let called = null;
        const clients = {
            azurelocation: {
                protectAzureBlocks: (metadata, bucket, key, location, logger, cb) => {
                    called = { bucket, key, location };
                    return cb();
                },
            },
        };
        const gateway = new MultipleBackendGateway(clients, null, null);
        gateway.protectAzureBlocks(bucketName, objectKey, 'azurelocation', log, err => {
            assert.ifError(err);
            assert.deepStrictEqual(called, {
                bucket: bucketName,
                key: objectKey,
                location: 'azurelocation',
            });
            done();
        });
    });
});
