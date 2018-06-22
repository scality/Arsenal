const assert = require('assert');

const MongoClientInterface = require(
    '../../../../../lib/storage/metadata/mongoclient/MongoClientInterface');
const DummyMongoDB = require('./utils/DummyMongoDB');
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
