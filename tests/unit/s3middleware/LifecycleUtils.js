const assert = require('assert');

const LifecycleRule = require('../../../lib/models/LifecycleRule');
const { LifecycleUtils } = require('../../../lib/s3middleware/lifecycleHelpers');

// 5 days prior to CURRENT
const PAST = new Date(2018, 1, 5);
const CURRENT = new Date(2018, 1, 10);
// 5 days after CURRENT
const FUTURE = new Date(2018, 1, 15);

// Get the date from the number of days given.
function getDate(params) {
    const numberOfDaysFromNow = params.numberOfDaysFromNow || 0;
    const oneDay = 24 * 60 * 60 * 1000; // Milliseconds in a day.
    const milliseconds = numberOfDaysFromNow * oneDay;
    const timestamp = Date.now() + milliseconds;
    return new Date(timestamp);
}

// Get the metadata object.
function getMetadataObject(lastModified, storageClass) {
    return {
        LastModified: lastModified,
        StorageClass: storageClass || 'STANDARD',
    };
}

// get all rule ID's
function getRuleIDs(rules) {
    return rules.map(rule => rule.ID).sort();
}

describe('LifecycleUtils::getApplicableRules', () => {
    let lutils;

    before(() => {
        lutils = new LifecycleUtils([
            'expiration',
            'noncurrentVersionExpiration',
            'abortIncompleteMultipartUpload',
            'transitions',
        ]);
    });

    it('should return earliest applicable expirations', () => {
        const filteredRules = [
            new LifecycleRule().addID('task-1').addExpiration('Date', FUTURE)
                .build(),
            new LifecycleRule().addID('task-2').addExpiration('Days', 10).build(),
            new LifecycleRule().addID('task-3').addExpiration('Date', PAST)
                .build(),
            new LifecycleRule().addID('task-4').addExpiration('Date', CURRENT)
                .build(),
            new LifecycleRule().addID('task-5').addExpiration('Days', 5).build(),
        ];

        const res1 = lutils.getApplicableRules(filteredRules);
        assert.strictEqual(res1.Expiration.Date, PAST);
        assert.strictEqual(res1.Expiration.Days, 5);

        // remove `PAST` from rules
        filteredRules.splice(2, 1);
        const res2 = lutils.getApplicableRules(filteredRules);
        assert.strictEqual(res2.Expiration.Date, CURRENT);
    });

    it('should return earliest applicable rules', () => {
        const filteredRules = [
            new LifecycleRule().addID('task-1').addExpiration('Date', FUTURE)
                .build(),
            new LifecycleRule().addID('task-2').addAbortMPU(18).build(),
            new LifecycleRule().addID('task-3').addExpiration('Date', PAST)
                .build(),
            new LifecycleRule().addID('task-4').addNCVExpiration(3).build(),
            new LifecycleRule().addID('task-5').addNCVExpiration(12).build(),
            new LifecycleRule().addID('task-6').addExpiration('Date', CURRENT)
                .build(),
            new LifecycleRule().addID('task-7').addNCVExpiration(7).build(),
            new LifecycleRule().addID('task-8').addAbortMPU(4).build(),
            new LifecycleRule().addID('task-9').addAbortMPU(22).build(),
        ];

        const res = lutils.getApplicableRules(filteredRules);
        assert.deepStrictEqual(Object.keys(res.Expiration), ['ID', 'Date']);
        assert.deepStrictEqual(res.Expiration, { ID: 'task-3', Date: PAST });
        assert.strictEqual(
            res.AbortIncompleteMultipartUpload.DaysAfterInitiation, 4);
        assert.strictEqual(
            res.NoncurrentVersionExpiration.NoncurrentDays, 3);
    });

    it('should return Transition with Days', () => {
        const applicableRules = [
            new LifecycleRule()
                .addTransitions([
                    {
                        Days: 1,
                        StorageClass: 'zenko',
                    },
                ])
                .build(),
        ];
        const lastModified = getDate({ numberOfDaysFromNow: -2 });
        const object = getMetadataObject(lastModified);
        const rules = lutils.getApplicableRules(applicableRules, object);
        assert.deepStrictEqual(rules, {
            Transition: {
                Days: 1,
                StorageClass: 'zenko',
            },
        });
    });

    it('should return Transition when multiple rule transitions', () => {
        const applicableRules = [
            new LifecycleRule()
                .addTransitions([
                    {
                        Days: 1,
                        StorageClass: 'zenko-1',
                    },
                    {
                        Days: 3,
                        StorageClass: 'zenko-3',
                    },
                ])
                .build(),
        ];
        const lastModified = getDate({ numberOfDaysFromNow: -4 });
        const object = getMetadataObject(lastModified);
        const rules = lutils.getApplicableRules(applicableRules, object);
        assert.deepStrictEqual(rules, {
            Transition: {
                Days: 3,
                StorageClass: 'zenko-3',
            },
        });
    });

    it('should return Transition with Date', () => {
        const applicableRules = [
            new LifecycleRule()
                .addTransitions([{
                    Date: 0,
                    StorageClass: 'zenko',
                }])
                .build(),
        ];
        const lastModified = getDate({ numberOfDaysFromNow: -1 });
        const object = getMetadataObject(lastModified);
        const rules = lutils.getApplicableRules(applicableRules, object);
        assert.deepStrictEqual(rules, {
            Transition: {
                Date: 0,
                StorageClass: 'zenko',
            },
        });
    });

    it('should return Transition across many rules: first rule', () => {
        const applicableRules = [
            new LifecycleRule()
                .addTransitions([{
                    Days: 1,
                    StorageClass: 'zenko-1',
                }])
                .build(),
            new LifecycleRule()
                .addTransitions([{
                    Days: 3,
                    StorageClass: 'zenko-3',
                }])
                .build(),
        ];
        const lastModified = getDate({ numberOfDaysFromNow: -2 });
        const object = getMetadataObject(lastModified);
        const rules = lutils.getApplicableRules(applicableRules, object);
        assert.deepStrictEqual(rules, {
            Transition: {
                Days: 1,
                StorageClass: 'zenko-1',
            },
        });
    });

    it('should return Transition across many rules: second rule', () => {
        const applicableRules = [
            new LifecycleRule()
                .addTransitions([{
                    Days: 1,
                    StorageClass: 'zenko-1',
                }])
                .build(),
            new LifecycleRule()
                .addTransitions([{
                    Days: 3,
                    StorageClass: 'zenko-3',
                }])
                .build(),
        ];
        const lastModified = getDate({ numberOfDaysFromNow: -4 });
        const object = getMetadataObject(lastModified);
        const rules = lutils.getApplicableRules(applicableRules, object);
        assert.deepStrictEqual(rules, {
            Transition: {
                Days: 3,
                StorageClass: 'zenko-3',
            },
        });
    });

    it('should return Transition across many rules: first rule with ' +
    'multiple transitions', () => {
        const applicableRules = [
            new LifecycleRule()
                .addTransitions([{
                    Days: 1,
                    StorageClass: 'zenko-1',
                }, {
                    Days: 3,
                    StorageClass: 'zenko-3',
                }])
                .build(),
            new LifecycleRule()
                .addTransitions([{
                    Days: 4,
                    StorageClass: 'zenko-4',
                }])
                .build(),
        ];
        const lastModified = getDate({ numberOfDaysFromNow: -2 });
        const object = getMetadataObject(lastModified);
        const rules = lutils.getApplicableRules(applicableRules, object);
        assert.deepStrictEqual(rules, {
            Transition: {
                Days: 1,
                StorageClass: 'zenko-1',
            },
        });
    });

    it('should return Transition across many rules: second rule with ' +
    'multiple transitions', () => {
        const applicableRules = [
            new LifecycleRule()
                .addTransitions([{
                    Days: 1,
                    StorageClass: 'zenko-1',
                }, {
                    Days: 3,
                    StorageClass: 'zenko-3',
                }])
                .build(),
            new LifecycleRule()
                .addTransitions([{
                    Days: 4,
                    StorageClass: 'zenko-4',
                }, {
                    Days: 6,
                    StorageClass: 'zenko-6',
                }])
                .build(),
        ];
        const lastModified = getDate({ numberOfDaysFromNow: -5 });
        const object = getMetadataObject(lastModified);
        const rules = lutils.getApplicableRules(applicableRules, object);
        assert.deepStrictEqual(rules, {
            Transition: {
                Days: 4,
                StorageClass: 'zenko-4',
            },
        });
    });

    it('should return Transition across many rules: combination of Date ' +
    'and Days gets Date result', () => {
        const applicableDate = getDate({ numberOfDaysFromNow: -1 });
        const applicableRules = [
            new LifecycleRule()
                .addTransitions([{
                    Days: 1,
                    StorageClass: 'zenko-1',
                }])
                .build(),
            new LifecycleRule()
                .addTransitions([{
                    Date: applicableDate,
                    StorageClass: 'zenko-3',
                }])
                .build(),
        ];
        const lastModified = getDate({ numberOfDaysFromNow: -4 });
        const object = getMetadataObject(lastModified);
        const rules = lutils.getApplicableRules(applicableRules, object);
        assert.deepStrictEqual(rules, {
            Transition: {
                Date: applicableDate,
                StorageClass: 'zenko-3',
            },
        });
    });

    it('should return Transition across many rules: combination of Date ' +
    'and Days gets Days result', () => {
        const applicableRules = [
            new LifecycleRule()
                .addTransitions([{
                    Days: 3,
                    StorageClass: 'zenko-1',
                }])
                .build(),
            new LifecycleRule()
                .addTransitions([{
                    Date: getDate({ numberOfDaysFromNow: -4 }),
                    StorageClass: 'zenko-3',
                }])
                .build(),
        ];
        const lastModified = getDate({ numberOfDaysFromNow: -4 });
        const object = getMetadataObject(lastModified);
        const rules = lutils.getApplicableRules(applicableRules, object);
        assert.deepStrictEqual(rules, {
            Transition: {
                Days: 3,
                StorageClass: 'zenko-1',
            },
        });
    });

    it('should not return transition when Transitions has no applicable ' +
    'rule: Days', () => {
        const applicableRules = [
            new LifecycleRule()
                .addTransitions([
                    {
                        Days: 3,
                        StorageClass: 'zenko',
                    },
                ])
                .build(),
        ];
        const lastModified = getDate({ numberOfDaysFromNow: -2 });
        const object = getMetadataObject(lastModified);
        const rules = lutils.getApplicableRules(applicableRules, object);
        assert.strictEqual(rules.Transition, undefined);
    });

    it('should not return transition when Transitions has no applicable ' +
    'rule: Date', () => {
        const applicableRules = [
            new LifecycleRule()
                .addTransitions([{
                    Date: new Date(getDate({ numberOfDaysFromNow: 1 })),
                    StorageClass: 'zenko',
                }])
                .build(),
        ];
        const lastModified = getDate({ numberOfDaysFromNow: 0 });
        const object = getMetadataObject(lastModified);
        const rules = lutils.getApplicableRules(applicableRules, object);
        assert.strictEqual(rules.Transition, undefined);
    });

    it('should not return transition when Transitions is an empty ' +
    'array', () => {
        const applicableRules = [
            new LifecycleRule()
                .addTransitions([])
                .build(),
        ];
        const rules = lutils.getApplicableRules(applicableRules, {});
        assert.strictEqual(rules.Transition, undefined);
    });

    it('should not return transition when Transitions is undefined', () => {
        const applicableRules = [
            new LifecycleRule()
                .addExpiration('Days', 1)
                .build(),
        ];
        const rules = lutils.getApplicableRules(applicableRules, {});
        assert.strictEqual(rules.Transition, undefined);
    });

    describe('transitioning to the same storage class', () => {
        it('should not return transition when applicable transition is ' +
        'already stored at the destination', () => {
            const applicableRules = [
                new LifecycleRule()
                    .addTransitions([
                        {
                            Days: 1,
                            StorageClass: 'zenko',
                        },
                    ])
                    .build(),
            ];
            const lastModified = getDate({ numberOfDaysFromNow: -2 });
            const object = getMetadataObject(lastModified, 'zenko');
            const rules = lutils.getApplicableRules(applicableRules, object);
            assert.strictEqual(rules.Transition, undefined);
        });

        it('should not return transition when applicable transition is ' +
        'already stored at the destination: multiple rules', () => {
            const applicableRules = [
                new LifecycleRule()
                    .addTransitions([
                        {
                            Days: 2,
                            StorageClass: 'zenko',
                        },
                    ])
                    .build(),
                new LifecycleRule()
                    .addTransitions([
                        {
                            Days: 1,
                            StorageClass: 'STANDARD',
                        },
                    ])
                    .build(),
            ];
            const lastModified = getDate({ numberOfDaysFromNow: -3 });
            const object = getMetadataObject(lastModified, 'zenko');
            const rules = lutils.getApplicableRules(applicableRules, object);
            assert.strictEqual(rules.Transition, undefined);
        });
    });
});


describe('LifecycleUtils::filterRules', () => {
    let lutils;

    before(() => {
        lutils = new LifecycleUtils();
    });

    it('should filter out Status disabled rules', () => {
        const mBucketRules = [
            new LifecycleRule().addID('task-1').build(),
            new LifecycleRule().addID('task-2').disable().build(),
            new LifecycleRule().addID('task-3').build(),
            new LifecycleRule().addID('task-4').build(),
            new LifecycleRule().addID('task-2').disable().build(),
        ];
        const item = {
            Key: 'example-item',
            LastModified: PAST,
        };
        const objTags = { TagSet: [] };

        const res = lutils.filterRules(mBucketRules, item, objTags);
        const expected = mBucketRules.filter(rule =>
            rule.Status === 'Enabled');
        assert.deepStrictEqual(getRuleIDs(res), getRuleIDs(expected));
    });

    it('should filter out unmatched prefixes', () => {
        const mBucketRules = [
            new LifecycleRule().addID('task-1').addPrefix('atask/').build(),
            new LifecycleRule().addID('task-2').addPrefix('atasker/').build(),
            new LifecycleRule().addID('task-3').addPrefix('cat-').build(),
            new LifecycleRule().addID('task-4').addPrefix('xatask/').build(),
            new LifecycleRule().addID('task-5').addPrefix('atask').build(),
            new LifecycleRule().addID('task-6').addPrefix('Atask/').build(),
            new LifecycleRule().addID('task-7').addPrefix('atAsk/').build(),
            new LifecycleRule().addID('task-8').build(),
        ];
        const item1 = {
            Key: 'atask/example-item',
            LastModified: CURRENT,
        };
        const item2 = {
            Key: 'cat-test',
            LastModified: CURRENT,
        };
        const objTags = { TagSet: [] };

        const res1 = lutils.filterRules(mBucketRules, item1, objTags);
        assert.strictEqual(res1.length, 3);
        const expRes1 = getRuleIDs(mBucketRules.filter(rule => {
            if (!rule.Filter || !rule.Filter.Prefix) {
                return true;
            }
            if (item1.Key.startsWith(rule.Filter.Prefix)) {
                return true;
            }
            return false;
        }));
        assert.deepStrictEqual(expRes1, getRuleIDs(res1));

        const res2 = lutils.filterRules(mBucketRules, item2, objTags);
        assert.strictEqual(res2.length, 2);
        const expRes2 = getRuleIDs(mBucketRules.filter(rule =>
            (rule.Filter && rule.Filter.Prefix && rule.Filter.Prefix.startsWith('cat-'))
            || (!rule.Filter || !rule.Filter.Prefix)));
        assert.deepStrictEqual(expRes2, getRuleIDs(res2));
    });

    it('should filter out unmatched single tags', () => {
        const mBucketRules = [
            new LifecycleRule().addID('task-1').addTag('tag1', 'val1').build(),
            new LifecycleRule().addID('task-2').addTag('tag3-1', 'val3')
                .addTag('tag3-2', 'val3').build(),
            new LifecycleRule().addID('task-3').addTag('tag3-1', 'val3').build(),
            new LifecycleRule().addID('task-4').addTag('tag1', 'val1').build(),
            new LifecycleRule().addID('task-5').addTag('tag3-2', 'val3')
                .addTag('tag3-1', 'false').build(),
            new LifecycleRule().addID('task-6').addTag('tag3-2', 'val3')
                .addTag('tag3-1', 'val3').build(),
        ];
        const item = {
            Key: 'example-item',
            LastModified: CURRENT,
        };
        const objTags1 = { TagSet: [{ Key: 'tag1', Value: 'val1' }] };
        const res1 = lutils.filterRules(mBucketRules, item, objTags1);
        assert.strictEqual(res1.length, 2);
        const expRes1 = getRuleIDs(mBucketRules.filter(rule =>
            (rule.Filter && rule.Filter.Tag &&
            rule.Filter.Tag.Key === 'tag1' &&
            rule.Filter.Tag.Value === 'val1')
        ));
        assert.deepStrictEqual(expRes1, getRuleIDs(res1));

        const objTags2 = { TagSet: [{ Key: 'tag3-1', Value: 'val3' }] };
        const res2 = lutils.filterRules(mBucketRules, item, objTags2);
        assert.strictEqual(res2.length, 1);
        const expRes2 = getRuleIDs(mBucketRules.filter(rule =>
            rule.Filter && rule.Filter.Tag &&
            rule.Filter.Tag.Key === 'tag3-1' &&
            rule.Filter.Tag.Value === 'val3'
        ));
        assert.deepStrictEqual(expRes2, getRuleIDs(res2));
    });

    it('should filter out unmatched multiple tags', () => {
        const mBucketRules = [
            new LifecycleRule().addID('task-1').addTag('tag1', 'val1')
                .addTag('tag2', 'val1').build(),
            new LifecycleRule().addID('task-2').addTag('tag1', 'val1').build(),
            new LifecycleRule().addID('task-3').addTag('tag2', 'val1').build(),
            new LifecycleRule().addID('task-4').addTag('tag2', 'false').build(),
            new LifecycleRule().addID('task-5').addTag('tag2', 'val1')
                .addTag('tag1', 'false').build(),
            new LifecycleRule().addID('task-6').addTag('tag2', 'val1')
                .addTag('tag1', 'val1').build(),
            new LifecycleRule().addID('task-7').addTag('tag2', 'val1')
                .addTag('tag1', 'val1').addTag('tag3', 'val1').build(),
            new LifecycleRule().addID('task-8').addTag('tag2', 'val1')
                .addTag('tag1', 'val1').addTag('tag3', 'false').build(),
            new LifecycleRule().addID('task-9').build(),
        ];
        const item = {
            Key: 'example-item',
            LastModified: CURRENT,
        };
        const objTags1 = { TagSet: [
            { Key: 'tag1', Value: 'val1' },
            { Key: 'tag2', Value: 'val1' },
        ] };
        const res1 = lutils.filterRules(mBucketRules, item, objTags1);
        assert.strictEqual(res1.length, 5);
        assert.deepStrictEqual(getRuleIDs(res1), ['task-1', 'task-2',
            'task-3', 'task-6', 'task-9']);

        const objTags2 = { TagSet: [
            { Key: 'tag2', Value: 'val1' },
        ] };
        const res2 = lutils.filterRules(mBucketRules, item, objTags2);
        assert.strictEqual(res2.length, 2);
        assert.deepStrictEqual(getRuleIDs(res2), ['task-3', 'task-9']);

        const objTags3 = { TagSet: [
            { Key: 'tag2', Value: 'val1' },
            { Key: 'tag1', Value: 'val1' },
            { Key: 'tag3', Value: 'val1' },
        ] };
        const res3 = lutils.filterRules(mBucketRules, item, objTags3);
        assert.strictEqual(res3.length, 6);
        assert.deepStrictEqual(getRuleIDs(res3), ['task-1', 'task-2',
            'task-3', 'task-6', 'task-7', 'task-9']);
    });

    it('should filter correctly for an object with no tags', () => {
        const mBucketRules = [
            new LifecycleRule().addID('task-1').addTag('tag1', 'val1')
                .addTag('tag2', 'val1').build(),
            new LifecycleRule().addID('task-2').addTag('tag1', 'val1').build(),
            new LifecycleRule().addID('task-3').addTag('tag2', 'val1').build(),
            new LifecycleRule().addID('task-4').addTag('tag2', 'false').build(),
            new LifecycleRule().addID('task-5').addTag('tag2', 'val1')
                .addTag('tag1', 'false').build(),
            new LifecycleRule().addID('task-6').addTag('tag2', 'val1')
                .addTag('tag1', 'val1').build(),
            new LifecycleRule().addID('task-7').addTag('tag2', 'val1')
                .addTag('tag1', 'val1').addTag('tag3', 'val1').build(),
            new LifecycleRule().addID('task-8').addTag('tag2', 'val1')
                .addTag('tag1', 'val1').addTag('tag3', 'false').build(),
            new LifecycleRule().addID('task-9').build(),
        ];
        const item = {
            Key: 'example-item',
            LastModified: CURRENT,
        };
        const objTags = { TagSet: [] };
        const objNoTagSet = {};
        [objTags, objNoTagSet].forEach(obj => {
            const res = lutils.filterRules(mBucketRules, item, obj);
            assert.strictEqual(res.length, 1);
            assert.deepStrictEqual(getRuleIDs(res), ['task-9']);
        });
    });
});

describe('LifecycleUtils::getApplicableTransition', () => {
    let lutils;

    before(() => {
        lutils = new LifecycleUtils();
    });

    describe('using Days time type', () => {
        it('should return undefined if no rules given', () => {
            const result = lutils.getApplicableTransition({
                transitions: [],
                currentDate: '1970-01-03T00:00:00.000Z',
                lastModified: '1970-01-01T00:00:00.000Z',
                store: {},
            });
            assert.deepStrictEqual(result, undefined);
        });

        it('should return undefined when no rule applies', () => {
            const result = lutils.getApplicableTransition({
                transitions: [
                    {
                        Days: 1,
                        StorageClass: 'zenko',
                    },
                ],
                currentDate: '1970-01-01T23:59:59.999Z',
                lastModified: '1970-01-01T00:00:00.000Z',
                store: {},
            });
            assert.deepStrictEqual(result, undefined);
        });

        it('should return a single rule if it applies', () => {
            const result = lutils.getApplicableTransition({
                transitions: [
                    {
                        Days: 1,
                        StorageClass: 'zenko',
                    },
                ],
                currentDate: '1970-01-02T00:00:00.000Z',
                lastModified: '1970-01-01T00:00:00.000Z',
                store: {},
            });
            const expected = {
                Days: 1,
                StorageClass: 'zenko',
            };
            assert.deepStrictEqual(result, expected);
        });

        it('should return the most applicable rule: last rule', () => {
            const result = lutils.getApplicableTransition({
                transitions: [
                    {
                        Days: 1,
                        StorageClass: 'zenko',
                    },
                    {
                        Days: 10,
                        StorageClass: 'zenko',
                    },
                ],
                currentDate: '1970-01-11T00:00:00.000Z',
                lastModified: '1970-01-01T00:00:00.000Z',
                store: {},
            });
            const expected = {
                Days: 10,
                StorageClass: 'zenko',
            };
            assert.deepStrictEqual(result, expected);
        });

        it('should return the most applicable rule: middle rule', () => {
            const result = lutils.getApplicableTransition({
                transitions: [
                    {
                        Days: 1,
                        StorageClass: 'zenko',
                    },
                    {
                        Days: 4,
                        StorageClass: 'zenko',
                    },
                    {
                        Days: 10,
                        StorageClass: 'zenko',
                    },
                ],
                currentDate: '1970-01-05T00:00:00.000Z',
                lastModified: '1970-01-01T00:00:00.000Z',
                store: {},
            });
            const expected = {
                Days: 4,
                StorageClass: 'zenko',
            };
            assert.deepStrictEqual(result, expected);
        });
    });

    describe('using Date time type', () => {
        it('should return undefined if no rules given', () => {
            const result = lutils.getApplicableTransition({
                transitions: [],
                currentDate: '1970-01-03T00:00:00.000Z',
                lastModified: '1970-01-01T00:00:00.000Z',
                store: {},
            });
            assert.deepStrictEqual(result, undefined);
        });

        it('should return undefined when no rule applies', () => {
            const result = lutils.getApplicableTransition({
                transitions: [
                    {
                        Date: '1970-01-02T00:00:00.000Z',
                        StorageClass: 'zenko',
                    },
                ],
                currentDate: '1970-01-01T23:59:59.999Z',
                lastModified: '1970-01-01T00:00:00.000Z',
                store: {},
            });
            assert.deepStrictEqual(result, undefined);
        });

        it('should return a single rule if it applies', () => {
            const result = lutils.getApplicableTransition({
                transitions: [
                    {
                        Date: '1970-01-02T00:00:00.000Z',
                        StorageClass: 'zenko',
                    },
                ],
                currentDate: '1970-01-02T00:00:00.000Z',
                lastModified: '1970-01-01T00:00:00.000Z',
                store: {},
            });
            const expected = {
                Date: '1970-01-02T00:00:00.000Z',
                StorageClass: 'zenko',
            };
            assert.deepStrictEqual(result, expected);
        });

        it('should return the most applicable rule', () => {
            const result = lutils.getApplicableTransition({
                transitions: [
                    {
                        Date: '1970-01-02T00:00:00.000Z',
                        StorageClass: 'zenko',
                    },
                    {
                        Date: '1970-01-10T00:00:00.000Z',
                        StorageClass: 'zenko',
                    },
                ],
                currentDate: '1970-01-11T00:00:00.000Z',
                lastModified: '1970-01-01T00:00:00.000Z',
                store: {},
            });
            const expected = {
                Date: '1970-01-10T00:00:00.000Z',
                StorageClass: 'zenko',
            };
            assert.deepStrictEqual(result, expected);
        });
    });
});

describe('LifecycleUtils::compareTransitions', () => {
    let lutils;

    before(() => {
        lutils = new LifecycleUtils();
    });

    it('should return undefined if no rules given', () => {
        const result = lutils.compareTransitions({ });
        assert.strictEqual(result, undefined);
    });

    it('should return first rule if second rule is not given', () => {
        const transition1 = {
            Days: 1,
            StorageClass: 'zenko',
        };
        const result = lutils.compareTransitions({ transition1 });
        assert.deepStrictEqual(result, transition1);
    });

    it('should return second rule if first rule is not given', () => {
        const transition2 = {
            Days: 1,
            StorageClass: 'zenko',
        };
        const result = lutils.compareTransitions({ transition2 });
        assert.deepStrictEqual(result, transition2);
    });

    it('should return the first rule if older than the second rule', () => {
        const transition1 = {
            Days: 2,
            StorageClass: 'zenko',
        };
        const transition2 = {
            Days: 1,
            StorageClass: 'zenko',
        };
        const result = lutils.compareTransitions({
            transition1,
            transition2,
            lastModified: '1970-01-01T00:00:00.000Z',
        });
        assert.deepStrictEqual(result, transition1);
    });

    it('should return the second rule if older than the first rule', () => {
        const transition1 = {
            Days: 1,
            StorageClass: 'zenko',
        };
        const transition2 = {
            Days: 2,
            StorageClass: 'zenko',
        };
        const result = lutils.compareTransitions({
            transition1,
            transition2,
            lastModified: '1970-01-01T00:00:00.000Z',
        });
        assert.deepStrictEqual(result, transition2);
    });
});

