'use strict'; // eslint-disable-line strict

const assert = require('assert');

const checkRequestExpiry =
    require('../../../../lib/auth/v2/checkRequestExpiry');
const DummyRequestLogger = require('../../helpers').DummyRequestLogger;
const errors = require('../../../../index').errors;

const log = new DummyRequestLogger();

describe('checkTimestamp for timecheck in header auth', () => {
    it('should return AccessDenied error if the date in the ' +
       'header is before epochTime', () => {
        const timestamp = new Date('1950-01-01');
        const timeoutResult = checkRequestExpiry(timestamp, log);
        assert.deepStrictEqual(timeoutResult, errors.AccessDenied);
    });

    it('should return RequestTimeTooSkewed error if the date in the ' +
       'header is more than 15 minutes old', () => {
        const timestamp = new Date(Date.now() - 16 * 60000);
        const timeoutResult = checkRequestExpiry(timestamp, log);
        assert.deepStrictEqual(timeoutResult, errors.RequestTimeTooSkewed);
    });

    it('should return RequestTimeTooSkewed error if the date in ' +
       'the header is more than 15 minutes in the future', () => {
        const timestamp = new Date(Date.now() + 16 * 60000);
        const timeoutResult = checkRequestExpiry(timestamp, log);
        assert.deepStrictEqual(timeoutResult, errors.RequestTimeTooSkewed);
    });

    it('should return no error if the date in the header is ' +
       'within 15 minutes of current time', () => {
        const timestamp = new Date();
        const timeoutResult = checkRequestExpiry(timestamp, log);
        assert.deepStrictEqual(timeoutResult, undefined);
    });
});
