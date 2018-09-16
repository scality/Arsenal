const assert = require('assert');

const MongoClientInterface = require(
    '../../../../../lib/storage/metadata/mongoclient/MongoClientInterface');
const DummyMongoDB = require('./utils/DummyMongoDB');
const DummyConfigObject = require('./utils/DummyConfigObject');
const DummyRequestLogger = require('./utils/DummyRequestLogger');

const log = new DummyRequestLogger();
const mongoTestClient = new MongoClientInterface({});
mongoTestClient.db = new DummyMongoDB();

describe('MongoClientInterface, init behavior', () => {
    let s3ConfigObj;
    const locationConstraints = {
        locationOne: { isTransient: true },
        locationTwo: { isTransient: false },
    };

    beforeEach(() => {
        s3ConfigObj = new DummyConfigObject();
    });

    it('should set DataCounter transientList when declaring a ' +
    'new MongoClientInterface object', () => {
        s3ConfigObj.setLocationConstraints(locationConstraints);
        const mongoClient = new MongoClientInterface({ config: s3ConfigObj });
        const expectedRes = { locationOne: true, locationTwo: false };
        assert.deepStrictEqual(
            mongoClient.dataCount.transientList, expectedRes);
    });

    it('should update DataCounter transientList if location constraints ' +
    'are updated', done => {
        const mongoClient = new MongoClientInterface({ config: s3ConfigObj });
        assert.deepStrictEqual(mongoClient.dataCount.transientList, {});
        const expectedRes = { locationOne: true, locationTwo: false };
        s3ConfigObj.once('MongoClientTestDone', () => {
            assert.deepStrictEqual(
                mongoClient.dataCount.transientList, expectedRes);
            return done();
        });
        s3ConfigObj.setLocationConstraints(locationConstraints);
    });
});

describe('MongoClientInterface::_handleResults', () => {
    it('should return zero-result', () => {
        const testInput = {
            masterCount: 0, masterData: {},
            nullCount: 0, nullData: {},
            versionCount: 0, versionData: {},
        };
        const testResults = mongoTestClient._handleResults(testInput, true);
        const expectedRes = {
            versions: 0, objects: 0,
            dataManaged: {
                total: { curr: 0, prev: 0 },
                locations: {},
            },
        };
        assert.deepStrictEqual(testResults, expectedRes);
    });

    it('should return correct value if isVer is false', () => {
        const testInput = {
            masterCount: 2, masterData: { test1: 10, test2: 10 },
            nullCount: 2, nullData: { test1: 10, test2: 10 },
            versionCount: 2, versionData: { test1: 20, test2: 20 },
        };
        const testResults = mongoTestClient._handleResults(testInput, false);
        const expectedRes = {
            versions: 0, objects: 4,
            dataManaged: {
                total: { curr: 40, prev: 0 },
                locations: {
                    test1: { curr: 20, prev: 0 },
                    test2: { curr: 20, prev: 0 },
                },
            },
        };
        assert.deepStrictEqual(testResults, expectedRes);
    });

    it('should return correct value if isVer is true', () => {
        const testInput = {
            masterCount: 2, masterData: { test1: 10, test2: 10 },
            nullCount: 2, nullData: { test1: 10, test2: 10 },
            versionCount: 4, versionData: { test1: 20, test2: 20 },
        };
        const testResults = mongoTestClient._handleResults(testInput, true);
        const expectedRes = {
            versions: 2, objects: 4,
            dataManaged: {
                total: { curr: 40, prev: 20 },
                locations: {
                    test1: { curr: 20, prev: 10 },
                    test2: { curr: 20, prev: 10 },
                },
            },
        };
        assert.deepStrictEqual(testResults, expectedRes);
    });
});

describe('MongoClientInterface::_handleMongo', () => {
    beforeEach(() => mongoTestClient.db.reset());

    it('should return error if mongo aggregate fails', done => {
        const retValues = [new Error('testError')];
        mongoTestClient.db.setReturnValues(retValues);
        const testCollection = mongoTestClient.db.collection('test');
        mongoTestClient._handleMongo(testCollection, {}, false, log, err => {
            assert(err, 'Expected error, but got success');
            return done();
        });
    });

    it('should return empty object if mongo aggregate has no results', done => {
        const testCollection = mongoTestClient.db.collection('test');
        mongoTestClient._handleMongo(testCollection, {}, false, log,
        (err, res) => {
            assert.ifError(err, `Expected success, but got error ${err}`);
            assert.deepStrictEqual(res, {});
            return done();
        });
    });

    it('should return empty object if mongo aggregate has missing results',
    done => {
        const retValues = [[{
            count: undefined,
            data: undefined,
            repData: undefined,
        }]];
        mongoTestClient.db.setReturnValues(retValues);
        const testCollection = mongoTestClient.db.collection('test');
        mongoTestClient._handleMongo(testCollection, {}, false, log,
        (err, res) => {
            assert.ifError(err, `Expected success, but got error ${err}`);
            assert.deepStrictEqual(res, {});
            return done();
        });
    });

    const testRetValues = [[{
        count: [{ _id: null, count: 100 }],
        data: [
            { _id: 'locationone', bytes: 1000 },
            { _id: 'locationtwo', bytes: 1000 },
        ],
        repData: [
            { _id: 'awsbackend', bytes: 500 },
            { _id: 'azurebackend', bytes: 500 },
            { _id: 'gcpbackend', bytes: 500 },
        ],
        compData: [
            { _id: 'locationone', bytes: 500 },
            { _id: 'locationtwo', bytes: 500 },
        ],
    }]];

    it('should return correct results, transient false', done => {
        mongoTestClient.db.setReturnValues(testRetValues);
        const testCollection = mongoTestClient.db.collection('test');
        mongoTestClient._handleMongo(testCollection, {}, false, log,
        (err, res) => {
            assert.ifError(err, `Expected success, but got error ${err}`);
            assert.deepStrictEqual(res, {
                count: 100,
                data: {
                    locationone: 1000,
                    locationtwo: 1000,
                    awsbackend: 500,
                    azurebackend: 500,
                    gcpbackend: 500,
                },
            });
            return done();
        });
    });

    it('should return correct results, transient true', done => {
        mongoTestClient.db.setReturnValues(testRetValues);
        const testCollection = mongoTestClient.db.collection('test');
        mongoTestClient._handleMongo(testCollection, {}, true, log,
        (err, res) => {
            assert.ifError(err, `Expected success, but got error ${err}`);
            assert.deepStrictEqual(res, {
                count: 100,
                data: {
                    locationone: 500,
                    locationtwo: 500,
                    awsbackend: 500,
                    azurebackend: 500,
                    gcpbackend: 500,
                },
            });
            return done();
        });
    });

    const testRetValuesNeg = [[{
        count: [{ _id: null, count: 100 }],
        data: [
            { _id: 'locationone', bytes: 100 },
            { _id: 'locationtwo', bytes: 100 },
        ],
        repData: [
            { _id: 'awsbackend', bytes: 500 },
            { _id: 'azurebackend', bytes: 500 },
            { _id: 'gcpbackend', bytes: 500 },
        ],
        compData: [
            { _id: 'locationone', bytes: 500 },
            { _id: 'locationtwo', bytes: 500 },
        ],
    }]];
    it('should return clamp negative values to 0', done => {
        mongoTestClient.db.setReturnValues(testRetValuesNeg);
        const testCollection = mongoTestClient.db.collection('test');
        mongoTestClient._handleMongo(testCollection, {}, true, log,
        (err, res) => {
            assert.ifError(err, `Expected success, but got error ${err}`);
            assert.deepStrictEqual(res, {
                count: 100,
                data: {
                    locationone: 0,
                    locationtwo: 0,
                    awsbackend: 500,
                    azurebackend: 500,
                    gcpbackend: 500,
                },
            });
            return done();
        });
    });
});
