'use strict'; // eslint-disable-line strict

const assert = require('assert');
const sinon = require('sinon');
const Skip = require('../../../../lib/algos/list/skip');
const {
    FILTER_END,
    FILTER_SKIP,
    SKIP_NONE,
} = require('../../../../lib/algos/list/tools');

describe('Skip Algorithm', () => {
    it('Should fail when listingEnd callback undefined', done => {
        // Skipping algo params
        const extension = {
            filter: () => {},
            skipping: () => {},
        };
        const gte = 'some-other-entry';
        // Initializing skipping algorithm
        const skip = new Skip({ extension, gte });
        const listingEndCb = () => {};
        skip.setListingEndCb(listingEndCb);
        try {
            skip.filter('some-entry');
        } catch (error) {
            assert(error);
        }
        return done();
    });

    it('Should fail when skipRange callback undefined', done => {
        // Skipping algo params
        const extension = {
            filter: () => {},
            skipping: () => {},
        };
        const gte = 'some-other-entry';
        // Initializing skipping algorithm
        const skip = new Skip({ extension, gte });
        const skipRangeCb = () => {};
        skip.setSkipRangeCb(skipRangeCb);
        try {
            skip.filter('some-entry');
        } catch (error) {
            assert(error);
        }
        return done();
    });

    it('Should end listing', done => {
        // Skipping algo params
        const extension = {
            filter: () => FILTER_END,
            skipping: () => {},
        };
        const gte = 'some-other-entry';
        // Setting spy functions
        const listingEndCbSpy = sinon.spy();
        const skipRangeCbSpy = sinon.spy();
        // Initializing skipping algorithm
        const skip = new Skip({ extension, gte });
        skip.setListingEndCb(listingEndCbSpy);
        skip.setSkipRangeCb(skipRangeCbSpy);
        skip.filter('some-entry');
        assert(listingEndCbSpy.calledOnce);
        assert(skipRangeCbSpy.notCalled);
        return done();
    });

    it('Should reset streak length', done => {
        // Skipping algo params
        const extension = {
            filter: () => FILTER_SKIP,
            skipping: () => SKIP_NONE,
        };
        const gte = 'some-other-entry';
        // Setting spy functions
        const listingEndCbSpy = sinon.spy();
        const skipRangeCbSpy = sinon.spy();
        // Initializing skipping algorithm
        const skip = new Skip({ extension, gte });
        skip.setListingEndCb(listingEndCbSpy);
        skip.setSkipRangeCb(skipRangeCbSpy);
        skip.streakLength = 5;
        skip.filter('some-entry');
        assert.strictEqual(skip.streakLength, 0);
        assert(listingEndCbSpy.notCalled);
        assert(skipRangeCbSpy.notCalled);
        return done();
    });

    it('Should not skip range when max steak length not reached', done => {
        // Skipping algo params
        const extension = {
            filter: () => FILTER_SKIP,
            skipping: () => 'entry',
        };
        const gte = 'some-other-entry';
        // Setting spy functions
        const listingEndCbSpy = sinon.spy();
        const skipRangeCbSpy = sinon.spy();
        // Initializing skipping algorithm
        const skip = new Skip({ extension, gte });
        skip.setListingEndCb(listingEndCbSpy);
        skip.setSkipRangeCb(skipRangeCbSpy);
        skip.streakLength = 5;
        skip.filter('some-entry');
        assert.strictEqual(skip.streakLength, 6);
        assert(listingEndCbSpy.notCalled);
        assert(skipRangeCbSpy.notCalled);
        return done();
    });

    it('Should skip range when max steak length reached (v0)', done => {
        // Skipping algo params
        const extension = {
            filter: () => FILTER_SKIP,
            skipping: () => 'entry0',
        };
        const gte = 'some-other-entry';
        // Setting spy functions
        const listingEndCbSpy = sinon.spy();
        const skipRangeCbSpy = sinon.spy();
        // Initializing skipping algorithm
        const skip = new Skip({ extension, gte });
        skip.setListingEndCb(listingEndCbSpy);
        skip.setSkipRangeCb(skipRangeCbSpy);
        // max streak length is 100
        skip.streakLength = 110;
        skip.filter('some-entry');
        assert(listingEndCbSpy.notCalled);
        assert(skipRangeCbSpy.calledOnceWith('entry1'));
        return done();
    });

    it('Should skip range when max steak length reached (v1)', done => {
        // Skipping algo params
        const extension = {
            filter: () => FILTER_SKIP,
            skipping: () => ['first-entry-0', 'second-entry-0'],
        };
        const gte = 'some-other-entry';
        // Setting spy functions
        const listingEndCbSpy = sinon.spy();
        const skipRangeCbSpy = sinon.spy();
        // Initializing skipping algorithm
        const skip = new Skip({ extension, gte });
        skip.setListingEndCb(listingEndCbSpy);
        skip.setSkipRangeCb(skipRangeCbSpy);
        // max streak length is 100
        skip.streakLength = 110;
        skip.filter('some-entry');
        assert(listingEndCbSpy.notCalled);
        assert(skipRangeCbSpy.calledOnceWith(['first-entry-1', 'second-entry-1']));
        return done();
    });

    it('Should set streak lenght to 1', done => {
        // Skipping algo params
        const extension = {
            filter: () => FILTER_SKIP,
            skipping: () => 'entry-0',
        };
        const gte = 'entry-1';
        // Setting spy functions
        const listingEndCbSpy = sinon.spy();
        const skipRangeCbSpy = sinon.spy();
        // Initializing skipping algorithm
        const skip = new Skip({ extension, gte });
        skip.setListingEndCb(listingEndCbSpy);
        skip.setSkipRangeCb(skipRangeCbSpy);
        // max streak length is 100
        skip.streakLength = 110;
        skip.filter('some-entry');
        assert.strictEqual(skip.streakLength, 1);
        assert(listingEndCbSpy.notCalled);
        assert(skipRangeCbSpy.notCalled);
        return done();
    });
});
