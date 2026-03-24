'use strict'; // eslint-disable-line strict

const assert = require('assert');
const fakeTimers = require('@sinonjs/fake-timers');

const {
    checkTimeSkew,
    convertAmzTimeToMs,
    convertUTCtoISO8601,
    parseISO8601Compact,
} = require('../../../../lib/auth/v4/timeUtils');

const DummyRequestLogger = require('../../helpers').DummyRequestLogger;

const log = new DummyRequestLogger();

describe('convertAmzTimeToMs function', () => {
    it('should convert ISO8601Timestamp format without ' +
    'dashes or colons, e.g. 20160202T220410Z to milliseconds since ' +
    'Unix epoch', () => {
        const input = '20160202T220410Z';
        const expectedOutput = 1454450650000;
        const actualOutput = convertAmzTimeToMs(input);
        assert.strictEqual(actualOutput, expectedOutput);
    });
});

describe('convertUTCtoISO8601 function', () => {
    [
        {
            name: 'should convert UTC string to ISO8601',
            input: 'Sun, 08 Feb 2015 20:14:05 GMT',
            expected: '20150208T201405Z',
        },
        {
            name: 'should convert Unix timestamp to ISO8601',
            input: Date.UTC(2015, 1, 8, 20, 14, 5),
            expected: '20150208T201405Z',
        },
        {
            name: 'should handle ISO8601 string with dashes/colons',
            input: '2016-02-08T20:14:05Z',
            expected: '20160208T201405Z',
        },
        { name: 'should return undefined for invalid string', input: 'invalid date string', expected: undefined },
        { name: 'should return undefined for compact ISO8601 input', input: '20160208T201405Z', expected: undefined },
        { name: 'should return undefined for null', input: null, expected: undefined },
        { name: 'should return undefined for undefined', input: undefined, expected: undefined },
        { name: 'should return undefined for NaN', input: NaN, expected: undefined },
        { name: 'should return undefined for object', input: {}, expected: undefined },
    ].forEach(t => it(t.name, () => {
        assert.strictEqual(convertUTCtoISO8601(t.input), t.expected);
    }));
});

describe('parseISO8601Compact function', () => {
    [
        { name: 'should return a Date for valid ISO8601 compact format', input: '20160208T201405Z', expected: new Date('2016-02-08T20:14:05Z') },
        { name: 'should return a Date for valid timestamp with zeros', input: '20200101T000000Z', expected: new Date('2020-01-01T00:00:00Z') },
        { name: 'should return a Date for valid timestamp at end of day', input: '20201231T235959Z', expected: new Date('2020-12-31T23:59:59Z') },
        { name: 'should return a Date for leap year Feb 29', input: '20200229T120000Z', expected: new Date('2020-02-29T12:00:00Z') },
        { name: 'should return a Date for pre-epoch date (1950)', input: '19500707T215304Z', expected: new Date('1950-07-07T21:53:04Z') },
        { name: 'should return a Date for pre-epoch date (1969)', input: '19691231T235959Z', expected: new Date('1969-12-31T23:59:59Z') },
        { name: 'should return a Date for Unix epoch start (1970)', input: '19700101T000000Z', expected: new Date('1970-01-01T00:00:00Z') },
        { name: 'should return undefined for string with wrong length', input: '2016020T201405Z', expected: undefined },
        { name: 'should return undefined for ISO8601 with dashes/colons', input: '2016-02-08T20:14:05Z', expected: undefined },
        { name: 'should return undefined for missing T separator', input: '20160208 201405Z', expected: undefined },
        { name: 'should return undefined for missing Z suffix', input: '20160208T201405', expected: undefined },
        { name: 'should return undefined for string with letters in date', input: 'abcd0208T201405Z', expected: undefined },
        { name: 'should return undefined for empty string', input: '', expected: undefined },
        { name: 'should return undefined for invalid month (13)', input: '20161308T201405Z', expected: undefined },
        { name: 'should return undefined for invalid day (32)', input: '20160232T201405Z', expected: undefined },
        { name: 'should return undefined for Feb 30 (invalid)', input: '20160230T201405Z', expected: undefined },
        { name: 'should return undefined for Feb 29 in non-leap year', input: '20190229T201405Z', expected: undefined },
        { name: 'should return undefined for invalid hour (25)', input: '20160208T251405Z', expected: undefined },
        { name: 'should return undefined for invalid minute (60)', input: '20160208T206005Z', expected: undefined },
        { name: 'should return undefined for invalid second (60)', input: '20160208T201460Z', expected: undefined },
        { name: 'should return undefined for month 00', input: '20160008T201405Z', expected: undefined },
        { name: 'should return undefined for day 00', input: '20160200T201405Z', expected: undefined },
        { name: 'should return undefined for null', input: null, expected: undefined },
        { name: 'should return undefined for undefined', input: undefined, expected: undefined },
        { name: 'should return undefined for number', input: 20160208201405, expected: undefined },
        { name: 'should return undefined for object', input: {}, expected: undefined },
        { name: 'should return undefined for array', input: [], expected: undefined },
    ].forEach(t => it(t.name, () => {
        const result = parseISO8601Compact(t.input);
        if (t.expected instanceof Date) {
            assert.ok(result instanceof Date, `expected Date, got ${result}`);
            assert.strictEqual(result.getTime(), t.expected.getTime());
        } else {
            assert.strictEqual(result, undefined);
        }
    }));
});

describe('checkTimeSkew function', () => {
    let clock;
    beforeAll(() => {
        // Time is 2016-03-17T18:22:01.033Z
        clock = fakeTimers.install({ now: 1458238921033 });
    });
    afterAll(() => {
        clock.uninstall();
    });

    // Our default expiry for header auth check is 15 minutes (in secs)
    const expiry = (15 * 60);
    it('should allow requests with timestamps under 15 minutes ' +
        'in the future', () => {
        const timestamp14MinInFuture = '20160317T183601033Z';
        const expectedOutput = false;
        const actualOutput = checkTimeSkew(timestamp14MinInFuture,
            expiry, log);
        assert.strictEqual(actualOutput, expectedOutput);
    });

    it('should not allow requests with timestamps more than 15 minutes ' +
        'in the future', () => {
        const timestamp16MinInFuture = '20160317T183801033Z';
        const expectedOutput = true;
        const actualOutput = checkTimeSkew(timestamp16MinInFuture,
            expiry, log);
        assert.strictEqual(actualOutput, expectedOutput);
    });

    it('should allow requests with timestamps earlier than the ' +
        'the expiry', () => {
        const timestamp14MinInPast = '20160317T180801033Z';
        const expectedOutput = false;
        const actualOutput = checkTimeSkew(timestamp14MinInPast,
            expiry, log);
        assert.strictEqual(actualOutput, expectedOutput);
    });

    it('should not allow requests with timestamps later ' +
        'than the expiry', () => {
        const timestamp16MinInPast = '20160317T180601033Z';
        const expectedOutput = true;
        const actualOutput = checkTimeSkew(timestamp16MinInPast,
            expiry, log);
        assert.strictEqual(actualOutput, expectedOutput);
    });
});
