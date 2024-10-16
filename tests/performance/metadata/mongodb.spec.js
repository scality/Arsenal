const async = require('async');
const werelogs = require('werelogs');

const { MongoMemoryReplSet } = require('mongodb-memory-server');
const MetadataWrapper = require('../../../lib/storage/metadata/MetadataWrapper');
const { versioning } = require('../../..');
const { BucketInfo } = require('../../../lib/models');
const logger = new werelogs.Logger('MongoClientInterface', 'debug', 'debug');
const { BucketVersioningKeyFormat } = versioning.VersioningConstants;

const DB_NAME = `ballooning-${Date.now()}`;
const IMPL_NAME = 'mongodb';
const BUCKET_NAME = 'test-bucket';
const OBJECT_NAME = 'object';

const mongoserver = new MongoMemoryReplSet({
    debug: false,
    instanceOpts: [
        { port: 27018 },
    ],
    replSet: {
        name: 'rs0',
        count: 1,
        DB_NAME,
        storageEngine: 'ephemeralForTest',
    },
});

const objBase = {
    objName: OBJECT_NAME,
    objVal: {
        key: OBJECT_NAME,
        versionId: 'null',
    },
    nbVersions: 5,
};

let metadata;
let mongoStarted = false;

const listingTypes = [
    // {
    //     listingType: 'DelimiterMaster',
    //     maxKeys: 1000,
    //     prefix: '',
    //     delimiter: '/',
    //     runs: 500,
    // },
    // {
    //     listingType: 'DelimiterMaster',
    //     maxKeys: 1000,
    //     prefix: 'folder1/subfolder2/',
    //     delimiter: '/',
    //     runs: 500,
    // },
    // {
    //     listingType: 'DelimiterVersions',
    //     maxKeys: 1000,
    //     prefix: '',
    //     delimiter: '/',
    //     runs: 500,
    // },
    {
        listingType: 'DelimiterVersions',
        maxKeys: 1000,
        prefix: 'folder1/subfolder2/',
        delimiter: '/',
        runs: 500,
    },
]

function initializeMetadata(done) {
    if (mongoStarted) {
        return done();
    }
    return mongoserver.start().then(() => {
        return mongoserver.waitUntilRunning().then(() => {
            const opts = {
                mongodb: {
                    replicaSetHosts: 'localhost:27018',
                    writeConcern: 'majority',
                    replicaSet: 'rs0',
                    readPreference: 'primary',
                    database: DB_NAME,
                },
            };
            metadata = new MetadataWrapper(IMPL_NAME, opts, null, logger);
            metadata.setup((err, data) => {
                mongoStarted = true;
                if (err) {
                    return done(err);
                }
                return done(null, data);
            });
        });
    }).catch(done);
}

function createBucket(bucketName, bucketFormat, versioningEnabled, next) {
    const bucketMD = BucketInfo.fromObj({
        _name: bucketName,
        _owner: 'testowner',
        _ownerDisplayName: 'testdisplayname',
        _creationDate: new Date().toJSON(),
        _acl: {
            Canned: 'private',
            FULL_CONTROL: [],
            WRITE: [],
            WRITE_ACP: [],
            READ: [],
            READ_ACP: [],
        },
        _mdBucketModelVersion: 17,
        _transient: false,
        _deleted: false,
        _serverSideEncryption: null,
        _versioningConfiguration: versioningEnabled ? {
            Status: 'Enabled',
        } : null,
        _locationConstraint: 'us-east-1',
        _readLocationConstraint: null,
        _cors: null,
        _replicationConfiguration: null,
        _lifecycleConfiguration: null,
        _uid: '',
        _isNFS: null,
        ingestion: null,
    });
    metadata.client.defaultBucketKeyFormat = bucketFormat;
    return metadata.createBucket(bucketName, bucketMD, logger, next);
}

function putBulkObjectVersions(bucketName, objName, objVal, versionNb, done) {
    let count = 0;
    let versionParams;
    if (versionNb === 0) {
        versionParams = {
            versioning: false,
            versionId: null,
            repairMaster: null,
        };
    } else {
        versionParams = {
            versioning: true,
            versionId: null,
            repairMaster: null,
        };
    }
    async.whilst(
        () => count < versionNb,
        cbIterator => {
            count++;
            return metadata.putObjectMD(bucketName, objName, objVal, versionParams,
                logger, cbIterator);
        }, done);
}

function populateBucket(bucketName, done) {
    const folderBase = 'folder';
    const subfolderBase = 'subfolder';
    const nbFolders = 1;
    const nbSubfolders = 5;
    const nbObjects = 100;
    const nbVersions = 10;
    let count = 0;
    async.whilst(
        () => count < nbFolders,
        cb => {
            count++;
            const folderName = `${folderBase}${count}`;
            return async.waterfall([
                next => metadata.putObjectMD(bucketName, folderName, {}, {}, logger, next),
                (res, next) => async.whilst(
                    () => count < nbSubfolders,
                    cbSubfolder => {
                        count++;
                        const subfolderName = `${folderName}/${subfolderBase}${count}`;
                        return async.waterfall([
                            nextSubfolder => metadata.putObjectMD(
                                bucketName,
                                subfolderName,
                                {},
                                {},
                                logger,
                                nextSubfolder
                            ),
                            (resSubfolder, nextSubfolder) => async.times(nbObjects, (i, cbObject) => {
                                const objNameWithSubfolder = `${subfolderName}/${OBJECT_NAME}${i}`;
                                return putBulkObjectVersions(
                                    bucketName,
                                    objNameWithSubfolder,
                                    objBase.objVal,
                                    nbVersions,
                                    cbObject,
                                );
                            }, nextSubfolder),
                        ], cbSubfolder);
                    },
                    next,
                ),
            ], cb);
        }, done);
}

function beforeHook(vFormat, versioned, bucketName, done) {
    return async.series([
        next => createBucket(bucketName, vFormat, versioned, next),
        next => populateBucket(bucketName, next),
    ], done);
}

function runGcTillMemoryIsStable(val = 5) {
    let heapSizeBeforeGC = 0;
    let heapSizeAfterGC = 0;
    let cnt = 0;
    let remaining = val;
    while (remaining > 0 || heapSizeAfterGC === 0 || (heapSizeAfterGC - heapSizeBeforeGC) / heapSizeBeforeGC > 0.01) {
        heapSizeBeforeGC = process.memoryUsage().heapUsed;
        global.gc();
        cnt++;
        remaining--;
        heapSizeAfterGC = process.memoryUsage().heapUsed;
        if (cnt > 100) {
            break;
        }
    }
}

describe(`MongoDB Client Interface`, function testCursorCleanup() {
    beforeAll(done => {
        initializeMetadata(done);
    });

    afterAll(done => {
        async.series([
            next => metadata?.close(next),
            next => mongoserver.stop()
                .then(() => next())
                .catch(next),
        ], done);
    });

    [
        // {
        //     vFormat: BucketVersioningKeyFormat.v0,
        //     versioned: false,
        // },
        // {
        //     vFormat: BucketVersioningKeyFormat.v0,
        //     versioned: true,
        // },
        // {
        //     vFormat: BucketVersioningKeyFormat.v1,
        //     versioned: false,
        // },
        {
            vFormat: BucketVersioningKeyFormat.v1,
            versioned: true,
        },
    ].forEach(({ vFormat, versioned }) => {
        describe(`${vFormat} case ${versioned ? 'versioning' : 'without versioning'}`, function testCursorCleanup() {
            const bucketName = `${BUCKET_NAME}-${vFormat}-${versioned ? 'versioning' : 'no-versioning'}`;
            let initialHeapSize = 0;
            let heapSizeBeforeGC = 0;
            let heapSizeAfterGC = 0;
            let currentRun = '';
            beforeAll(done => {
                beforeHook(vFormat, versioned, bucketName, done);
            });

            beforeEach(() => {
                runGcTillMemoryIsStable();
                initialHeapSize = process.memoryUsage().heapUsed;
            });

            afterEach(done => {
                setTimeout(() => {
                    heapSizeBeforeGC = process.memoryUsage().heapUsed;
                    runGcTillMemoryIsStable();
                    heapSizeAfterGC = process.memoryUsage().heapUsed;
                    console.log(`Bucket Name:\t${bucketName}\n` +
                                `Current Run:\t${currentRun}\n` +
                                `Initial Heap Size:\t${(initialHeapSize / 1024 / 1024).toFixed(2)}MB\n` +
                                `Heap size increased by\t${((heapSizeBeforeGC - initialHeapSize) / initialHeapSize * 100).
                                    toFixed(2)}%\t(${((heapSizeBeforeGC - initialHeapSize) / 1024 / 1024).toFixed(2)}MB)\tbefore GC\n` +
                                `Heap size increased by\t${((heapSizeAfterGC - initialHeapSize) / initialHeapSize * 100).
                                    toFixed(2)}%\t(${((heapSizeAfterGC - initialHeapSize) / 1024 / 1024).toFixed(2)}MB)\tafter GC`);

                    // asert that the increase is more than 1% of the initial heap size
                    expect((heapSizeAfterGC - initialHeapSize) / initialHeapSize).toBeLessThan(0.01);
                    done();
                }, 1000);
            });

            listingTypes.forEach(({ listingType, maxKeys, prefix, delimiter, runs }) => {
                it(`should list ${listingType} with ${maxKeys} maxKeys, prefix=${prefix}, delimiter=${delimiter}`, done => {
                    currentRun = `list ${listingType} with ${maxKeys} maxKeys, prefix=${prefix}, delimiter=${delimiter}`;
                    async.timesSeries(runs, (i, next) => {
                        metadata.listObject(bucketName, { listingType, maxKeys, prefix, delimiter }, logger, next);
                        runGcTillMemoryIsStable(1);
                    }, done);
                });
            });
        });
    });
});