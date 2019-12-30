const assert = require('assert');

const MongoClientInterface = require(
    '../../../../../lib/storage/metadata/mongoclient/MongoClientInterface');
const DummyConfigObject = require('./utils/DummyConfigObject');

const mongoTestClient = new MongoClientInterface({});

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

describe('MongoClientInterface, misc', () => {
    let s3ConfigObj;

    beforeEach(() => {
        s3ConfigObj = new DummyConfigObject();
    });

    it('should filter out collections with special names', () => {
        const mongoClient = new MongoClientInterface({ config: s3ConfigObj });
        assert.equal(mongoClient._isSpecialCollection('__foo'), true);
        assert.equal(mongoClient._isSpecialCollection('bar'), false);
    });
});
