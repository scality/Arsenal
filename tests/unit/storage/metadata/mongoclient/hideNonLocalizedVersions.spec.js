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

const nonLocalizedFilter = { 'value.dataStoreName': { $nin: ['dr-source'] } };

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
        function getObject(params, checkFilter) {
            const findOne = sinon.spy(filter => {
                checkFilter(filter);
                return Promise.resolve({ value: { key: 'example-object' } });
            });
            sinon.stub(client, 'getCollection').callsFake(() => ({ findOne }));
            return new Promise((resolve, reject) =>
                client.getObject('example-bucket', 'example-object', params, logger, err => {
                    try {
                        assert.ifError(err);
                        assert.strictEqual(findOne.callCount, 1);
                        return resolve();
                    } catch (error) {
                        return reject(error);
                    }
                }),
            );
        }

        it('should exclude the non-localized locations when the flag is set', async () => {
            await getObject({ hideNonLocalizedVersions: true }, filter => {
                assert.deepStrictEqual(filter['value.dataStoreName'], { $nin: ['dr-source'] });
            });
        });

        it('should not filter when the flag is not set', async () => {
            await getObject({}, filter => {
                assert.strictEqual(filter['value.dataStoreName'], undefined);
            });
        });

        it('should not filter when no location is flagged as non-localized', async () => {
            client = new MongoClientInterface({ locations: { 'us-east-1': { isCRR: false } } });
            sinon.stub(client, 'getBucketVFormat').callsFake((bucketName, log, cb) => cb(null, 'v0'));
            await getObject({ hideNonLocalizedVersions: true }, filter => {
                assert.strictEqual(filter['value.dataStoreName'], undefined);
            });
        });

        it('should not filter when no location configuration is provided', async () => {
            client = new MongoClientInterface({});
            sinon.stub(client, 'getBucketVFormat').callsFake((bucketName, log, cb) => cb(null, 'v0'));
            await getObject({ hideNonLocalizedVersions: true }, filter => {
                assert.strictEqual(filter['value.dataStoreName'], undefined);
            });
        });
    });

    describe('getObjects', () => {
        function getObjects(params) {
            const objects = [{ key: 'example-object', params }];
            return new Promise(resolve => client.getObjects('example-bucket', objects, logger, resolve));
        }

        it('should exclude the non-localized locations when the flag is set', async () => {
            let filter;
            const collection = {
                find: query => {
                    filter = query;
                    return { toArray: () => Promise.resolve([]) };
                },
            };
            sinon.stub(client, 'getCollection').callsFake(() => collection);
            sinon.stub(client, 'getLatestVersion').callsFake((...args) => args[4](null, {}));
            await getObjects({ hideNonLocalizedVersions: true });
            assert.deepStrictEqual(filter['value.dataStoreName'], { $nin: ['dr-source'] });
        });

        it('should not filter when the flag is not set', async () => {
            let filter;
            const collection = {
                find: query => {
                    filter = query;
                    return { toArray: () => Promise.resolve([]) };
                },
            };
            sinon.stub(client, 'getCollection').callsFake(() => collection);
            sinon.stub(client, 'getLatestVersion').callsFake((...args) => args[4](null, {}));
            await getObjects({});
            assert.strictEqual(filter['value.dataStoreName'], undefined);
        });
    });

    describe('getLatestVersion', () => {
        function latestVersionQuery(mongoClient) {
            let query;
            const collection = {
                find: q => {
                    query = q;
                    return { sort: () => ({ limit: () => ({ toArray: () => Promise.resolve([]) }) }) };
                },
            };
            return new Promise(resolve =>
                mongoClient.getLatestVersion(collection, 'example-object', 'v0', logger, () => resolve(query)),
            );
        }

        it('should exclude the non-localized locations, whatever the caller asked for', async () => {
            const query = await latestVersionQuery(client);
            assert.deepStrictEqual(query['value.dataStoreName'], { $nin: ['dr-source'] });
        });

        it('should not filter when no location is flagged as non-localized', async () => {
            const query = await latestVersionQuery(new MongoClientInterface({ locations: { 'us-east-1': {} } }));
            assert.strictEqual(query['value.dataStoreName'], undefined);
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
