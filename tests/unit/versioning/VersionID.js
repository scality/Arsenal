const VID = require('../../../lib/versioning/VersionID.js');
const assert = require('assert');

function randkey(length) {
    let key = '';
    for (let i = 0; i < length; i++) {
        key += String.fromCharCode(Math.floor(Math.random() * 94 + 32));
    }
    return key;
}

describe('test generating versionIds', () => {
    const count = 1000;
    const vids = Array(count).fill(null);
    for (let i = 0; i < count; i++) {
        vids[i] = VID.generateVersionId(randkey(15), 'PARIS');
    }
    process.env.VID_CRYPTO_PASSWORD = randkey(64);

    it('sorted in reversed chronological and alphabetical order', () => {
        for (let i = 0; i < count; i++) {
            if (i !== 0) {
                assert(vids[i - 1] > vids[i],
                    'previous VersionID is higher than its next');
            }
        }
    });

    it('should return error decoding non-hex string versionIds', () => {
        const encoded = vids.map(vid => VID.encode(vid));
        const decoded = encoded.map(vid => VID.decode(`${vid}foo`));
        decoded.forEach(result => assert(result instanceof Error));
    });

    it('should encode and decode versionIds', () => {
        const encoded = vids.map(vid => VID.encode(vid));
        const decoded = encoded.map(vid => VID.decode(vid));
        assert.strictEqual(vids.length, count);
        assert.deepStrictEqual(vids, decoded);
    });
});
