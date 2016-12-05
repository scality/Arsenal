'use strict'; // eslint-disable-line strict
const errors = require('../../errors');

const epochTime = new Date('1970-01-01').getTime();

function checkRequestExpiry(timestamp, log) {
    // If timestamp is before epochTime, the request is invalid and return
    // errors.AccessDenied
    if (timestamp < epochTime) {
        log.debug('request time is invalid', { timestamp });
        return errors.AccessDenied;
    }
    // If timestamp is not within 15 minutes of current time, or if
    // timestamp is more than 15 minutes in the future, the request
    // has expired and return errors.RequestTimeTooSkewed
    const currentTime = Date.now();
    log.trace('request timestamp', { requestTimestamp: timestamp });
    log.trace('current timestamp', { currentTimestamp: currentTime });

    const fifteenMinutes = (15 * 60 * 1000);
    if (currentTime - timestamp > fifteenMinutes) {
        log.trace('request timestamp is not within 15 minutes of current time');
        log.debug('request time too skewed', { timestamp });
        return errors.RequestTimeTooSkewed;
    }

    if (currentTime + fifteenMinutes < timestamp) {
        log.trace('request timestamp is more than 15 minutes into future');
        log.debug('request time too skewed', { timestamp });
        return errors.RequestTimeTooSkewed;
    }

    return undefined;
}

module.exports = checkRequestExpiry;
