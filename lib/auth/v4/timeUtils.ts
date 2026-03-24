import type { RequestLogger } from 'werelogs';

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
    const fifteenMinutes = (15 * 60 * 1000);
    const parsedTimestamp = convertAmzTimeToMs(timestamp);
    if ((currentTime + fifteenMinutes) < parsedTimestamp) {
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
 * Parses an ISO 8601 compact timestamp string into a Date object.
 *
 * @param str - The string to parse
 * @returns A Date object if the string is a valid ISO 8601 compact timestamp, undefined otherwise
 *
 * @example
 * ```typescript
 * parseISO8601Compact('20160208T201405Z');  // Date object
 * parseISO8601Compact('19500707T215304Z');  // Date object (pre-Unix epoch)
 * parseISO8601Compact('20160230T201405Z');  // undefined (Feb 30 invalid)
 * parseISO8601Compact('invalid');           // undefined
 * ```
 */
export function parseISO8601Compact(str: string): Date | undefined {
    if (typeof str !== 'string') {
        return undefined;
    }

    // Match format: YYYYMMDDTHHMMSSZ
    const match = str.match(/^(\d{4})(\d{2})(\d{2})T(\d{2})(\d{2})(\d{2})Z$/);
    if (!match) {
        return undefined;
    }

    const [, year, month, day, hour, minute, second] = match;

    // Construct standard ISO format and validate
    const isoString = `${year}-${month}-${day}T${hour}:${minute}:${second}.000Z`;
    const date = new Date(isoString);

    try {
        if (Number.isNaN(date.getTime())) {
            return undefined;
        }

        // date.toISOString() can throw.
        // date.toISOString() === isoString check prevents silent date corrections (30 February to 1 March)
        if (date.toISOString() !== isoString) {
            return undefined;
        }

        return date;
    } catch {
        return undefined;
    }
}

