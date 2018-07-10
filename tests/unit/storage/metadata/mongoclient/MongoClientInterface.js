const assert = require('assert');

const MongoClientInterface = require(
    '../../../../../lib/storage/metadata/mongoclient/MongoClientInterface');
const DummyMongoDB = require('./utils/DummyMongoDB');
const DummyConfigObject = require('./utils/DummyConfigObject');
const DummyRequestLogger = require('./utils/DummyRequestLogger');
const { generateMD } = require('./utils/helper');

const log = new DummyRequestLogger();
const mongoTestClient = new MongoClientInterface({});
mongoTestClient.db = new DummyMongoDB();

const bucketName = 'mongoTestBucket';
const objectName = 'mongoTestObject';

const zeroRef = {
    objects: 0,
    versions: 0,
    buckets: 0,
    bucketList: [],
    dataManaged: {
        total: { curr: 0, prev: 0 },
        byLocation: {},
    },
};

const startRef = {
    objects: 10,
    versions: 10,
    buckets: 0,
    bucketList: [],
    dataManaged: {
        total: { curr: 1000, prev: 1000 },
        byLocation: {
            mongotest: { curr: 1000, prev: 1000 },
        },
    },
};

function assertSuccessResults(testParams, cb) {
    const { newVal, retValues, initRef, resRef, params } = testParams;
    mongoTestClient.dataCount.set(initRef);
    mongoTestClient.db.setReturnValues(retValues);
    assert.deepStrictEqual(mongoTestClient.dataCount.results(), initRef);
    mongoTestClient.putObject(bucketName, objectName, newVal, params, log,
    err => {
        assert.ifError(err, `Expected success, but got error ${err}`);
        assert.deepStrictEqual(
            mongoTestClient.dataCount.results(), resRef);
        cb();
    });
}

function assertFailureResults(testParams, cb) {
    const { newVal, retValues, initRef, params } = testParams;
    mongoTestClient.db.fail = true;
    mongoTestClient.dataCount.set(initRef);
    mongoTestClient.db.setReturnValues(retValues);
    assert.deepStrictEqual(mongoTestClient.dataCount.results(), initRef);
    mongoTestClient.putObject(bucketName, objectName, newVal, params, log,
    err => {
        assert(err, 'Expected error, but got success');
        assert.deepStrictEqual(
            mongoTestClient.dataCount.results(), initRef);
        cb();
    });
}

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

describe('MongoClientInterface::dataCount', () => {
    describe('MongoClientInterface::putObject', () => {
        beforeEach(() => {
            mongoTestClient.db.reset();
        });

        const failTests = [
            {
                it: 'should not add count when NonVer put object call fails',
                params: {},
            },
            {
                it: 'should not add count when verCase1 put object call fails',
                params: { versioning: true },
            },
            {
                it: 'should not add count when verCase2 put object call fails',
                params: { versionId: '' },
            },
            {
                it: 'should not add count when verCase3 put object call fails',
                params: { versionId: 'vercase' },
            },
        ];

        failTests.forEach(test => it(test.it, done => {
            const retValues = [];
            const newVal = generateMD(objectName, 200);
            const testParams = {
                newVal,
                retValues,
                initRef: zeroRef,
                params: test.params,
            };
            assertFailureResults(testParams, done);
        }));

        it('should call putObjectNonVer and add object',
        done => {
            const retValues = [];
            const newVal = generateMD(objectName, 200, '',
                [{ site: 'repsite', status: 'COMPLETED' }]);
            const expectedRes = {
                objects: 1,
                versions: 0,
                buckets: 0,
                bucketList: [],
                dataManaged: {
                    total: { curr: 400, prev: 0 },
                    byLocation: {
                        mongotest: { curr: 200, prev: 0 },
                        repsite: { curr: 200, prev: 0 },
                    },
                },
            };
            const testParams = {
                newVal,
                retValues,
                initRef: zeroRef,
                resRef: expectedRes,
                params: {},
            };
            assertSuccessResults(testParams, done);
        });

        it('should call putObjectNonVer and add object, overwrite',
        done => {
            const retValues = [
                { _id: objectName, value: generateMD(objectName, 100) },
            ];
            const newVal = generateMD(objectName, 200, '',
                [{ site: 'repsite', status: 'COMPLETED' }]);
            const expectedRes = {
                objects: 10,
                versions: 10,
                buckets: 0,
                bucketList: [],
                dataManaged: {
                    total: { curr: 1300, prev: 1000 },
                    byLocation: {
                        mongotest: { curr: 1100, prev: 1000 },
                        repsite: { curr: 200, prev: 0 },
                    },
                },
            };
            const testParams = {
                newVal,
                retValues,
                initRef: startRef,
                resRef: expectedRes,
                params: {},
            };
            assertSuccessResults(testParams, done);
        });

        it('should call putObjectVerCase1 and add versioned object',
        done => {
            const retValues = [
                { _id: objectName, value: generateMD(objectName, 100) },
            ];
            const newVal = generateMD(objectName, 200, '',
                [{ site: 'repsite', status: 'COMPLETED' }]);
            const expectedRes = {
                objects: 10,
                versions: 11,
                buckets: 0,
                bucketList: [],
                dataManaged: {
                    total: { curr: 1300, prev: 1100 },
                    byLocation: {
                        mongotest: { curr: 1100, prev: 1100 },
                        repsite: { curr: 200, prev: 0 },
                    },
                },
            };
            const testParams = {
                newVal,
                retValues,
                initRef: startRef,
                resRef: expectedRes,
                params: { versioning: true },
            };
            assertSuccessResults(testParams, done);
        });

        it('should call putObjectVerCase2 and add null versioned object',
        done => {
            const retValues = [
                { _id: objectName, value: generateMD(objectName, 100) },
            ];
            const newVal = generateMD(objectName, 200, '',
                [{ site: 'repsite', status: 'COMPLETED' }]);
            const expectedRes = {
                objects: 10,
                versions: 10,
                buckets: 0,
                bucketList: [],
                dataManaged: {
                    total: { curr: 1300, prev: 1000 },
                    byLocation: {
                        mongotest: { curr: 1100, prev: 1000 },
                        repsite: { curr: 200, prev: 0 },
                    },
                },
            };
            const testParams = {
                newVal,
                retValues,
                initRef: startRef,
                resRef: expectedRes,
                params: { versionId: '' },
            };
            assertSuccessResults(testParams, done);
        });

        it('should call putObjectVerCase3 and update versioned object',
        done => {
            const retValues = [
                [
                    { _id: objectName, value: generateMD(objectName, 100, '',
                        [{ site: 'repsite', status: 'COMPLETED' },
                        { site: 'repsite2', status: 'PENDING' }]) },
                ],
                null,
            ];
            const newVal = generateMD(objectName, 100, '',
                [
                    { site: 'repsite', status: 'COMPLETED' },
                    { site: 'repsite2', status: 'COMPLETED' },
                ]);
            const initRef = {
                objects: 10,
                versions: 10,
                buckets: 0,
                bucketList: [],
                dataManaged: {
                    total: { curr: 1000, prev: 1100 },
                    byLocation: {
                        mongotest: { curr: 1000, prev: 1000 },
                        repsite: { curr: 0, prev: 100 },
                    },
                },
            };
            const expectedRes = {
                objects: 10,
                versions: 10,
                buckets: 0,
                bucketList: [],
                dataManaged: {
                    total: { curr: 1000, prev: 1200 },
                    byLocation: {
                        mongotest: { curr: 1000, prev: 1000 },
                        repsite: { curr: 0, prev: 100 },
                        repsite2: { curr: 0, prev: 100 },
                    },
                },
            };
            const testParams = {
                newVal,
                retValues,
                initRef,
                resRef: expectedRes,
                params: { versionId: 'versioned' },
            };
            assertSuccessResults(testParams, done);
        });

        it('should call putObjectVerCase3 and update master object', done => {
            const retValues = [
                [
                    { _id: objectName, value: generateMD(objectName, 100, '',
                        [{ site: 'repsite', status: 'COMPLETED' },
                        { site: 'repsite2', status: 'PENDING' }]) },
                    { _id: objectName, value: generateMD(objectName, 100, '',
                        [{ site: 'repsite', status: 'COMPLETED' },
                        { site: 'repsite2', status: 'PENDING' }]) },
                ],
                null,
            ];
            const newVal = generateMD(objectName, 100, '',
                [
                    { site: 'repsite', status: 'COMPLETED' },
                    { site: 'repsite2', status: 'COMPLETED' },
                ]);
            const initRef = {
                objects: 10,
                versions: 10,
                buckets: 0,
                bucketList: [],
                dataManaged: {
                    total: { curr: 1100, prev: 1000 },
                    byLocation: {
                        mongotest: { curr: 1000, prev: 1000 },
                        repsite: { curr: 100, prev: 0 },
                    },
                },
            };
            const expectedRes = {
                objects: 10,
                versions: 10,
                buckets: 0,
                bucketList: [],
                dataManaged: {
                    total: { curr: 1200, prev: 1000 },
                    byLocation: {
                        mongotest: { curr: 1000, prev: 1000 },
                        repsite: { curr: 100, prev: 0 },
                        repsite2: { curr: 100, prev: 0 },
                    },
                },
            };
            const testParams = {
                newVal,
                retValues,
                initRef,
                resRef: expectedRes,
                params: { versionId: 'master' },
            };
            assertSuccessResults(testParams, done);
        });
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
