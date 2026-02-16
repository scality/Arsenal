import type { RequestLogger } from 'werelogs';
import { fifteenMinutesInMilliseconds } from '../../constants';

/**
 * Convert timestamp to milliseconds since Unix Epoch
 * @param timestamp of ISO8601Timestamp format without
 * dashes or colons, e.g. 20160202T220410Z
 */
export function convertAmzTimeToMs(timestamp: string) {
    const arr = timestamp.split('');
    // Convert to YYYY-MM-DDTHH:mm:ss.sssZ
    const ISO8601time = `${arr.slice(0, 4).join('')}-${arr[4]}${arr[5]}` +
        `-${arr.slice(6, 11).join('')}:${arr[11]}${arr[12]}:${arr[13]}` +
        `${arr[14]}.000Z`;
    return Date.parse(ISO8601time);
}

/**
* Convert UTC timestamp to ISO 8601 compact format
* @param timestamp - UTC timestamp (e.g., 'Fri, 10 Feb 2012 21:34:55 GMT') or Unix timestamp
* @return ISO8601 timestamp of form YYYYMMDDTHHMMSSZ, or undefined if invalid
*
* @example
* convertUTCtoISO8601('Fri, 10 Feb 2012 21:34:55 GMT'); // '20120210T213455Z'
* convertUTCtoISO8601(1328910895000); // '20120210T213455Z'
* convertUTCtoISO8601('invalid'); // undefined
*/
export function convertUTCtoISO8601(timestamp: string | number): string | undefined {
    if (timestamp == null) {
        return undefined;
    }

    const date = new Date(timestamp);

    if (isNaN(date.getTime())) {
        return undefined;
    }

    try {
        // Can throw RangeError.
        const converted = date.toISOString();
        return converted.split('.')[0].replace(/-|:/g, '').concat('Z');
    } catch {
        return undefined;
    }
}

/**
 * Check whether timestamp predates request or is too old
 * @param timestamp of ISO8601Timestamp format without
 * dashes or colons, e.g. 20160202T220410Z
 * @param expiry - number of seconds signature should be valid
 * @param log - log for request
 * @return true if there is a time problem
 */
export function checkTimeSkew(timestamp: string, expiry: number, log: RequestLogger) {
    const currentTime = Date.now();
    const parsedTimestamp = convertAmzTimeToMs(timestamp);
    if ((currentTime + fifteenMinutesInMilliseconds) < parsedTimestamp) {
        log.debug('current time pre-dates timestamp', {
            parsedTimestamp,
            currentTimeInMilliseconds: currentTime
        });
        return true;
    }
    const expiryInMilliseconds = expiry * 1000;
    if (currentTime > parsedTimestamp + expiryInMilliseconds) {
        log.debug('signature has expired', {
            parsedTimestamp,
            expiry,
            currentTimeInMilliseconds: currentTime
        });
        return true;
    }
    return false;
}

/**
* Validates if a string is in ISO 8601 compact format: YYYYMMDDTHHMMSSZ
*
* Checks that: 
* - String is exactly 16 characters long
* - Format matches YYYYMMDDTHHMMSSZ (8 digits, 'T', 6 digits, 'Z')
* - All date/time components are valid (no Feb 30th, no 25:00:00, etc.)
* - No silent date corrections occur (prevents rollover)
*
* @param str - The string to validate
* @returns true if the string is a valid ISO 8601 compact format, false otherwise
*
* @example
* ```typescript
* isValidISO8601Compact('20160208T201405Z');  // true
* isValidISO8601Compact('20160230T201405Z');  // false (Feb 30 invalid)
* isValidISO8601Compact('20160208T251405Z');  // false (25 hours invalid)
* isValidISO8601Compact('2016-02-08T20:14:05Z'); // false (wrong format)
* isValidISO8601Compact('abcd0208T201405Z');  // false (contains letters)
* ```
*/
export function isValidISO8601Compact(str: string): boolean {
    if (typeof str !== 'string') {
        return false;
    }

    // Match format: YYYYMMDDTHHMMSSZ
    const match = str.match(/^(\d{4})(\d{2})(\d{2})T(\d{2})(\d{2})(\d{2})Z$/);
    if (!match) {
        return false;
    }

    const [, year, month, day, hour, minute, second] = match;

    // Construct standard ISO format and validate
    const isoString = `${year}-${month}-${day}T${hour}:${minute}:${second}.000Z`;
    const date = new Date(isoString);

    try {
        // date.toISOString() can throw.
        // date.toISOString() === isoString check prevents silent date corrections (30 February to 1 March)
        return !Number.isNaN(date.getTime()) && date.toISOString() === isoString;
    } catch {
        return false;
    }
}
