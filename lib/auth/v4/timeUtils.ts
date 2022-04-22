import { Logger } from 'werelogs';

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
 * Convert UTC timestamp to ISO 8601 timestamp
 * @param timestamp of UTC form: Fri, 10 Feb 2012 21:34:55 GMT
 * @return ISO8601 timestamp of form: YYYYMMDDTHHMMSSZ
 */
export function convertUTCtoISO8601(timestamp: string | number) {
    // convert to ISO string: YYYY-MM-DDTHH:mm:ss.sssZ.
    const converted = new Date(timestamp).toISOString();
    // Remove "-"s and "."s and milliseconds
    return converted.split('.')[0].replace(/-|:/g, '').concat('Z');
}

/**
 * Check whether timestamp predates request or is too old
 * @param timestamp of ISO8601Timestamp format without
 * dashes or colons, e.g. 20160202T220410Z
 * @param expiry - number of seconds signature should be valid
 * @param log - log for request
 * @return true if there is a time problem
 */
export function checkTimeSkew(timestamp: string, expiry: number, log: Logger) {
    const currentTime = Date.now();
    const fifteenMinutes = (15 * 60 * 1000);
    const parsedTimestamp = convertAmzTimeToMs(timestamp);
    if ((currentTime + fifteenMinutes) < parsedTimestamp) {
        log.debug('current time pre-dates timestamp', {
            parsedTimestamp,
            currentTimeInMilliseconds: currentTime });
        return true;
    }
    const expiryInMilliseconds = expiry * 1000;
    if (currentTime > parsedTimestamp + expiryInMilliseconds) {
        log.debug('signature has expired', {
            parsedTimestamp,
            expiry,
            currentTimeInMilliseconds: currentTime });
        return true;
    }
    return false;
}
