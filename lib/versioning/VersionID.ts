// VersionID format:
//         timestamp  sequential_position  rep_group_id  other_information
// where:
// - timestamp              14 bytes        epoch in ms (good untill 5138)
// - sequential_position    06 bytes        position in the ms slot (1B ops)
// - rep_group_id           07 bytes        replication group identifier
// - other_information      arbitrary       user input, such as a unique string

import base62Integer from 'base62';
import baseX from 'base-x';
const BASE62 = '0123456789abcdefghijklmnopqrstuvwxyzABCDEFGHIJKLMNOPQRSTUVWXYZ';
const base62String = baseX(BASE62);

// the lengths of the components in bytes
const LENGTH_TS = 14; // timestamp: epoch in ms
const LENGTH_SEQ = 6; // position in ms slot
const LENGTH_RG = 7; // replication group id

// empty string template for the variables in a versionId
const TEMPLATE_TS = new Array(LENGTH_TS + 1).join('0');
const TEMPLATE_SEQ = new Array(LENGTH_SEQ + 1).join('0');
const TEMPLATE_RG = new Array(LENGTH_RG + 1).join(' ');

/**
 * Left-pad a string representation of a value with a given template.
 * For example: pad('foo', '00000') gives '00foo'.
 *
 * @param value - value to pad
 * @param template - padding template
 * @return - padded string
 */
function padLeft(value: any, template: string) {
    return `${template}${value}`.slice(-template.length);
}

/**
 * Right-pad a string representation of a value with a given template.
 * For example: pad('foo', '00000') gives 'foo00'.
 *
 * @param value - value to pad
 * @param template - padding template
 * @return - padded string
 */
function padRight(value: any, template: string) {
    return `${value}${template}`.slice(0, template.length);
}

// constants for max epoch and max sequential number in the same epoch
const MAX_TS = Math.pow(10, LENGTH_TS) - 1; // good until 16 Nov 5138
const MAX_SEQ = Math.pow(10, LENGTH_SEQ) - 1; // good for 1 billion ops

/**
 * Generates the earliest versionId, used for versions before versioning
 *
 * @param replicationGroupId - replication group id
 * @return version ID for versions before versionig
 */
export function getInfVid(replicationGroupId: string) {
    const repGroupId = padRight(replicationGroupId, TEMPLATE_RG);
    return (
        padLeft(MAX_TS, TEMPLATE_TS) +
        padLeft(MAX_SEQ, TEMPLATE_SEQ) +
        repGroupId
    );
}

// internal state of the module
let lastTimestamp = 0; // epoch of the last versionId
let lastSeq = 0; // sequential number of the last versionId

/**
 * This function ACTIVELY (wastes CPU cycles and) waits for an amount of time
 * before returning to the caller. This should not be used frequently.
 *
 * @param span - time to wait in nanoseconds (1/1000000 millisecond)
 * @return - nothing
 */
function wait(span: number) {
    function getspan(diff: [number, number]) {
        return diff[0] * 1e9 + diff[1];
    }
    const start = process.hrtime();
    while (getspan(process.hrtime(start)) < span) {
        // do nothing
    }
}

/**
 * This function returns a "versionId" string indicating the current time as a
 * combination of the current time in millisecond, the position of the request
 * in that millisecond, and the replication group identifier (could be a
 * datacenter, region, or server depending on the notion of geographics). This
 * function is stateful which means it keeps some values in the memory and the
 * next call depends on the previous call.
 *
 * @param info - the additional info to ensure uniqueness if desired
 * @param replicationGroupId - replication group id
 * @return - the formated versionId string
 */
export function generateVersionId(info: string, replicationGroupId: string): string {
    // replication group ID, like PARIS; will be trimmed if exceed LENGTH_RG
    const repGroupId = padRight(replicationGroupId, TEMPLATE_RG);

    // Need to wait for the millisecond slot got "flushed". We wait for
    // only a single millisecond when the module is restarted, which is
    // necessary for the correctness of the system. This is therefore cheap.
    if (lastTimestamp === 0) {
        wait(1000000);
    }
    // get the present epoch (in millisecond)
    const ts = Date.now();
    // A bit more rationale: why do we use a sequence number instead of using
    // process.hrtime which gives us time in nanoseconds? The idea is that at
    // any time resolution, some concurrent requests may have the same time due
    // to the way the OS is queueing requests or getting clock cycles. Our
    // approach however will give the time based on the position of a request
    // in the queue for the same millisecond which is supposed to be unique.

    // increase the position if this request is in the same epoch
    lastSeq = lastTimestamp === ts ? lastSeq + 1 : 0;
    lastTimestamp = ts;

    // if S3_VERSION_ID_ENCODING_TYPE is "hex", info is used.
    if (process.env.S3_VERSION_ID_ENCODING_TYPE === 'hex' || !process.env.S3_VERSION_ID_ENCODING_TYPE) {
        // info field stays as is
    } else {
        info = ''; // eslint-disable-line
    }

    // In the default cases, we reverse the chronological order of the
    // timestamps so that all versions of an object can be retrieved in the
    // reversed chronological order---newest versions first. This is because of
    // the limitation of leveldb for listing keys in the reverse order.
    return (
        padLeft(MAX_TS - lastTimestamp, TEMPLATE_TS) +
        padLeft(MAX_SEQ - lastSeq, TEMPLATE_SEQ) +
        repGroupId +
        info
    );
}

/**
 * Encode a versionId to obscure internal information contained
 * in a version ID.
 *
 * @param str - the versionId to encode
 * @return - the encoded versionId
 */
export function hexEncode(str: string): string {
    return Buffer.from(str, 'utf8').toString('hex');
}

/**
 * Decode a versionId. May return an error if the input string is
 * invalid hex string or results in an invalid value.
 *
 * @param str - the encoded versionId to decode
 * @return - the decoded versionId or an error
 */
export function hexDecode(str: string): string | Error {
    try {
        const result = Buffer.from(str, 'hex').toString('utf8');
        if (result === '') {
            return new Error('invalid decoded value');
        }
        return result;
    } catch (err) {
        // Buffer.from() may throw TypeError if invalid input, e.g. non-string
        // or string with inappropriate charlength
        return err as any;
    }
}

/* base62 version Ids constants:
 *
 * Note: base62Integer() cannot encode integers larger than 15 digits
 * so we assume that B62V_TOTAL <= 30 and we cut it in half. Please
 * revisit if B62V_TOTAL is greater than 30.
 */
const B62V_TOTAL = LENGTH_TS + LENGTH_SEQ;
const B62V_HALF = B62V_TOTAL / 2;
const B62V_EPAD = '0'.repeat(
    Math.ceil(B62V_HALF * (Math.log(10) / Math.log(62)))
);
const B62V_DPAD = '0'.repeat(B62V_HALF);
const B62V_STRING_EPAD = '0'.repeat(32 - 2 * B62V_EPAD.length);

/**
 * Encode a versionId to obscure internal information contained
 * in a version ID (equal to 32 bytes).
 *
 * @param str - the versionId to encode
 * @return - the encoded base62VersionId
 */
export function base62Encode(str: string): string {
    const part1 = Number(str.substring(0, B62V_HALF));
    const part2 = Number(str.substring(B62V_HALF, B62V_TOTAL));
    const part3 = Buffer.from(str.substring(B62V_TOTAL));
    const enc1 = base62Integer.encode(part1);
    const enc2 = base62Integer.encode(part2);
    const enc3 = base62String.encode(part3);
    const padded1 = (B62V_EPAD + enc1).slice(-B62V_EPAD.length);
    const padded2 = (B62V_EPAD + enc2).slice(-B62V_EPAD.length);
    const padded3 = (B62V_STRING_EPAD + enc3).slice(-B62V_STRING_EPAD.length);
    return padded1 + padded2 + padded3;
}

/**
 * Decode a base62VersionId. May return an error if the input string is
 * invalid hex string or results in an invalid value.
 *
 * @param str - the encoded base62VersionId to decode
 * @return - the decoded versionId or an error
 */
export function base62Decode(str: string): string | Error {
    try {
        let start = 0;
        const enc1 = str.substring(start, start + B62V_EPAD.length);
        const orig1 = base62Integer.decode(enc1);
        start += B62V_EPAD.length;
        const enc2 = str.substring(start, start + B62V_EPAD.length);
        const orig2 = base62Integer.decode(enc2);
        start += B62V_EPAD.length;
        let enc3 = str.substring(start);
        // take off prefix 0s which represent null bytes
        let idx = 0;
        while (idx < enc3.length) {
            if (enc3[idx] === '0') {
                idx++;
            } else {
                break;
            }
        }
        enc3 = enc3.slice(idx);
        const orig3 = base62String.decode(enc3);

        return (
            (B62V_DPAD + orig1.toString()).slice(-B62V_DPAD.length) +
            (B62V_DPAD + orig2.toString()).slice(-B62V_DPAD.length) +
            orig3.toString()
        );
    } catch (err) {
        // in case of exceptions caused by base62 libs
        return err as any;
    }
}

export const ENC_TYPE_HEX = 0; // legacy (large) encoding
export const ENC_TYPE_BASE62 = 1; // new (tiny) encoding

/**
 * Encode a versionId to obscure internal information contained
 * in a version ID.
 *
 * @param str - the versionId to encode
 * @return - the encoded versionId
 */
export function encode(str: string): string {
    // default format without 'info' field will always be 27 characters
    if (str.length === 27) {
        return base62Encode(str);
    } // legacy format
    return hexEncode(str);
}

/**
 * Decode a versionId. May return an error if the input string is
 * invalid format or results in an invalid value. The function will
 * automatically determine the format acc/ to an heuristic.
 *
 * @param str - the encoded versionId to decode
 * @return - the decoded versionId or an error
 */
export function decode(str: string): string | Error {
    // default format is exactly 32 characters when encoded
    if (str.length === 32) {
        const decoded = base62Decode(str);
        if (typeof decoded === 'string' && decoded.length !== 27) {
            return new Error(`decoded ${str} is not length 27`);
        }
        return decoded;
    }
    // legacy format
    if (str.length > 32) {
        return hexDecode(str);
    }
    return new Error(`cannot decode str ${str.length}`);
}
