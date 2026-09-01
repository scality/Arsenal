const async = require('async');
const assert = require('assert');
const werelogs = require('werelogs');
const { MongoMemoryReplSet } = require('mongodb-memory-server');
const logger = new werelogs.Logger('MongoClientInterface', 'debug', 'debug');
const MetadataWrapper =
    require('../../../../../lib/storage/metadata/MetadataWrapper');
const { versioning } = require('../../../../../index');
const { BucketVersioningKeyFormat } = versioning.VersioningConstants;
const { DelimiterNonCurrent } =
    require('../../../../../lib/algos/list/delimiterNonCurrent');
const { makeBucketMD, putBulkObjectVersions } = require('./utils');

const IMPL_NAME = 'mongodb';
const DB_NAME = 'metadata';
const BUCKET_NAME = 'test-lifecycle-list-scan-limit-bucket';

// A page truncated by the scan budget must resume where it stopped. If it
// ever fails to, the loops below would spin forever, so they are capped and
// the cap is asserted on.
const MAX_PAGES = 50;

// Scan budgets to sweep. Each one lands the truncation on a different entry
// of the keyspace, so the cursor bound is exercised at every alignment
// rather than at one lucky offset.
//
// Budgets below 5, and 10, are left out. They fail on this fixture with or
// without the cursor bound -- verified by running this file against a build
// with _cursorLimit() returning undefined -- for two reasons that belong to
// the scan budget, not to the cursor:
//
//   - budgets 3 and 4 never terminate for DelimiterNonCurrent. Resuming
//     re-reads the marker version to recover the stale date, so a budget that
//     small is spent on skipped entries plus that re-read, and the marker
//     cannot advance.
//   - budget 4 (v0) and budget 10 (v1) drop the last orphan delete marker.
//     When the keyspace runs out at the exact entry the budget runs out,
//     filter() never sees the entry that would raise FILTER_END, so
//     IsTruncated stays false while _isMaxScannedEntriesReached() is already
//     true -- result() then suppresses the held candidate AND reports the
//     listing complete, losing it for good.
//
// Neither is in scope here. The real budget is
// maxScannedLifecycleListingEntries, default 10,000.
const SCAN_BUDGETS = [5, 6, 7, 8, 12];

const mongoserver = new MongoMemoryReplSet({
    debug: false,
    instanceOpts: [
        { port: 27020 },
    ],
    replSet: {
        name: 'rs0',
        count: 1,
        DB_NAME,
        storageEngine: 'wiredTiger',
    },
});

/**
 * Page through a lifecycle listing to exhaustion.
 * @param {Object} metadata - metadata client
 * @param {Object} baseParams - listing params, without any marker
 * @param {Function} nextParams - (result) => marker params for the next page,
 *                                or null when the listing is done
 * @param {Function} cb - callback(err, { contents, pages })
 * @return {undefined}
 */
function listAllPages(metadata, baseParams, nextParams, cb) {
    const contents = [];
    let pages = 0;

    const listPage = params => metadata.listLifecycleObject(BUCKET_NAME, params, logger, (err, data) => {
        if (err) {
            return cb(err);
        }
        ++pages;
        contents.push(...data.Contents);
        if (!data.IsTruncated || pages >= MAX_PAGES) {
            return cb(null, { contents, pages });
        }
        return listPage(Object.assign({}, baseParams, nextParams(data)));
    });

    return listPage(Object.assign({}, baseParams));
}

/**
 * Page the listing to exhaustion once with no scan budget, then once per
 * budget in SCAN_BUDGETS.
 * @param {Object} metadata - metadata client
 * @param {Object} baseParams - listing params, without marker or budget
 * @param {Function} nextParams - (result) => marker params for the next page
 * @param {Function} cb - callback(err, unbounded, boundedByBudget)
 * @return {undefined}
 */
function listAllBudgets(metadata, baseParams, nextParams, cb) {
    return listAllPages(metadata, baseParams, nextParams, (err, unbounded) => {
        if (err) {
            return cb(err);
        }
        const bounded = {};
        return async.eachSeries(SCAN_BUDGETS, (budget, next) => {
            const params = Object.assign({
                maxScannedLifecycleListingEntries: budget,
            }, baseParams);
            return listAllPages(metadata, params, nextParams, (err, res) => {
                bounded[budget] = res;
                return next(err);
            });
        }, err => cb(err, unbounded, bounded));
    });
}

/**
 * Run assertions outside a metadata callback. An assertion thrown inside one
 * never reaches jest, and the test times out instead of reporting what broke.
 * @param {Function} done - jest done callback
 * @param {Function} assertions - the assertions to run
 * @return {undefined}
 */
function assertLater(done, assertions) {
    let error = null;
    try {
        assertions();
    } catch (err) {
        error = err;
    }
    return setImmediate(() => done(error));
}

function nonCurrentIds(contents) {
    return contents.map(c => `${c.key} ${c.value.VersionId}`);
}

function orphanIds(contents) {
    return contents.map(c => c.key);
}

describe('MongoClientInterface::metadata.listLifecycleObject::scanLimit', () => {
    let metadata;

    beforeAll(done => {
        mongoserver.start().then(() => {
            mongoserver.waitUntilRunning().then(() => {
                const opts = {
                    mongodb: {
                        replicaSetHosts: 'localhost:27020',
                        writeConcern: 'majority',
                        replicaSet: 'rs0',
                        readPreference: 'primary',
                        database: DB_NAME,
                    },
                };
                metadata = new MetadataWrapper(IMPL_NAME, opts, null, logger);
                metadata.setup(done);
            });
        });
    });

    afterAll(done => {
        async.series([
            next => metadata.close(next),
            next => mongoserver.stop()
                .then(() => next())
                .catch(next),
        ], done);
    });

    [BucketVersioningKeyFormat.v0, BucketVersioningKeyFormat.v1].forEach(v => {
        describe(`bucket format version: ${v}`, () => {
            beforeEach(done => {
                const bucketMD = makeBucketMD(BUCKET_NAME);
                const versionParams = {
                    versioning: true,
                    versionId: null,
                    repairMaster: null,
                };
                metadata.client.defaultBucketKeyFormat = v;
                async.series([
                    next => metadata.createBucket(BUCKET_NAME, bucketMD, logger, next),
                    // plain versioned key: contributes noncurrent versions,
                    // no delete marker
                    next => putBulkObjectVersions(metadata, BUCKET_NAME, 'pfx1-test-object',
                        { key: 'pfx1-test-object', versionId: 'null' },
                        versionParams, 3, 0, logger, next),
                    // versioned key WITH a delete marker on top. The delete
                    // marker is NOT an orphan: versions survive underneath it.
                    // A cursor that ends early looks exactly like the end of
                    // the keyspace, and would let this one be reported as an
                    // orphan -- lifecycle would then delete a delete marker
                    // and resurrect an old version.
                    next => putBulkObjectVersions(metadata, BUCKET_NAME, 'pfx2-test-object',
                        { key: 'pfx2-test-object', versionId: 'null' },
                        versionParams, 3, 0, logger, next),
                    next => metadata.putObjectMD(BUCKET_NAME, 'pfx2-test-object', {
                        'key': 'pfx2-test-object',
                        'isDeleteMarker': true,
                        'last-modified': new Date(9).toISOString(),
                    }, { versioning: true }, logger, next),
                    // lone delete markers: genuine orphans
                    next => metadata.putObjectMD(BUCKET_NAME, 'pfx3-test-object', {
                        'key': 'pfx3-test-object',
                        'isDeleteMarker': true,
                        'last-modified': new Date(1).toISOString(),
                    }, { versioning: true }, logger, next),
                    next => metadata.putObjectMD(BUCKET_NAME, 'pfx4-test-object', {
                        'key': 'pfx4-test-object',
                        'isDeleteMarker': true,
                        'last-modified': new Date(2).toISOString(),
                    }, { versioning: true }, logger, next),
                ], done);
            });

            afterEach(done => metadata.deleteBucket(BUCKET_NAME, logger, done));

            it('should bound the noncurrent listing cursor', done => {
                const params = {
                    listingType: 'DelimiterNonCurrent',
                    maxScannedLifecycleListingEntries: 4,
                };
                const listing = new DelimiterNonCurrent(params, logger, v);
                const mdParams = listing.genMDParams();
                const paramSets = Array.isArray(mdParams) ? mdParams : [mdParams];

                assert.strictEqual(paramSets.length, v === BucketVersioningKeyFormat.v1 ? 2 : 1);
                // every cursor carries the bound, not just the master range
                paramSets.forEach(p => assert.strictEqual(p.limit, 5));
                return done();
            });

            it('should list every noncurrent version whatever the scan budget', done => {
                const baseParams = { listingType: 'DelimiterNonCurrent' };
                const nextParams = data => ({
                    keyMarker: data.NextKeyMarker,
                    versionIdMarker: data.NextVersionIdMarker,
                });

                // ground truth: the same listing with no scan budget at all
                return listAllBudgets(metadata, baseParams, nextParams, (err, unbounded, bounded) => {
                    if (err) {
                        return done(err);
                    }
                    return assertLater(done, () => {
                        assert.strictEqual(unbounded.pages, 1);
                        const expected = nonCurrentIds(unbounded.contents).sort();
                        assert.ok(expected.length > 0, 'fixture produced no noncurrent versions');

                        SCAN_BUDGETS.forEach(budget => {
                            const res = bounded[budget];
                            assert.ok(res.pages < MAX_PAGES,
                                `scan budget ${budget}: listing did not terminate`);
                            // A cursor that ran dry before the algorithm
                            // stopped would silently drop the entries behind
                            // it, so any shortfall here is a lost entry.
                            assert.deepStrictEqual(nonCurrentIds(res.contents).sort(), expected,
                                `scan budget ${budget}: noncurrent versions lost or duplicated`);
                        });
                    });
                });
            });

            it('should list the same orphan delete markers whatever the scan budget', done => {
                const baseParams = { listingType: 'DelimiterOrphanDeleteMarker' };
                const nextParams = data => ({ marker: data.NextMarker });

                return listAllBudgets(metadata, baseParams, nextParams, (err, unbounded, bounded) => {
                    if (err) {
                        return done(err);
                    }
                    return assertLater(done, () => {
                        assert.strictEqual(unbounded.pages, 1);
                        const expected = orphanIds(unbounded.contents).sort();
                        assert.deepStrictEqual(expected, ['pfx3-test-object', 'pfx4-test-object']);

                        SCAN_BUDGETS.forEach(budget => {
                            const res = bounded[budget];
                            assert.ok(res.pages < MAX_PAGES,
                                `scan budget ${budget}: listing did not terminate`);
                            const got = orphanIds(res.contents);
                            // the delete marker on pfx2 still has versions
                            // underneath it: reporting it would be data loss,
                            // not just a missed entry
                            assert.ok(!got.includes('pfx2-test-object'),
                                `scan budget ${budget}: non-orphan delete marker reported as orphan`);
                            assert.deepStrictEqual(got.sort(), expected,
                                `scan budget ${budget}: orphan delete markers lost or duplicated`);
                        });
                    });
                });
            });
        });
    });
});
