// Hex VersionID format:
//         timestamp  sequential_position  rep_group_id  other_information
// where:
// - timestamp              14 bytes        epoch in ms (good untill 5138)
// - sequential_position    06 bytes        position in the ms slot (1B ops)
// - rep_group_id           07 bytes        replication group identifier
// - other_information      arbitrary       user input, such as a unique string
//
// Legacy Base62 VersionID:
//         timestamp  sequential_position  rep_group_id
// where:
// - timestamp              14 bytes        epoch in ms
// - sequential_position    06 bytes        position in the ms slot
// - rep_group_id           07 bytes        replication group identifie
//
// Base62 VersionID:
//         timestamp  sequential_position  rep_group_id  instance_id  version_id_format
// where:
// - timestamp              14 bytes        epoch in ms
// - sequential_position    06 bytes        position in the ms slot
// - rep_group_id           07 bytes        replication group identifier
// - instance_id            06 bytes        unique instance identifier
// - version_id_format      02 bytes        version ID format marker + version

import base62Integer from 'base62';
import baseX from 'base-x';
import assert from 'assert';
import { VersioningConstants } from './constants';
import {
    LENGTH_TS,
    LENGTH_SEQ,
    LENGTH_RG,
    TEMPLATE_TS,
    TEMPLATE_SEQ,
    TEMPLATE_RG,
    MAX_TS,
    MAX_SEQ,
    padLeft,
    padRight,
    hexEncode,
    hexDecode,
    createTimestampSequenceGenerator,
    getInfId,
} from './TimestampId';

const BASE62 = '0123456789abcdefghijklmnopqrstuvwxyzABCDEFGHIJKLMNOPQRSTUVWXYZ';
const base62String = baseX(BASE62);

// Re-exports for backwards compatibility with existing importers.
export { LENGTH_TS, LENGTH_SEQ, LENGTH_RG, TEMPLATE_TS, TEMPLATE_SEQ, TEMPLATE_RG, MAX_TS, MAX_SEQ };
export { padLeft, padRight, hexEncode, hexDecode };
export { wait } from './TimestampId';

const LENGTH_ID = 6; // instance id
const LENGTH_FT = 2; // version ID format, 1 byte + separator

const TEMPLATE_ID = new Array(LENGTH_ID + 1).join('0');

export const S3_VERSION_ID_ENCODING_TYPE = process.env.S3_VERSION_ID_ENCODING_TYPE;

// Flag to enable the new version ID (35 characters) over legacy shortID format (27 characters).
// When enabled and S3_VERSION_ID_ENCODING_TYPE is 'base62':
//   - Uses new format: timestamp + sequential_position + rep_group_id + instance_id + version_id_format
//   - Includes instance_id field to differentiate version IDs across multiple instances in the same k8s cluster
//   - Appends format marker and version identifier for format detection
// When disabled and S3_VERSION_ID_ENCODING_TYPE is 'base62':
//   - Uses old format: timestamp + sequential_position + rep_group_id (legacy 27-char format)
// Falls back to hex encoding if S3_VERSION_ID_ENCODING_TYPE is 'hex' or unset
export const ENABLE_FORMATTED_VERSION_ID =
    process.env.ENABLE_FORMATTED_VERSION_ID === 'true' || process.env.ENABLE_FORMATTED_VERSION_ID === '1';

// version ID format added to the end of the version ID
const VERSION_ID_FORMAT_VERSION = '1';
const VERSION_ID_FORMAT_SUFFIX = `${VersioningConstants.VersionId.FormatMarker}${VERSION_ID_FORMAT_VERSION}`;
assert(VERSION_ID_FORMAT_SUFFIX.length === LENGTH_FT, `versionID format must be ${LENGTH_FT} bytes`);

const LEGACY_BASE62_DECODED_LENGTH = 27;
const BASE62_DECODED_LENGTH = 35;
const BASE62_ENCODED_LENGTH = 32;

/**
 * Generates the earliest versionId, used for versions before versioning.
 * Thin wrapper over {@link getInfId} preserved for backwards compatibility.
 *
 * @param replicationGroupId - replication group id
 * @return version ID for versions before versioning
 */
export function getInfVid(replicationGroupId: string): string {
    return getInfId(replicationGroupId);
}

// Stateful ts+seq+rg generator owning the lastTimestamp/lastSeq counters
// for versionId generation. Kept separate from microVersionId state so
// the two streams don't interfere.
const generateTsSeqRg = createTimestampSequenceGenerator();

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
    let otherInfo = '';
    let instanceIdPadded = '';
    let formatSuffix = '';

    if (!S3_VERSION_ID_ENCODING_TYPE || S3_VERSION_ID_ENCODING_TYPE === 'hex') {
        // In HEX encoding, the full info data is used.
        otherInfo = info;
    } else if (ENABLE_FORMATTED_VERSION_ID) {
        // In base62, info is for the instance ID and is trimmed/padded.
        instanceIdPadded = padRight(info, TEMPLATE_ID);
        // Add the version ID format marker and version.
        formatSuffix = VERSION_ID_FORMAT_SUFFIX;
    }

    return generateTsSeqRg(replicationGroupId) + otherInfo + instanceIdPadded + formatSuffix;
}

/* base62 version Ids constants:
 *
 * Note: base62Integer() cannot encode integers larger than 15 digits
 * so we assume that B62V_TOTAL <= 30 and we cut it in half. Please
 * revisit if B62V_TOTAL is greater than 30.
 */
const B62V_TOTAL = LENGTH_TS + LENGTH_SEQ;
const B62V_HALF = B62V_TOTAL / 2;
const B62V_EPAD = '0'.repeat(Math.ceil(B62V_HALF * (Math.log(10) / Math.log(62))));
const B62V_DPAD = '0'.repeat(B62V_HALF);
const B62V_STRING_EPAD = '0'.repeat(32 - 2 * B62V_EPAD.length);

/**
 * Encode a versionId to obscure internal information contained
 * in a version ID (equal to 32 bytes).
 *
 * @param str - the versionId to encode
 * @return - the encoded base62VersionId
 * @throws - if the timestamp/sequence segments cannot be parsed as numbers,
 *   or if the underlying base62 libraries reject the input
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
        return err as Error;
    }
}

export const ENC_TYPE_HEX = 0; // legacy (large) encoding
export const ENC_TYPE_BASE62 = 1; // new (tiny) encoding

/**
 * Checks if the given versionId string contains the specified format version.
 *
 * @param versionId - The versionId string to check.
 * @param version - The expected format version.
 * @returns true if the versionId contains the format marker and version, false otherwise.
 */
function hasVersionIDFormat(versionId: string, version: string): boolean {
    // Format marker can only exist after the required versionId sections.
    // This check removes the risk of looking for the format marker in the
    // replication group ID, which can technically contain any character as
    // it's set by the end user.
    if (versionId.length < LENGTH_TS + LENGTH_SEQ + LENGTH_RG + LENGTH_FT) {
        return false; // Not enough characters for format marker
    }
    // For constant time lookup, we always assume that the format marker is
    // at the end of the versionId.
    const formatMarkerIdx = versionId.length - LENGTH_FT;
    if (versionId.charAt(formatMarkerIdx) !== VersioningConstants.VersionId.FormatMarker) {
        return false; // no format marker
    }
    return versionId.substring(formatMarkerIdx + 1) === version; // check if the version matches
}

/**
 * Encode a versionId to obscure internal information contained
 * in a version ID.
 *
 * @param str - the versionId to encode
 * @return - the encoded versionId
 * @throws - via {@link base62Encode} when the input has a base62 shape
 *   (27 chars or carries the format marker) but malformed segments
 */
export function encode(str: string): string {
    // Legacy base62 version IDs (without 'info' field) are always 27 characters long.
    // The new base62 format is 35 characters and includes the format marker at the end.
    if (str.length === LEGACY_BASE62_DECODED_LENGTH || hasVersionIDFormat(str, VERSION_ID_FORMAT_VERSION)) {
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
    if (str.length === BASE62_ENCODED_LENGTH) {
        const decoded: string | Error = base62Decode(str);
        // Legacy base62 version IDs (without 'info' field) are always 27 characters long.
        // The new base62 format is always 35 characters long.
        if (
            typeof decoded === 'string' &&
            decoded.length !== LEGACY_BASE62_DECODED_LENGTH &&
            decoded.length !== BASE62_DECODED_LENGTH
        ) {
            return new Error(
                `decoded ${str} is not length ` + `${LEGACY_BASE62_DECODED_LENGTH} or ${BASE62_DECODED_LENGTH}`,
            );
        }
        return decoded;
    }
    // legacy format
    if (str.length > BASE62_ENCODED_LENGTH) {
        return hexDecode(str);
    }
    return new Error(`cannot decode str ${str.length}`);
}
