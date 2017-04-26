// VersionID format:
//         timestamp  sequential_position  site_id  other_information
// where:
// - timestamp              14 bytes        epoch in ms (good untill 5138)
// - sequential_position    06 bytes        position in the ms slot (1B ops)
// - site_id                05 bytes        site identifier (like PARIS)
// - other_information      arbitrary       user input, such as a unique string

// the lengths of the components in bytes
const LENGTH_TS = 14; // timestamp: epoch in ms
const LENGTH_SEQ = 6; // position in ms slot
const LENGTH_SITE = 5; // site identifier

// empty string template for the variables in a versionId
const TEMPLATE_TS = new Array(LENGTH_TS + 1).join('0');
const TEMPLATE_SEQ = new Array(LENGTH_SEQ + 1).join('0');
const TEMPLATE_SITE = new Array(LENGTH_SITE + 1).join(' ');

/**
 * Left-pad a string representation of a value with a given template.
 * For example: pad('foo', '00000') gives '00foo'.
 *
 * @param {any} value - value to pad
 * @param {string} template - padding template
 * @return {string} - padded string
 */
function padLeft(value, template) {
    return `${template}${value}`.slice(-template.length);
}

/**
 * Right-pad a string representation of a value with a given template.
 * For example: pad('foo', '00000') gives 'foo00'.
 *
 * @param {any} value - value to pad
 * @param {string} template - padding template
 * @return {string} - padded string
 */
function padRight(value, template) {
    return `${value}${template}`.slice(0, template.length);
}

/**
 * This function ACTIVELY (wastes CPU cycles and) waits for an amount of time
 * before returning to the caller. This should not be used frequently.
 *
 * @param {Number} span - time to wait in nanoseconds (1/1000000 millisecond)
 * @return {Undefined} - nothing
 */
function wait(span) {
    function getspan(diff) {
        return diff[0] * 1e9 + diff[1];
    }
    const start = process.hrtime();
    while (getspan(process.hrtime(start)) < span) {
        // do nothing
    }
}

// constants for max epoch and max sequential number in the same epoch
const MAX_TS = Math.pow(10, LENGTH_TS) - 1; // good until 16 Nov 5138
const MAX_SEQ = Math.pow(10, LENGTH_SEQ) - 1; // good for 1 billion ops

// default site name in CRR context for single/bucketfile/membackend deployments
const SITE = 'PARIS';

class VersionID {

    /**
     * Instantiate VersionID; the result should be initalized before use.
     */
    constructor() {
        // some configurable variables
        this.SITE_ID = padRight(SITE_ID, TEMPLATE_SITE); // site identifier
        this.VID_INF = padLeft(MAX_TS, TEMPLATE_TS) +
            padLeft(MAX_SEQ, TEMPLATE_SEQ) + this.SITE_ID; // earliest versionId
        // internal state of the module
        this.lastTimestamp = 0; // epoch of the last versionId
        this.lastSeq = 0; // sequential number of the last versionId
    }

    /**
     * Initialize the VersionID instance.
     *
     * @param {object} params - input parameters for initalization
     * @param {string} params.siteId - region identifier in CRR context
     * @return {VersionID} - this instance
     */
    init(params) {
        assert(params && params.siteId, 'input parameters is required');
        // formated site identifier, like PARIS, TOKYO, SF000
        this.SITE_ID = padRight(params.siteId, TEMPLATE_SITE);
        // the earliest versionId, used for versions before versioning
        this.VID_INF = padLeft(MAX_TS, TEMPLATE_TS) +
            padLeft(MAX_SEQ, TEMPLATE_SEQ) + this.SITE_ID;
        return this;
    }

    /**
     * This function returns a "versionId" string indicating the current time as a
     * combination of the current time in millisecond, the position of the request
     * in that millisecond, and the identifier of the local site (which could be
     * datacenter, region, or server depending on the notion of geographics). This
     * function is stateful which means it keeps some values in the memory and the
     * next call depends on the previous call.
     *
     * @param {string} info - the additional info to ensure uniqueness if desired
     * @return {string} - the formated versionId string
     */
    generateVersionId(info) {
        // Need to wait for the millisecond slot got "flushed". We wait for
        // only a single millisecond when the module is restarted, which is
        // necessary for the correctness of the system. This is therefore cheap.
        if (this.lastTimestamp === 0) {
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
        this.lastSeq = (this.lastTimestamp === ts) ? this.lastSeq + 1 : 0;
        this.lastTimestamp = ts;

        // In the default cases, we reverse the chronological order of the
        // timestamps so that all versions of an object can be retrieved in the
        // reversed chronological order---newest versions first. This is because of
        // the limitation of leveldb for listing keys in the reverse order.
        return padLeft(MAX_TS - this.lastTimestamp, TEMPLATE_TS) +
            padLeft(MAX_SEQ - this.lastSeq, TEMPLATE_SEQ) + this.SITE_ID + info;
    }

    /**
     * Get the predefined-earliest versionId of this site.
     *
     * @return {string} - the predefined-earliest versionId
     */
    getINF() {
        return this.VID_INF;
    }

    /**
     * Encode a versionId to obscure internal information contained
     * in a version ID.
     *
     * @param {string} str - the versionId to encode
     * @return {string} - the encoded versionId
     */
    static encode(str) {
        return Buffer.from(str, 'utf8').toString('hex');
    }

    /**
     * Decode a versionId. May return an error if the input string is
     * invalid hex string or results in an invalid value.
     *
     * @param {string} str - the encoded versionId to decode
     * @return {(string|Error)} - the decoded versionId or an error
     */
    static decode(str) {
        try {
            const result = Buffer.from(str, 'hex').toString('utf8');
            if (result === '') {
                return new Error('invalid decoded value');
            }
            return result;
        } catch (err) {
            // Buffer.from() may throw TypeError if invalid input, e.g. non-string
            // or string with inappropriate charlength
            return err;
        }
    }
}

module.exports = { instance: new VersionID() };
