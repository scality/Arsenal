const assert = require('assert');
const async = require('async');
const sinon = require('sinon');

const errors = require('../../../../../lib/errors').default;
const BucketFileInterface = require('../../../../../lib/storage/metadata/file/BucketFileInterface');
const DummyRequestLogger = require('../../../helpers').DummyRequestLogger;

const log = new DummyRequestLogger();

describe('BucketFileInterface conditional put', () => {
    let bfi;

    function withPutError(putErr) {
        const db = {
            withRequestLogger: () => db,
            put: (key, value, params, cb) => cb(putErr),
        };
        sinon.stub(bfi, 'loadDBIfExists').callsFake((bucketName, log, cb) => cb(null, db));
    }

    beforeEach(() => {
        bfi = new BucketFileInterface({ metadataClient: { host: 'localhost', port: 9990 }, constants: {} }, log);
    });

    afterEach(() => sinon.restore());

    it('should advertise supportsConditionalPut', () => {
        assert.strictEqual(bfi.supportsConditionalPut, true);
    });

    it('putObject should return PreconditionFailed, NoSuchKey and ConditionalRequestConflict unchanged', done => {
        async.eachSeries(
            ['PreconditionFailed', 'NoSuchKey', 'ConditionalRequestConflict', 'NotImplemented'],
            (name, next) => {
                sinon.restore();
                withPutError(errors[name]);
                bfi.putObject('bucket', 'key', {}, { ifNoneMatch: '*' }, log, err => {
                    assert(err && err.is[name], `expected ${name}`);
                    next();
                });
            },
            done,
        );
    });

    it('putObject should still map any other error to InternalError', done => {
        withPutError(errors.ObjNotFound);
        bfi.putObject('bucket', 'key', {}, {}, log, err => {
            assert(err && err.is.InternalError);
            done();
        });
    });
});
