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

    // nodejs 10 no longer returns error for non-hex string versionIds
    it.skip('should return error decoding non-hex string versionIds', () => {
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

    it('simple tiny version test', () => {
        const vid = '98376906954349999999RG001  145.20.5';
        const encoded = VID.tinyEncode(vid);
        assert.strictEqual(encoded, 'aJLWKz4Ko9IjBBgXKj5KQT2G9UHv0g7P');
        const decoded = VID.tinyDecode(encoded);
        assert.strictEqual(vid, decoded);
    });

    it('tiny version test with smaller part1 number', () => {
        const vid = '00000000054349999999RG001  145.20.5';
        const encoded = VID.tinyEncode(vid);
        const decoded = VID.tinyDecode(encoded);
        assert.strictEqual(vid, decoded);
    });

    it('tiny version test with smaller part2 number', () => {
        const vid = '98376906950000099999RG001  145.20.5';
        const encoded = VID.tinyEncode(vid);
        const decoded = VID.tinyDecode(encoded);
        assert.strictEqual(vid, decoded);
    });

    it('tiny version test with smaller part3', () => {
        const vid = '98376906950000099999R1  145.20.5';
        const encoded = VID.tinyEncode(vid);
        const decoded = VID.tinyDecode(encoded);
        assert.strictEqual(vid, decoded);
    });

    it('tiny version test with smaller part3 - 2', () => {
        const vid = '98376906950000099999R1x';
        const encoded = VID.tinyEncode(vid);
        const decoded = VID.tinyDecode(encoded);
        assert.strictEqual(vid, decoded);
    });

    it('error case: when invalid tiny key part 3 has invalid base62 character', () => {
        const invalidTinyVersionId = 'aJLWKz4Ko9IjBBgXKj5KQT.G9UHv0g7P';
        const decoded = VID.tinyDecode(invalidTinyVersionId);
        assert(decoded instanceof Error);
    });

    it('should encode and decode tiny versionIds', () => {
        const encoded = vids.map(vid => VID.tinyEncode(vid));
        const decoded = encoded.map(vid => VID.tinyDecode(vid));
        assert.strictEqual(vids.length, count);
        assert.deepStrictEqual(vids, decoded);
    });
});
