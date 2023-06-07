const assert = require('assert');

const { LifecycleDateTime } = require('../../../lib/s3middleware/lifecycleHelpers');

const oneSecond = 1000; // Milliseconds in a second.
const oneMinute = 60 * oneSecond; // Milliseconds in a minute.
const oneHour = 60 * oneMinute; // Milliseconds in a hour.
const oneDay = 24 * oneHour; // Milliseconds in a day.

// Get the date from the number of minute/second/days given.
function getDate(params) {
    const ageInDays = params.ageInDays || 0;
    const ageInHours = params.ageInHours || 0;
    const ageInMinutes = params.ageInMinutes || 0;
    const ageInS = params.ageInS || 0;
    const ageInMs = params.ageInMs || 0;
    const milliseconds = (ageInDays * oneDay) + (ageInHours * oneHour) + (ageInMinutes * oneMinute) +
    (ageInS * oneSecond) + ageInMs;
    const timestamp = Date.now() - milliseconds;
    return new Date(timestamp);
}

describe('LifecycleDateTime::findDaysSince', () => {
    it('should calculate the number of days since the given date given a time factor to 2', () => {
        const timeFactor = 2;

        const lDateTime = new LifecycleDateTime({
            timeProgressionFactor: timeFactor,
        });
        const ageInDays = 6;
        const date = getDate({ ageInDays });
        const days = lDateTime.findDaysSince(date);

        assert.strictEqual(days, 12);
    });

    it('should calculate the number of days since the given date given a time factor to 24', () => {
        const timeFactor = 24; // 1 day in hours

        const lDateTime = new LifecycleDateTime({
            timeProgressionFactor: timeFactor,
        });
        const ageInHours = 5;
        const date = getDate({ ageInHours });
        const days = lDateTime.findDaysSince(date);

        assert.strictEqual(days, ageInHours);
    });

    it('should calculate the number of days since the given date given a time factor to 24 * 60', () => {
        const timeFactor = 24 * 60; // 1 day in minutes

        const lDateTime = new LifecycleDateTime({
            timeProgressionFactor: timeFactor,
        });
        const ageInMinutes = 5;
        const date = getDate({ ageInMinutes });
        const days = lDateTime.findDaysSince(date);

        assert.strictEqual(days, ageInMinutes);
    });

    it('should calculate the number of days since the given date given a time factor to 1 day in s', () => {
        const timeFactor = 24 * 60 * 60; // 1 day in seconds

        const lDateTime = new LifecycleDateTime({
            timeProgressionFactor: timeFactor,
        });
        const ageInS = 5;
        const date = getDate({ ageInS });
        const days = lDateTime.findDaysSince(date);

        assert.strictEqual(days, ageInS);
    });

    it('should calculate the number of days since the given date given a time factor to 1 day in ms', () => {
        const timeFactor = 24 * 60 * 60 * 1000; // 1 day in milliseconds

        const lDateTime = new LifecycleDateTime({
            timeProgressionFactor: timeFactor,
        });
        const ageInMs = 5;
        const date = getDate({ ageInMs });
        const days = lDateTime.findDaysSince(date);

        assert.strictEqual(days, ageInMs);
    });

    it('should calculate the number of days since the given date given a time factor to 10 days in ms', () => {
        const timeFactor = 24 * 60 * 60 * 1000 * 10; // 10 days in milliseconds

        const lDateTime = new LifecycleDateTime({
            timeProgressionFactor: timeFactor,
        });
        const ageInMs = 5;
        const date = getDate({ ageInMs });
        const days = lDateTime.findDaysSince(date);

        assert.strictEqual(days, ageInMs);
    });
});

describe('LifecycleDateTime::getTransitionTimestamp', () => {
    it('should return timestamp to expedite the transition after 6 days given timeFactor to 0', () => {
        const timeFactor = 0;

        const lDateTime = new LifecycleDateTime({
            timeProgressionFactor: timeFactor,
        });
        const lastModified = '1970-01-01T00:00:00.000Z';
        const transition = {
            Days: 6,
        };
        const transitionTimestamp = lDateTime.getTransitionTimestamp(transition, lastModified);
        const expectedTimestamp = new Date('1970-01-07T00:00:00.000Z').getTime();

        assert.strictEqual(transitionTimestamp, expectedTimestamp);
    });

    it('should return timestamp to expedite the transition after 6 days given timeFactor to undefined', () => {
        const timeFactor = undefined;

        const lDateTime = new LifecycleDateTime({
            timeProgressionFactor: timeFactor,
        });
        const lastModified = '1970-01-01T00:00:00.000Z';
        const transition = {
            Days: 6,
        };
        const transitionTimestamp = lDateTime.getTransitionTimestamp(transition, lastModified);
        const expectedTimestamp = new Date('1970-01-07T00:00:00.000Z').getTime();

        assert.strictEqual(transitionTimestamp, expectedTimestamp);
    });

    it('should return timestamp to expedite the transition after 6 days given timeFactor to 1', () => {
        const timeFactor = 1;

        const lDateTime = new LifecycleDateTime({
            timeProgressionFactor: timeFactor,
        });
        const lastModified = '1970-01-01T00:00:00.000Z';
        const transition = {
            Days: 6,
        };
        const transitionTimestamp = lDateTime.getTransitionTimestamp(transition, lastModified);
        const expectedTimestamp = new Date('1970-01-07T00:00:00.000Z').getTime();

        assert.strictEqual(transitionTimestamp, expectedTimestamp);
    });

    it('should return timestamp to expedite the transition after 3 days given timeFactor to 2', () => {
        const timeFactor = 2;

        const lDateTime = new LifecycleDateTime({
            timeProgressionFactor: timeFactor,
        });
        const lastModified = '1970-01-01T00:00:00.000Z';
        const transition = {
            Days: 6,
        };
        const transitionTimestamp = lDateTime.getTransitionTimestamp(transition, lastModified);
        const expectedTimestamp = new Date('1970-01-04T00:00:00.000Z').getTime();

        assert.strictEqual(transitionTimestamp, expectedTimestamp);
    });

    it('should return timestamp to expedite the transition after 6 hours given timeFactor to 24', () => {
        const timeFactor = 24; // hours in days

        const lDateTime = new LifecycleDateTime({
            timeProgressionFactor: timeFactor,
        });
        const lastModified = '1970-01-01T00:00:00.000Z';
        const transition = {
            Days: 6,
        };
        const transitionTimestamp = lDateTime.getTransitionTimestamp(transition, lastModified);
        const expectedTimestamp = new Date('1970-01-01T06:00:00.000Z').getTime();

        assert.strictEqual(transitionTimestamp, expectedTimestamp);
    });

    it('should return timestamp to expedite the transition after 6 minutes given timeFactor to day in minutes', () => {
        const timeFactor = 24 * 60; // day in minutes

        const lDateTime = new LifecycleDateTime({
            timeProgressionFactor: timeFactor,
        });
        const lastModified = '1970-01-01T00:00:00.000Z';
        const transition = {
            Days: 6,
        };
        const transitionTimestamp = lDateTime.getTransitionTimestamp(transition, lastModified);
        const expectedTimestamp = new Date('1970-01-01T00:06:00.000Z').getTime();

        assert.strictEqual(transitionTimestamp, expectedTimestamp);
    });

    it('should return timestamp to expedite the transition after 6 seconds given timeFactor to day in seconds', () => {
        const timeFactor = 24 * 60 * 60; // 1 day in seconds

        const lDateTime = new LifecycleDateTime({
            timeProgressionFactor: timeFactor,
        });
        const lastModified = '1970-01-01T00:00:00.000Z';
        const transition = {
            Days: 6,
        };
        const transitionTimestamp = lDateTime.getTransitionTimestamp(transition, lastModified);
        const expectedTimestamp = new Date('1970-01-01T00:00:06.000Z').getTime();

        assert.strictEqual(transitionTimestamp, expectedTimestamp);
    });

    it('should return timestamp to expedite the transition after 6 ms given timeFactor to 1 day in ms', () => {
        const timeFactor = 24 * 60 * 60 * 1000; // 1 day in ms

        const lDateTime = new LifecycleDateTime({
            timeProgressionFactor: timeFactor,
        });
        const lastModified = '1970-01-01T00:00:00.000Z';
        const transition = {
            Days: 6,
        };
        const transitionTimestamp = lDateTime.getTransitionTimestamp(transition, lastModified);
        const expectedTimestamp = new Date('1970-01-01T00:00:00.006Z').getTime();

        assert.strictEqual(transitionTimestamp, expectedTimestamp);
    });

    it('should return timestamp to expedite the transition after 6 ms given timeFactor to 10 days in ms', () => {
        const timeFactor = 24 * 60 * 60 * 1000 * 10; // 10 days in ms

        const lDateTime = new LifecycleDateTime({
            timeProgressionFactor: timeFactor,
        });
        const lastModified = '1970-01-01T00:00:00.000Z';
        const transition = {
            Days: 6,
        };
        const transitionTimestamp = lDateTime.getTransitionTimestamp(transition, lastModified);
        const expectedTimestamp = new Date('1970-01-01T00:00:00.006Z').getTime();

        assert.strictEqual(transitionTimestamp, expectedTimestamp);
    });
});

describe('LifecycleDateTime::getNCVTransitionTimestamp', () => {
    it('should return timestamp to expedite the transition after 6 days given timeFactor to 0', () => {
        const timeFactor = 0;

        const lDateTime = new LifecycleDateTime({
            timeProgressionFactor: timeFactor,
        });
        const lastModified = '1970-01-01T00:00:00.000Z';
        const transition = {
            NoncurrentDays: 6,
        };
        const transitionTimestamp = lDateTime.getNCVTransitionTimestamp(transition, lastModified);
        const expectedTimestamp = new Date('1970-01-07T00:00:00.000Z').getTime();

        assert.strictEqual(transitionTimestamp, expectedTimestamp);
    });

    it('should return timestamp to expedite the transition after 6 days given timeFactor to undefined', () => {
        const timeFactor = undefined;

        const lDateTime = new LifecycleDateTime({
            timeProgressionFactor: timeFactor,
        });
        const lastModified = '1970-01-01T00:00:00.000Z';
        const transition = {
            NoncurrentDays: 6,
        };
        const transitionTimestamp = lDateTime.getNCVTransitionTimestamp(transition, lastModified);
        const expectedTimestamp = new Date('1970-01-07T00:00:00.000Z').getTime();

        assert.strictEqual(transitionTimestamp, expectedTimestamp);
    });

    it('should return timestamp to expedite the transition after 6 days given timeFactor to 1', () => {
        const timeFactor = 1;

        const lDateTime = new LifecycleDateTime({
            timeProgressionFactor: timeFactor,
        });
        const lastModified = '1970-01-01T00:00:00.000Z';
        const transition = {
            NoncurrentDays: 6,
        };
        const transitionTimestamp = lDateTime.getNCVTransitionTimestamp(transition, lastModified);
        const expectedTimestamp = new Date('1970-01-07T00:00:00.000Z').getTime();

        assert.strictEqual(transitionTimestamp, expectedTimestamp);
    });

    it('should return timestamp to expedite the transition after 3 days given timeFactor to 2', () => {
        const timeFactor = 2;

        const lDateTime = new LifecycleDateTime({
            timeProgressionFactor: timeFactor,
        });
        const lastModified = '1970-01-01T00:00:00.000Z';
        const transition = {
            NoncurrentDays: 6,
        };
        const transitionTimestamp = lDateTime.getNCVTransitionTimestamp(transition, lastModified);
        const expectedTimestamp = new Date('1970-01-04T00:00:00.000Z').getTime();

        assert.strictEqual(transitionTimestamp, expectedTimestamp);
    });

    it('should return timestamp to expedite the transition after 6 hours given timeFactor to 24', () => {
        const timeFactor = 24; // one day in hours

        const lDateTime = new LifecycleDateTime({
            timeProgressionFactor: timeFactor,
        });
        const lastModified = '1970-01-01T00:00:00.000Z';
        const transition = {
            NoncurrentDays: 6,
        };
        const transitionTimestamp = lDateTime.getNCVTransitionTimestamp(transition, lastModified);
        const expectedTimestamp = new Date('1970-01-01T06:00:00.000Z').getTime();

        assert.strictEqual(transitionTimestamp, expectedTimestamp);
    });

    it('should return timestamp to expedite the transition after 6 minutes given timeFactor to day in minutes', () => {
        const timeFactor = 24 * 60; // one day in minutes

        const lDateTime = new LifecycleDateTime({
            timeProgressionFactor: timeFactor,
        });
        const lastModified = '1970-01-01T00:00:00.000Z';
        const transition = {
            NoncurrentDays: 6,
        };
        const transitionTimestamp = lDateTime.getNCVTransitionTimestamp(transition, lastModified);
        const expectedTimestamp = new Date('1970-01-01T00:06:00.000Z').getTime();

        assert.strictEqual(transitionTimestamp, expectedTimestamp);
    });

    it('should return timestamp to expedite the transition after 6 seconds given timeFactor to day in seconds', () => {
        const timeFactor = 24 * 60 * 60; // 1 day in seconds

        const lDateTime = new LifecycleDateTime({
            timeProgressionFactor: timeFactor,
        });
        const lastModified = '1970-01-01T00:00:00.000Z';
        const transition = {
            NoncurrentDays: 6,
        };
        const transitionTimestamp = lDateTime.getNCVTransitionTimestamp(transition, lastModified);
        const expectedTimestamp = new Date('1970-01-01T00:00:06.000Z').getTime();

        assert.strictEqual(transitionTimestamp, expectedTimestamp);
    });

    it('should return timestamp to expedite the transition after 6 ms given timeFactor to 1 day in ms', () => {
        const timeFactor = 24 * 60 * 60 * 1000; // 1 day in ms

        const lDateTime = new LifecycleDateTime({
            timeProgressionFactor: timeFactor,
        });
        const lastModified = '1970-01-01T00:00:00.000Z';
        const transition = {
            NoncurrentDays: 6,
        };
        const transitionTimestamp = lDateTime.getNCVTransitionTimestamp(transition, lastModified);
        const expectedTimestamp = new Date('1970-01-01T00:00:00.006Z').getTime();

        assert.strictEqual(transitionTimestamp, expectedTimestamp);
    });

    it('should return timestamp to expedite the transition after 6 ms given timeFactor to 10 days in ms', () => {
        const timeFactor = 24 * 60 * 60 * 1000 * 10; // 10 days in ms

        const lDateTime = new LifecycleDateTime({
            timeProgressionFactor: timeFactor,
        });
        const lastModified = '1970-01-01T00:00:00.000Z';
        const transition = {
            NoncurrentDays: 6,
        };
        const transitionTimestamp = lDateTime.getNCVTransitionTimestamp(transition, lastModified);
        const expectedTimestamp = new Date('1970-01-01T00:00:00.006Z').getTime();

        assert.strictEqual(transitionTimestamp, expectedTimestamp);
    });
});
