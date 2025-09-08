import type { RequestLogger } from 'werelogs';
import errors from '../../errors';

const epochTime = new Date('1970-01-01').getTime();

export default function checkRequestExpiry(timestamp: number, log: RequestLogger) {
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
    log.trace('request and current timestamp', {
        requestTimestamp: timestamp,
        currentTimestamp: currentTime,
    });

    const fifteenMinutes = (15 * 60 * 1000);
    if (currentTime - timestamp > fifteenMinutes) {
        log.debug('request timestamp is not within 15 minutes of current time', { timestamp });
        return errors.RequestTimeTooSkewed;
    }

    if (currentTime + fifteenMinutes < timestamp) {
        log.debug('request timestamp is more than 15 minutes into future', { timestamp });
        return errors.RequestTimeTooSkewed;
    }

    return undefined;
}
