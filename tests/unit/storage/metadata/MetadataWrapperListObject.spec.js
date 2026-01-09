const assert = require('assert');
const sinon = require('sinon');
const werelogs = require('werelogs');

const MetadataWrapper = require('../../../../lib/storage/metadata/MetadataWrapper');

const logger = new werelogs.Logger('MetadataWrapperTest', 'debug', 'debug');

describe('MetadataWrapper listObject parsing', () => {
    let sandbox;
    let mockClient;
    let metadataWrapper;

    const bucketName = 'test-bucket';
    
    beforeEach(() => {
        sandbox = sinon.createSandbox();
        mockClient = {
            listObject: sandbox.stub(),
        };
        metadataWrapper = new MetadataWrapper('mem', {}, null, logger);
        metadataWrapper.client = mockClient;
    });

    afterEach(() => {
        sandbox.restore();
    });

    it('should parse user metadata', done => {
        const rawEntries = [
            {
                key: 'obj1',
                value: JSON.stringify({
                    'x-amz-meta-foo': 'bar',
                    'x-amz-meta-baz': 'qux',
                    'content-length': 100,
                }),
            },
        ];

        mockClient.listObject.callsFake((_bucket, _params, _log, cb) => {
            cb(null, {
                IsTruncated: false,
                Contents: rawEntries,
            });
        });

        metadataWrapper.listObject(bucketName, {}, logger, (err, data) => {
            assert.ifError(err);
            assert.strictEqual(data.Contents.length, 1);
            const entry = data.Contents[0].value;
            assert.strictEqual(entry['x-amz-meta-foo'], 'bar');
            assert.strictEqual(entry['x-amz-meta-baz'], 'qux');
            assert.strictEqual(entry.Size, 100);
            done();
        });
    });

    it('should parse restore status: in progress', done => {
        const rawEntries = [
            {
                key: 'obj1',
                value: JSON.stringify({
                    archive: {
                        restoreRequestedAt: new Date(),
                    },
                }),
            },
        ];

        mockClient.listObject.callsFake((_bucket, _params, _log, cb) => {
            cb(null, {
                IsTruncated: false,
                Contents: rawEntries,
            });
        });

        metadataWrapper.listObject(bucketName, {}, logger, (err, data) => {
            assert.ifError(err);
            const entry = data.Contents[0].value;
            assert.deepStrictEqual(entry.restoreStatus, {
                inProgress: true,
                expiryDate: undefined,
            });
            done();
        });
    });

    it('should parse restore status: completed', done => {
        const expiryDate = new Date();
        const rawEntries = [
            {
                key: 'obj1',
                value: JSON.stringify({
                    archive: {
                        restoreRequestedAt: new Date(),
                        restoreCompletedAt: new Date(),
                        restoreWillExpireAt: expiryDate.toJSON(),
                    },
                }),
            },
        ];

        mockClient.listObject.callsFake((_bucket, _params, _log, cb) => {
            cb(null, {
                IsTruncated: false,
                Contents: rawEntries,
            });
        });

        metadataWrapper.listObject(bucketName, {}, logger, (err, data) => {
            assert.ifError(err);
            const entry = data.Contents[0].value;
            assert.strictEqual(entry.restoreStatus.inProgress, false);
            assert.strictEqual(entry.restoreStatus.expiryDate, expiryDate.toJSON());
            done();
        });
    });

    it('should ignore restore status: no archive info', done => {
        const rawEntries = [
            {
                key: 'obj1',
                value: JSON.stringify({}),
            },
        ];

        mockClient.listObject.callsFake((_bucket, _params, _log, cb) => {
            cb(null, {
                IsTruncated: false,
                Contents: rawEntries,
            });
        });

        metadataWrapper.listObject(bucketName, {}, logger, (err, data) => {
            assert.ifError(err);
            const entry = data.Contents[0].value;
            assert.deepStrictEqual(entry.restoreStatus, undefined);
            done();
        });
    });
    
    it('should parse restore status for versions listing', done => {
        const rawEntries = [
            {
                key: 'obj1',
                value: JSON.stringify({
                    archive: {
                        restoreRequestedAt: new Date(),
                    },
                    versionId: 'v1',
                }),
            },
        ];

        mockClient.listObject.callsFake((_bucket, _params, _log, cb) => {
            cb(null, {
                IsTruncated: false,
                Versions: rawEntries,
            });
        });

        metadataWrapper.listObject(bucketName, { listingType: 'DelimiterVersions' }, logger, (err, data) => {
            assert.ifError(err);
            const entry = data.Versions[0].value;
            assert.deepStrictEqual(entry.restoreStatus, {
                inProgress: true,
                expiryDate: undefined,
            });
            done();
        });
    });
});
