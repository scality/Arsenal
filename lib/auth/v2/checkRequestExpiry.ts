import type { RequestLogger } from 'werelogs';
import errors from '../../errors';
import { fifteenMinutesInMilliseconds } from '../../constants';

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
    if (currentTime - timestamp > fifteenMinutesInMilliseconds) {
        log.debug('request timestamp is not within 15 minutes of current time', {
            requestTimestamp: timestamp,
            currentTimestamp: currentTime,
        });
        return errors.RequestTimeTooSkewed;
    }

    if (currentTime + fifteenMinutesInMilliseconds < timestamp) {
        log.debug('request timestamp is more than 15 minutes into future', {
            requestTimestamp: timestamp,
            currentTimestamp: currentTime,
        });
        return errors.RequestTimeTooSkewed;
    }

    return undefined;
}
