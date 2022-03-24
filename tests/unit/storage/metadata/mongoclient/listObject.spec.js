const assert = require('assert');
const werelogs = require('werelogs');
const logger = new werelogs.Logger('MongoClientInterface', 'debug', 'debug');
const errors = require('../../../../../lib/errors').default;
const sinon = require('sinon');
const MongoClientInterface =
    require('../../../../../lib/storage/metadata/mongoclient/MongoClientInterface');

describe('MongoClientInterface:listObject', () => {
    let client;

    beforeAll(done => {
        client = new MongoClientInterface({});
        return done();
    });

    afterEach(done => {
        sinon.restore();
        return done();
    });

    it('should fail when getBucketVFormat fails', done => {
        sinon.stub(client, 'getCollection').callsFake(() => null);
        sinon.stub(client, 'getBucketVFormat').callsFake((bucketName, log, cb) => cb(errors.InternalError));
        client.listObject('example-bucket', { listingType: 'DelimiterMaster' }, logger, err => {
            expect(err.is.InternalError).toBeTruthy();
            return done();
        });
    });

    it('should fail when internalListObject fails', done => {
        sinon.stub(client, 'getCollection').callsFake(() => null);
        sinon.stub(client, 'getBucketVFormat').callsFake((bucketName, log, cb) => cb(null, 'v0'));
        sinon.stub(client, 'internalListObject').callsFake((...args) => args[5](errors.InternalError));
        client.listObject('example-bucket', { listingType: 'DelimiterMaster' }, logger, err => {
            expect(err.is.InternalError).toBeTruthy();
            return done();
        });
    });
});
