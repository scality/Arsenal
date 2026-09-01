const assert = require('assert');
const werelogs = require('werelogs');
const sinon = require('sinon');
const logger = new werelogs.Logger('MongoClientInterface', 'debug', 'debug');
const MongoClientInterface = require('../../../../../lib/storage/metadata/mongoclient/MongoClientInterface');
const MongoReadStream = require('../../../../../lib/storage/metadata/mongoclient/readStream');
const utils = require('../../../../../lib/storage/metadata/mongoclient/utils');

const locations = {
    'us-east-1': { isCRR: false },
    'dr-source': { isCRR: true },
};

describe('MongoClientInterface::hideNonLocalizedVersions', () => {
    let client;

    beforeEach(done => {
        client = new MongoClientInterface({ locations });
        sinon.stub(utils, 'formatMasterKey').callsFake(() => 'example-master-key');
        sinon.stub(utils, 'formatVersionKey').callsFake(() => 'example-version-key');
        sinon.stub(client, 'getBucketVFormat').callsFake((bucketName, log, cb) => cb(null, 'v0'));
        return done();
    });

    afterEach(done => {
        sinon.restore();
        return done();
    });

    describe('getObject', () => {
        function captureFilter(cb) {
            const collection = {
                findOne: filter => {
                    cb(filter);
                    return Promise.resolve({ value: { key: 'example-object' } });
                },
            };
            sinon.stub(client, 'getCollection').callsFake(() => collection);
        }

        it('should exclude the non-localized locations when the flag is set', done => {
            captureFilter(filter => {
                assert.deepStrictEqual(filter['value.dataStoreName'], { $nin: ['dr-source'] });
            });
            client.getObject('example-bucket', 'example-object', { hideNonLocalizedVersions: true }, logger, done);
        });

        it('should not filter when the flag is not set', done => {
            captureFilter(filter => {
                assert.strictEqual(filter['value.dataStoreName'], undefined);
            });
            client.getObject('example-bucket', 'example-object', {}, logger, done);
        });

        it('should not filter when no location is flagged as non-localized', done => {
            client = new MongoClientInterface({ locations: { 'us-east-1': { isCRR: false } } });
            sinon.stub(client, 'getBucketVFormat').callsFake((bucketName, log, cb) => cb(null, 'v0'));
            captureFilter(filter => {
                assert.strictEqual(filter['value.dataStoreName'], undefined);
            });
            client.getObject('example-bucket', 'example-object', { hideNonLocalizedVersions: true }, logger, done);
        });

        it('should not filter when no location configuration is provided', done => {
            client = new MongoClientInterface({});
            sinon.stub(client, 'getBucketVFormat').callsFake((bucketName, log, cb) => cb(null, 'v0'));
            captureFilter(filter => {
                assert.strictEqual(filter['value.dataStoreName'], undefined);
            });
            client.getObject('example-bucket', 'example-object', { hideNonLocalizedVersions: true }, logger, done);
        });

        it('should filter the latest version lookup when the master is absent', done => {
            const collection = { findOne: () => Promise.resolve(null) };
            sinon.stub(client, 'getCollection').callsFake(() => collection);
            sinon.stub(client, 'getLatestVersion').callsFake((c, objName, vFormat, nonLocalizedFilter, log, cb) => {
                assert.deepStrictEqual(nonLocalizedFilter, { 'value.dataStoreName': { $nin: ['dr-source'] } });
                return cb(null, {});
            });
            client.getObject('example-bucket', 'example-object', { hideNonLocalizedVersions: true }, logger, done);
        });
    });

    describe('getObjects', () => {
        it('should exclude the non-localized locations when the flag is set', done => {
            const collection = {
                find: filter => {
                    assert.deepStrictEqual(filter['value.dataStoreName'], { $nin: ['dr-source'] });
                    return { toArray: () => Promise.resolve([]) };
                },
            };
            sinon.stub(client, 'getCollection').callsFake(() => collection);
            sinon.stub(client, 'getLatestVersion').callsFake((...args) => args[5](null, {}));
            const objects = [{ key: 'example-object', params: { hideNonLocalizedVersions: true } }];
            client.getObjects('example-bucket', objects, logger, done);
        });

        it('should not filter when the flag is not set', done => {
            const collection = {
                find: filter => {
                    assert.strictEqual(filter['value.dataStoreName'], undefined);
                    return { toArray: () => Promise.resolve([]) };
                },
            };
            sinon.stub(client, 'getCollection').callsFake(() => collection);
            sinon.stub(client, 'getLatestVersion').callsFake((...args) => args[5](null, {}));
            const objects = [{ key: 'example-object', params: {} }];
            client.getObjects('example-bucket', objects, logger, done);
        });
    });

    describe('listObject', () => {
        function captureListing(cb) {
            sinon.stub(client, 'internalListObject').callsFake((bucketName, internalParams) => cb(internalParams));
        }

        it('should hide the non-localized versions from a version listing', done => {
            captureListing(internalParams => {
                assert.strictEqual(internalParams.hideNonLocalizedVersions, true);
                return done();
            });
            client.listObject(
                'example-bucket',
                { listingType: 'DelimiterVersions', hideNonLocalizedVersions: true },
                logger,
                () => {},
            );
        });

        it('should not filter a master listing, the master always being localized', done => {
            captureListing(internalParams => {
                assert.strictEqual(internalParams.hideNonLocalizedVersions, false);
                return done();
            });
            client.listObject(
                'example-bucket',
                { listingType: 'DelimiterMaster', hideNonLocalizedVersions: true },
                logger,
                () => {},
            );
        });
    });
});

describe('MongoReadStream::hideNonLocalizedVersions', () => {
    const nonLocalizedFilter = { 'value.dataStoreName': { $nin: ['dr-source'] } };

    function buildQuery(searchOptions, filter) {
        let query;
        const collection = {
            find: q => {
                query = q;
                return { sort: () => ({ next: () => Promise.resolve(null) }) };
            },
        };
        new MongoReadStream(collection, { gte: 'a', lt: 'b' }, searchOptions, filter);
        return query;
    }

    it('should not change the query when no filter is given', () => {
        const query = buildQuery(null, null);
        assert.strictEqual(query.$and, undefined);
    });

    it('should add the filter as an $and element', () => {
        const query = buildQuery(null, nonLocalizedFilter);
        assert.deepStrictEqual(query.$and, [nonLocalizedFilter]);
    });

    it('should keep the filter when the search query targets the same field', () => {
        const searchOptions = { 'value.dataStoreName': { $eq: 'dr-source' } };
        const query = buildQuery(searchOptions, nonLocalizedFilter);
        assert.deepStrictEqual(query['value.dataStoreName'], { $eq: 'dr-source' });
        assert.deepStrictEqual(query.$and, [nonLocalizedFilter]);
    });

    it('should keep the $and elements of the search query', () => {
        const searchOptions = { $and: [{ 'value.key': { $eq: 'example-object' } }] };
        const query = buildQuery(searchOptions, nonLocalizedFilter);
        assert.deepStrictEqual(query.$and, [{ 'value.key': { $eq: 'example-object' } }, nonLocalizedFilter]);
    });
});
