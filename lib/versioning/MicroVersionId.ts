// MicroVersionId format (27 chars, same ts+seq+rg layout as VersionId):
//         timestamp  sequential_position  rep_group_id
// where:
// - timestamp              14 bytes        MAX_TS - epoch_ms (reversed for newest-first ordering)
// - sequential_position    06 bytes        MAX_SEQ - position in the ms slot (reversed)
// - rep_group_id           07 bytes        replication group id (space-padded right, truncated if longer)
//
// Lexicographic order matches reverse-chronological order (newer < older),
// matching the VersionId scheme. The encoded form is the 54-char hex
// representation of the raw 27-char string.
//
// Example (raw):     "98283606399999999999RG001  "
//                     └──── ts ────┘└─seq─┘└─rg──┘
// Example (encoded): "3938323833363036333939...5247303031 2020" (54 hex chars)
//
// The rep_group_id segment makes microVersionIds unique across writers
// that can generate ids at the same millisecond (e.g. concurrent writers
// bypassing CloudServer, like the CRR resync tool). State is local to
// this module so that microVersionId generation does not perturb
// versionId sequencing.

import {
    hexEncode,
    hexDecode,
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
    wait,
} from './VersionID';

const MICRO_VERSION_ID_LENGTH = LENGTH_TS + LENGTH_SEQ + LENGTH_RG;
const ENCODED_LENGTH = MICRO_VERSION_ID_LENGTH * 2;

let lastTimestamp = 0;
let lastSeq = 0;

/**
 * Generate a timestamp-ordered microVersionId.
 *
 * The returned value is a 27-character string where the timestamp and
 * sequence are stored in reversed form (MAX - value), followed by the
 * replication group id normalized to {@link LENGTH_RG} characters
 * (space-padded if shorter, truncated if longer). String comparison
 * orders microVersionIds from newest to oldest, matching the
 * versionId scheme.
 *
 * @param replicationGroupId - replication group id. Normally a
 *   configured, stable value identifying the writer's cluster (same
 *   one passed to {@link generateVersionId}). Callers bypassing
 *   CloudServer that have no such stable identity (e.g. the CRR
 *   resync tool) should supply a random token to avoid colliding with
 *   concurrent writers.
 *
 * @return - the generated microVersionId
 *
 * @example
 *   generate('RG001')
 *   // => '98283606399999999999RG001  '
 *   //     └── MAX_TS-now ──┘└MAX_SEQ┘└pad┘
 */
export function generate(replicationGroupId: string): string {
    const repGroupId = padRight(replicationGroupId, TEMPLATE_RG);
    if (lastTimestamp === 0) {
        wait(1000000);
    }
    const ts = Date.now();
    lastSeq = lastTimestamp === ts ? lastSeq + 1 : 0;
    lastTimestamp = ts;
    return padLeft(MAX_TS - lastTimestamp, TEMPLATE_TS) + padLeft(MAX_SEQ - lastSeq, TEMPLATE_SEQ) + repGroupId;
}

/**
 * Encode a microVersionId to obscure its internal structure.
 *
 * @param str - the microVersionId to encode
 * @return - the encoded microVersionId
 *
 * @example
 *   encode('98283606399999999999RG001  ')
 *   // => '3938323833363036333939...5247303031 2020' (54 hex chars)
 */
export function encode(str: string): string {
    return hexEncode(str);
}

/**
 * Decode an encoded microVersionId back to its raw form.
 *
 * @param str - the encoded microVersionId to decode
 * @return - the decoded microVersionId or an Error
 *
 * @example
 *   decode('3938323833363036333939...5247303031 2020')
 *   // => '98283606399999999999RG001  '
 */
export function decode(str: string): string | Error {
    if (str.length !== ENCODED_LENGTH || !/^[0-9a-f]+$/.test(str)) {
        return new Error('microVersionId is not in the current format');
    }
    const decoded = hexDecode(str);
    if (decoded instanceof Error) {
        return decoded;
    }
    if (decoded.length !== MICRO_VERSION_ID_LENGTH) {
        return new Error(`decoded microVersionId has invalid length ${decoded.length}`);
    }
    return decoded;
}

/**
 * Compare two microVersionIds chronologically.
 *
 * Because microVersionIds use the reversed-time encoding, the
 * lexicographically smaller value is the more recent one. This
 * function returns a positive number if {@code a} is more recent
 * than {@code b}, a negative number if {@code a} is older, and 0
 * if both refer to the same instant.
 *
 * @param a - first microVersionId (raw, non-encoded form)
 * @param b - second microVersionId (raw, non-encoded form)
 * @return - positive if a is newer than b, negative if older, 0 if equal
 */
export function compare(a: string, b: string): number {
    if (a === b) {
        return 0;
    }
    return a < b ? 1 : -1;
}
