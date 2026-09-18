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

        // the fallback stands in for the master, so it filters whatever the caller asked for
        function stubFallback(master) {
            const collection = { findOne: () => Promise.resolve(master) };
            sinon.stub(client, 'getCollection').callsFake(() => collection);
            return sinon.stub(client, 'getLatestVersion').callsFake((...args) => args[5](null, {}));
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

        it('should filter the latest version lookup when the master is absent', async () => {
            const getLatestVersion = stubFallback(null);
            const params = { hideNonLocalizedVersions: true };
            await new Promise(resolve => client.getObject('example-bucket', 'example-object', params, logger, resolve));
            assert.deepStrictEqual(getLatestVersion.firstCall.args[3], nonLocalizedFilter);
        });

        it('should filter the latest version lookup even when the flag is not set', async () => {
            const getLatestVersion = stubFallback(null);
            await new Promise(resolve => client.getObject('example-bucket', 'example-object', {}, logger, resolve));
            assert.deepStrictEqual(getLatestVersion.firstCall.args[3], nonLocalizedFilter);
        });

        it('should filter the latest version lookup when the master is a placeholder', async () => {
            const getLatestVersion = stubFallback({ value: { isPHD: true } });
            await new Promise(resolve => client.getObject('example-bucket', 'example-object', {}, logger, resolve));
            assert.deepStrictEqual(getLatestVersion.firstCall.args[3], nonLocalizedFilter);
        });
    });

    describe('getObjects', () => {
        function stubFallback(docs) {
            const collection = { find: () => ({ toArray: () => Promise.resolve(docs) }) };
            sinon.stub(client, 'getCollection').callsFake(() => collection);
            return sinon.stub(client, 'getLatestVersion').callsFake((...args) => args[5](null, {}));
        }

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
            sinon.stub(client, 'getLatestVersion').callsFake((...args) => args[5](null, {}));
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
            sinon.stub(client, 'getLatestVersion').callsFake((...args) => args[5](null, {}));
            await getObjects({});
            assert.strictEqual(filter['value.dataStoreName'], undefined);
        });

        it('should filter the latest version lookup when the master is absent', async () => {
            const getLatestVersion = stubFallback([]);
            await getObjects({ hideNonLocalizedVersions: true });
            assert.deepStrictEqual(getLatestVersion.firstCall.args[3], nonLocalizedFilter);
        });

        it('should filter the latest version lookup even when the flag is not set', async () => {
            const getLatestVersion = stubFallback([]);
            await getObjects({});
            assert.deepStrictEqual(getLatestVersion.firstCall.args[3], nonLocalizedFilter);
        });

        it('should filter the latest version lookup when the master is a placeholder', async () => {
            const getLatestVersion = stubFallback([{ _id: 'example-master-key', value: { isPHD: true } }]);
            await getObjects({});
            assert.deepStrictEqual(getLatestVersion.firstCall.args[3], nonLocalizedFilter);
        });
    });

    describe('asyncRepair', () => {
        it('should repair the master with the newest localized version', () => {
            const getLatestVersion = sinon.stub(client, 'getLatestVersion').callsFake((...args) => args[5](null, {}));
            sinon.stub(client, 'repair').callsFake((...args) => args[7](null));
            client.asyncRepair({}, 'example-bucket', 'example-object', { versionId: 'example-version' }, 'v0', logger);
            assert.deepStrictEqual(getLatestVersion.firstCall.args[3], nonLocalizedFilter);
        });
    });

    describe('deleteOrRepairPHD', () => {
        it('should resolve the placeholder master against the localized versions only', done => {
            sinon.useFakeTimers();
            const getLatestVersion = sinon
                .stub(client, 'getLatestVersion')
                .callsFake((...args) => args[5](null, { isDeleteMarker: false }));
            client.deleteOrRepairPHD(
                {},
                'example-bucket',
                'example-object',
                { versionId: 'example-version' },
                'v0',
                logger,
                err => {
                    assert.ifError(err);
                    assert.deepStrictEqual(getLatestVersion.firstCall.args[3], nonLocalizedFilter);
                    return done();
                },
            );
        });
    });

    describe('putObjectVerCase4', () => {
        it('should repair the master with the newest localized version', done => {
            const getLatestVersion = sinon.stub(client, 'getLatestVersion').callsFake((...args) => args[5](null, {}));
            const collection = {
                updateOne: () => Promise.resolve(),
                bulkWrite: () => Promise.resolve({}),
            };
            client.putObjectVerCase4(collection, 'example-bucket', 'example-object', {}, {}, logger, err => {
                assert.ifError(err);
                assert.deepStrictEqual(getLatestVersion.firstCall.args[3], nonLocalizedFilter);
                return done();
            });
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
