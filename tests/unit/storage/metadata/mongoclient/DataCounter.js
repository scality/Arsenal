const assert = require('assert');

const {
    NEW_OBJ,
    NEW_VER,
    UPDATE_VER,
    UPDATE_MST,
    RESTORE,
    DEL_VER,
    DEL_MST,
    DataCounter,
} = require('../../../../../lib/storage/metadata/mongoclient/DataCounter');

const refZeroObj = {
    objects: 0,
    versions: 0,
    buckets: 0,
    dataManaged: {
        total: { curr: 0, prev: 0 },
        byLocation: {},
    },
};

const refSingleObj = {
    objects: 2,
    versions: 0,
    buckets: 0,
    dataManaged: {
        total: { curr: 200, prev: 0 },
        byLocation: {
            locationOne: { curr: 200, prev: 0 },
        },
    },
};

const refSingleObjVer = {
    objects: 1,
    versions: 1,
    buckets: 0,
    dataManaged: {
        total: { curr: 100, prev: 100 },
        byLocation: {
            locationOne: { curr: 100, prev: 100 },
        },
    },
};

const refMultiObjVer = {
    objects: 1,
    versions: 1,
    buckets: 0,
    dataManaged: {
        total: { curr: 200, prev: 200 },
        byLocation: {
            locationOne: { curr: 100, prev: 100 },
            locationTwo: { curr: 100, prev: 100 },
        },
    },
};

const refMultiObj = {
    objects: 2,
    versions: 0,
    buckets: 0,
    dataManaged: {
        total: { curr: 400, prev: 0 },
        byLocation: {
            locationOne: { curr: 200, prev: 0 },
            locationTwo: { curr: 200, prev: 0 },
        },
    },
};

const singleSite = size => ({
    'content-length': size,
    'dataStoreName': 'locationOne',
    'replicationInfo': {
        backends: [],
    },
});

const multiSite = (size, isComplete) => ({
    'content-length': size,
    'dataStoreName': 'locationOne',
    'replicationInfo': {
        backends: [{
            site: 'locationTwo',
            status: isComplete ? 'COMPLETED' : 'PENDING',
        }],
    },
});

const transientSite = (size, status, backends) => ({
    'content-length': size,
    'dataStoreName': 'locationOne',
    'replicationInfo': { status, backends },
});

const locationConstraints = {
    locationOne: { isTransient: true },
    locationTwo: { isTransient: false },
};

const dataCounter = new DataCounter();

describe('DataCounter Class', () => {
    it('should create a zero object', () => {
        dataCounter.set(refZeroObj);
        assert.deepStrictEqual(dataCounter.results(), refZeroObj);
    });

    it('should skip dataCounter methods if initial values are not set', () => {
        const testCounter = new DataCounter();
        testCounter.addObject(singleSite(100), null, NEW_OBJ);
        assert.deepStrictEqual(testCounter.results(), refZeroObj);
    });
});

describe('DateCounter::updateTransientList', () => {
    afterEach(() => dataCounter.updateTransientList({}));
    it('should set transient list', () => {
        assert.deepStrictEqual(dataCounter.transientList, {});
        dataCounter.updateTransientList(locationConstraints);
        const expectedRes = { locationOne: true, locationTwo: false };
        assert.deepStrictEqual(dataCounter.transientList, expectedRes);
    });
});

describe('DataCounter::addObject', () => {
    const tests = [
        {
            it: 'should correctly update DataCounter, new object one site',
            init: refZeroObj,
            input: [singleSite(100), null, NEW_OBJ],
            expectedRes: {
                objects: 1, versions: 0,
                dataManaged: {
                    total: { curr: 100, prev: 0 },
                    byLocation: {
                        locationOne: { curr: 100, prev: 0 },
                    },
                },
            },
        },
        {
            it: 'should correctly update DataCounter, new object multi site',
            init: refZeroObj,
            input: [multiSite(100, true), null, NEW_OBJ],
            expectedRes: {
                objects: 1, versions: 0,
                dataManaged: {
                    total: { curr: 200, prev: 0 },
                    byLocation: {
                        locationOne: { curr: 100, prev: 0 },
                        locationTwo: { curr: 100, prev: 0 },
                    },
                },
            },
        },
        {
            it: 'should correctly update DataCounter, overwrite single site',
            init: refSingleObj,
            input: [singleSite(100), singleSite(50), NEW_OBJ],
            expectedRes: {
                objects: 2, versions: 0,
                dataManaged: {
                    total: { curr: 250, prev: 0 },
                    byLocation: {
                        locationOne: { curr: 250, prev: 0 },
                    },
                },
            },
        },
        {
            it: 'should correctly update DataCounter, overwrite multi site',
            init: refMultiObj,
            input: [multiSite(100, true), multiSite(50, true), NEW_OBJ],
            expectedRes: {
                objects: 2, versions: 0,
                dataManaged: {
                    total: { curr: 500, prev: 0 },
                    byLocation: {
                        locationOne: { curr: 250, prev: 0 },
                        locationTwo: { curr: 250, prev: 0 },
                    },
                },
            },
        },
        {
            it: 'should correctly update DataCounter, new version single site',
            init: refSingleObj,
            input: [singleSite(100), singleSite(50), NEW_VER],
            expectedRes: {
                objects: 2, versions: 1,
                dataManaged: {
                    total: { curr: 250, prev: 50 },
                    byLocation: {
                        locationOne: { curr: 250, prev: 50 },
                    },
                },
            },
        },
        {
            it: 'should correctly update DataCounter, new version multi site',
            init: refMultiObj,
            input: [multiSite(100, true), multiSite(50, true), NEW_VER],
            expectedRes: {
                objects: 2, versions: 1,
                dataManaged: {
                    total: { curr: 500, prev: 100 },
                    byLocation: {
                        locationOne: { curr: 250, prev: 50 },
                        locationTwo: { curr: 250, prev: 50 },
                    },
                },
            },
        },
        {
            it: 'should correctly ignore pending status, multi site',
            init: refZeroObj,
            input: [multiSite(100, false), null, NEW_OBJ],
            expectedRes: {
                objects: 1, versions: 0,
                dataManaged: {
                    total: { curr: 100, prev: 0 },
                    byLocation: {
                        locationOne: { curr: 100, prev: 0 },
                    },
                },
            },
        },
        {
            it: 'should correctly update DataCounter, ' +
            'replication completion update in master object',
            init: refSingleObj,
            input: [multiSite(100, true), multiSite(100, false), UPDATE_MST],
            expectedRes: {
                objects: 2, versions: 0,
                dataManaged: {
                    total: { curr: 300, prev: 0 },
                    byLocation: {
                        locationOne: { curr: 200, prev: 0 },
                        locationTwo: { curr: 100, prev: 0 },
                    },
                },
            },
        },
        {
            it: 'should correctly update DataCounter, ' +
            'replication completion update in versioned object',
            init: refSingleObjVer,
            input: [multiSite(100, true), multiSite(100, false), UPDATE_VER],
            expectedRes: {
                objects: 1, versions: 1,
                dataManaged: {
                    total: { curr: 100, prev: 200 },
                    byLocation: {
                        locationOne: { curr: 100, prev: 100 },
                        locationTwo: { curr: 0, prev: 100 },
                    },
                },
            },
        },
        {
            it: 'should correctly update DataCounter, ' +
            'restoring versioned object as master',
            init: refMultiObjVer,
            input: [multiSite(100, true), multiSite(100, true), RESTORE],
            expectedRes: {
                objects: 2, versions: 0,
                dataManaged: {
                    total: { curr: 400, prev: 0 },
                    byLocation: {
                        locationOne: { curr: 200, prev: 0 },
                        locationTwo: { curr: 200, prev: 0 },
                    },
                },
            },
        },
    ];
    tests.forEach(test => it(test.it, () => {
        const { expectedRes, input, init } = test;
        dataCounter.set(init);
        dataCounter.addObject(...input);
        const testResults = dataCounter.results();
        Object.keys(expectedRes).forEach(key => {
            if (typeof expectedRes[key] === 'object') {
                assert.deepStrictEqual(testResults[key], expectedRes[key]);
            } else {
                assert.strictEqual(testResults[key], expectedRes[key]);
            }
        });
    }));
});

describe('DataCounter, update with transient location', () => {
    before(() => dataCounter.updateTransientList(locationConstraints));
    after(() => dataCounter.updateTransientList({}));

    const pCurrMD = transientSite(100, 'PENDING', [
        { site: 'site1', status: 'PENDING' },
        { site: 'site2', status: 'COMPLETED' },
    ]);
    const cCurrMD = transientSite(100, 'COMPLETED', [
        { site: 'site1', status: 'COMPLETED' },
        { site: 'site2', status: 'COMPLETED' },
    ]);
    const prevMD = transientSite(100, 'PENDING', [
        { site: 'site1', status: 'PENDING' },
        { site: 'site2', status: 'PENDING' },
    ]);
    const transientTest = [
        {
            it: 'should correctly update DataCounter, ' +
            'version object, replication status = PENDING',
            init: refSingleObjVer,
            input: [pCurrMD, prevMD, UPDATE_VER],
            expectedRes: {
                objects: 1, versions: 1,
                dataManaged: {
                    total: { curr: 100, prev: 200 },
                    byLocation: {
                        locationOne: { curr: 100, prev: 100 },
                        site2: { curr: 0, prev: 100 },
                    },
                },
            },
        },
        {
            it: 'should correctly update DataCounter, ' +
            'version object, replication status = COMPLETED',
            init: refSingleObjVer,
            input: [cCurrMD, prevMD, UPDATE_VER],
            expectedRes: {
                objects: 1, versions: 1,
                dataManaged: {
                    total: { curr: 100, prev: 200 },
                    byLocation: {
                        locationOne: { curr: 100, prev: 0 },
                        site1: { curr: 0, prev: 100 },
                        site2: { curr: 0, prev: 100 },
                    },
                },
            },
        },
        {
            it: 'should correctly update DataCounter, ' +
            'master object, replication status = PENDING',
            init: refSingleObjVer,
            input: [pCurrMD, prevMD, UPDATE_MST],
            expectedRes: {
                objects: 1, versions: 1,
                dataManaged: {
                    total: { curr: 200, prev: 100 },
                    byLocation: {
                        locationOne: { curr: 100, prev: 100 },
                        site2: { curr: 100, prev: 0 },
                    },
                },
            },
        },
        {
            it: 'should correctly update DataCounter, ' +
            'master object, replication status = COMPLETED',
            init: refSingleObjVer,
            input: [cCurrMD, prevMD, UPDATE_MST],
            expectedRes: {
                objects: 1, versions: 1,
                dataManaged: {
                    total: { curr: 200, prev: 100 },
                    byLocation: {
                        locationOne: { curr: 0, prev: 100 },
                        site1: { curr: 100, prev: 0 },
                        site2: { curr: 100, prev: 0 },
                    },
                },
            },
        },
    ];

    transientTest.forEach(test => it(test.it, () => {
        const { expectedRes, input, init } = test;
        dataCounter.set(init);
        dataCounter.addObject(...input);
        const testResults = dataCounter.results();
        Object.keys(expectedRes).forEach(key => {
            if (typeof expectedRes[key] === 'object') {
                assert.deepStrictEqual(testResults[key], expectedRes[key]);
            } else {
                assert.strictEqual(testResults[key], expectedRes[key]);
            }
        });
    }));
});

describe('DataCounter::delObject', () => {
    const tests = [
        {
            it: 'should correctly update DataCounter, ' +
            'delete master object single site',
            init: refMultiObj,
            input: [singleSite(100), DEL_MST],
            expectedRes: {
                objects: 1, versions: 0,
                dataManaged: {
                    total: { curr: 300, prev: 0 },
                    byLocation: {
                        locationOne: { curr: 100, prev: 0 },
                        locationTwo: { curr: 200, prev: 0 },
                    },
                },
            },
        },
        {
            it: 'should correctly update DataCounter, ' +
            'delete master object multi site',
            init: refMultiObj,
            input: [multiSite(100, true), DEL_MST],
            expectedRes: {
                objects: 1, versions: 0,
                dataManaged: {
                    total: { curr: 200, prev: 0 },
                    byLocation: {
                        locationOne: { curr: 100, prev: 0 },
                        locationTwo: { curr: 100, prev: 0 },
                    },
                },
            },
        },
        {
            it: 'should correctly update DataCounter, ' +
            'delete versioned object single site',
            init: refMultiObjVer,
            input: [singleSite(100), DEL_VER],
            expectedRes: {
                objects: 1, versions: 0,
                dataManaged: {
                    total: { curr: 200, prev: 100 },
                    byLocation: {
                        locationOne: { curr: 100, prev: 0 },
                        locationTwo: { curr: 100, prev: 100 },
                    },
                },
            },
        },
        {
            it: 'should correctly update DataCounter, ' +
            'delete versioned object multi site',
            init: refMultiObjVer,
            input: [multiSite(100, true), DEL_VER],
            expectedRes: {
                objects: 1, versions: 0,
                dataManaged: {
                    total: { curr: 200, prev: 0 },
                    byLocation: {
                        locationOne: { curr: 100, prev: 0 },
                        locationTwo: { curr: 100, prev: 0 },
                    },
                },
            },
        },
        {
            it: 'should clamp negative values to 0, master object',
            init: refMultiObjVer,
            input: [multiSite(300, true), DEL_MST],
            expectedRes: {
                objects: 0, versions: 1,
                dataManaged: {
                    total: { curr: 0, prev: 200 },
                    byLocation: {
                        locationOne: { curr: 0, prev: 100 },
                        locationTwo: { curr: 0, prev: 100 },
                    },
                },
            },
        },
        {
            it: 'should clamp negative values to 0, versioned object',
            init: refMultiObjVer,
            input: [multiSite(300, true), DEL_VER],
            expectedRes: {
                objects: 1, versions: 0,
                dataManaged: {
                    total: { curr: 200, prev: 0 },
                    byLocation: {
                        locationOne: { curr: 100, prev: 0 },
                        locationTwo: { curr: 100, prev: 0 },
                    },
                },
            },
        },
    ];

    tests.forEach(test => it(test.it, () => {
        const { expectedRes, input, init } = test;
        dataCounter.set(init);
        dataCounter.delObject(...input);
        const testResults = dataCounter.results();
        Object.keys(expectedRes).forEach(key => {
            if (typeof expectedRes[key] === 'object') {
                assert.deepStrictEqual(testResults[key], expectedRes[key]);
            } else {
                assert.strictEqual(testResults[key], expectedRes[key]);
            }
        });
    }));
});
