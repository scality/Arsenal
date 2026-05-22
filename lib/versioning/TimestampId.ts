// Shared building blocks for versionId-like identifiers.
//
// The canonical layout produced by {@link createTimestampSequenceGenerator}
// is a 27-character string:
//         timestamp  sequential_position  rep_group_id
// where:
// - timestamp              14 bytes        MAX_TS - epoch_ms (reversed)
// - sequential_position    06 bytes        MAX_SEQ - position in the ms slot (reversed)
// - rep_group_id           07 bytes        replication group id (space-padded, truncated if longer)
//
// Reversing timestamp and sequence makes lexicographic order match
// reverse-chronological order (newest first), which is what callers
// listing keys in leveldb-style stores rely on.

// the lengths of the components in bytes
export const LENGTH_TS = 14; // timestamp: epoch in ms
export const LENGTH_SEQ = 6; // position in ms slot
export const LENGTH_RG = 7; // replication group id

// length of the canonical ts+seq+rg backbone (27 characters)
export const TS_SEQ_RG_LENGTH = LENGTH_TS + LENGTH_SEQ + LENGTH_RG;

// empty string templates for the variables in a versionId
export const TEMPLATE_TS = new Array(LENGTH_TS + 1).join('0');
export const TEMPLATE_SEQ = new Array(LENGTH_SEQ + 1).join('0');
export const TEMPLATE_RG = new Array(LENGTH_RG + 1).join(' ');

// constants for max epoch and max sequential number in the same epoch
export const MAX_TS = Math.pow(10, LENGTH_TS) - 1; // good until 16 Nov 5138
export const MAX_SEQ = Math.pow(10, LENGTH_SEQ) - 1; // good for 1 billion ops

/**
 * Left-pad a string representation of a value with a given template.
 * For example: pad('foo', '00000') gives '00foo'.
 *
 * @param value - value to pad
 * @param template - padding template
 * @return - padded string
 */
export function padLeft(value: any, template: string) {
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
export function padRight(value: any, template: string) {
    return `${value}${template}`.slice(0, template.length);
}

/**
 * This function ACTIVELY (wastes CPU cycles and) waits for an amount of time
 * before returning to the caller. This should not be used frequently.
 *
 * @param span - time to wait in nanoseconds (1/1000000 millisecond)
 * @return - nothing
 */
export function wait(span: number) {
    function getspan(diff: [number, number]) {
        return diff[0] * 1e9 + diff[1];
    }
    const start = process.hrtime();
    while (getspan(process.hrtime(start)) < span) {
        // do nothing
    }
}

/**
 * Encode a string to its hex representation. Used to obscure the
 * internal structure of a versionId-like identifier.
 *
 * @param str - the string to encode
 * @return - the hex-encoded string
 */
export function hexEncode(str: string): string {
    return Buffer.from(str, 'utf8').toString('hex');
}

/**
 * Decode a hex-encoded string. Returns an Error if the input is not
 * valid hex or decodes to an empty string.
 *
 * @param str - the hex-encoded string to decode
 * @return - the decoded string or an Error
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

/**
 * Build a stateful generator producing the 27-character
 * `timestamp + sequential_position + rep_group_id` backbone shared by
 * {@link generateVersionId} and microVersionId generation.
 *
 * The returned function keeps its own `lastTimestamp` / `lastSeq`
 * state, so each caller (versionId vs microVersionId) maintains an
 * independent counter and one stream cannot perturb the other.
 *
 * Timestamps and sequence numbers are stored in reversed form
 * (MAX - value) so that lexicographic ordering yields newest-first
 * results.
 *
 * @return - a function that, given a replicationGroupId, returns the
 *   27-character ts+seq+rg prefix for the current instant
 */
export function createTimestampSequenceGenerator(): (replicationGroupId: string) => string {
    let lastTimestamp = 0;
    let lastSeq = 0;

    return function generate(replicationGroupId: string): string {
        const repGroupId = padRight(replicationGroupId, TEMPLATE_RG);

        // Wait for the millisecond slot to "flush" on first call after
        // module load, to guarantee uniqueness across restarts.
        if (lastTimestamp === 0) {
            wait(1000000);
        }

        // A sequence number is used (rather than nanosecond clocks) because
        // concurrent requests within the same millisecond must still get
        // unique, monotonically-ordered ids based on their queue position.
        const ts = Date.now();
        lastSeq = lastTimestamp === ts ? lastSeq + 1 : 0;
        lastTimestamp = ts;

        return padLeft(MAX_TS - lastTimestamp, TEMPLATE_TS) + padLeft(MAX_SEQ - lastSeq, TEMPLATE_SEQ) + repGroupId;
    };
}

/**
 * Build a sentinel id representing the earliest possible position in
 * the reverse-chronological ordering. Produced by combining MAX_TS
 * and MAX_SEQ with the given replication group id; useful as a lower
 * bound for "versions before versioning" markers.
 *
 * @param replicationGroupId - replication group id (space-padded /
 *   truncated to {@link LENGTH_RG})
 * @return - the 27-character sentinel id
 */
export function getInfId(replicationGroupId: string): string {
    const repGroupId = padRight(replicationGroupId, TEMPLATE_RG);
    return padLeft(MAX_TS, TEMPLATE_TS) + padLeft(MAX_SEQ, TEMPLATE_SEQ) + repGroupId;
}

/**
 * Decompose a 27-character ts+seq+rg id into its components,
 * un-reversing the timestamp and sequence so they read as wall-clock
 * values. The replication group id is returned trimmed of trailing
 * spaces.
 *
 * @param id - the raw, non-encoded ts+seq+rg id (typically the
 *   {@link TS_SEQ_RG_LENGTH}-character prefix of a longer identifier)
 * @return - parsed components, or an Error if the input is too short
 *   or contains a non-numeric timestamp/sequence
 */
export function parse(id: string): { ts: number; seq: number; rg: string } | Error {
    if (id.length < TS_SEQ_RG_LENGTH) {
        return new Error(`id too short: expected at least ${TS_SEQ_RG_LENGTH} chars, got ${id.length}`);
    }
    const reversedTs = Number(id.substring(0, LENGTH_TS));
    const reversedSeq = Number(id.substring(LENGTH_TS, LENGTH_TS + LENGTH_SEQ));
    if (!Number.isFinite(reversedTs) || !Number.isFinite(reversedSeq)) {
        return new Error('id has non-numeric timestamp or sequence');
    }
    const rg = id.substring(LENGTH_TS + LENGTH_SEQ, TS_SEQ_RG_LENGTH).trimEnd();
    return { ts: MAX_TS - reversedTs, seq: MAX_SEQ - reversedSeq, rg };
}

/**
 * Compare two ts+seq+rg ids chronologically. Because the encoding
 * reverses time, the lexicographically smaller value is the more
 * recent one. Returns a positive number if {@code a} is newer than
 * {@code b}, a negative number if {@code a} is older, and 0 if both
 * refer to the same id.
 *
 * @param a - first id (raw, non-encoded form)
 * @param b - second id (raw, non-encoded form)
 * @return - positive if a is newer than b, negative if older, 0 if equal
 */
export function compare(a: string, b: string): number {
    if (a === b) {
        return 0;
    }
    return a < b ? 1 : -1;
}
