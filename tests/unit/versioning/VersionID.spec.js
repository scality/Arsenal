const VID = require('../../../lib/versioning/VersionID');
const assert = require('assert');
const { env } = require('process');

function randkey(length) {
    let key = '';
    for (let i = 0; i < length; i++) {
        key += String.fromCharCode(Math.floor(Math.random() * 94 + 32));
    }
    return key;
}

process.env.VID_CRYPTO_PASSWORD = randkey(64);

function generateRandomVIDs(count) {
    const vids = Array(count).fill(null);
    for (let i = 0; i < count; i++) {
        vids[i] = VID.generateVersionId(randkey(15), 'PARIS');
    }
    return vids;
}

const count = 1000000;

describe('test generating versionIds', () => {
    describe('invalid IDs', () => {
        // A client can use the CLI to send requests with arbitrary version IDs.
        // These IDs may contain invalid characters and should be handled gracefully.
        it.only('should return an error when an ID has unsupported characters', () => {
            const encoded = 'wHtI53.S4ApsYLRI5VZZ3Iw.7ny4NgQz';
            const decoded = VID.decode(encoded);
            assert(decoded instanceof Error);
            assert.strictEqual(decoded.message, 'Non-base62 character');
        });
    });
    describe('legaxy hex encoding', () => {
        env.S3_VERSION_ID_ENCODING_TYPE = 'hex';
        const vids = generateRandomVIDs(count);

        it('sorted in reversed chronological and alphabetical order', () => {
            for (let i = 1; i < count; i++) {
                assert(vids[i - 1] > vids[i],
                    'previous VersionID is higher than its next');
            }
        });

        // nodejs 10 no longer returns error for non-hex string versionIds
        it.skip('should return error decoding non-hex string versionIds', () => {
            const encoded = vids.map(vid => VID.hexEncode(vid));
            const decoded = encoded.map(vid => VID.hexDecode(`${vid}foo`));
            decoded.forEach(result => assert(result instanceof Error));
        });

        it('should encode and decode versionIds', () => {
            const encoded = vids.map(vid => VID.hexEncode(vid));
            const decoded = encoded.map(vid => VID.hexDecode(vid));
            assert.deepStrictEqual(vids, decoded);
        });

        it('should encode and decode correctly with legacy format', () => {
            const encoded = vids.map(VID.encode);
            const decoded = encoded.map(VID.decode);

            assert.strictEqual(vids.every(x => x.length > 27), true);
            assert.strictEqual(encoded.every(x => x.length > 32), true);
            assert.deepStrictEqual(vids, decoded);
        });
    });


    describe('Short IDs', () => {
        env.S3_VERSION_ID_ENCODING_TYPE = 'base62';
        const vids = generateRandomVIDs(count);

        it('sorted in reversed chronological and alphabetical order', () => {
            for (let i = 1; i < count; i++) {
                assert(vids[i - 1] > vids[i],
                    'previous VersionID is higher than its next');
            }
        },
        );

        it('simple base62 version test', () => {
            const vid = '98376906954349999999RG001  145.20.5';
            const encoded = VID.base62Encode(vid);
            assert.strictEqual(encoded, 'aJLWKz4Ko9IjBBgXKj5KQT2G9UHv0g7P');
            const decoded = VID.base62Decode(encoded);
            assert.strictEqual(vid, decoded);
        });

        it('base62 version test with smaller part1 number', () => {
            const vid = '00000000054349999999RG001  145.20.5';
            const encoded = VID.base62Encode(vid);
            const decoded = VID.base62Decode(encoded);
            assert.strictEqual(vid, decoded);
        });

        it('base62 version test with smaller part2 number', () => {
            const vid = '98376906950000099999RG001  145.20.5';
            const encoded = VID.base62Encode(vid);
            const decoded = VID.base62Decode(encoded);
            assert.strictEqual(vid, decoded);
        });

        it('base62 version test with smaller part3', () => {
            const vid = '98376906950000099999R1  145.20.5';
            const encoded = VID.base62Encode(vid);
            const decoded = VID.base62Decode(encoded);
            assert.strictEqual(vid, decoded);
        });

        it('base62 version test with smaller part3 - 2', () => {
            const vid = '98376906950000099999R1x';
            const encoded = VID.base62Encode(vid);
            const decoded = VID.base62Decode(encoded);
            assert.strictEqual(vid, decoded);
        });

        it('error case: when invalid base62 key part 3 has invalid base62 character', () => {
            const invalidBase62VersionId = 'aJLWKz4Ko9IjBBgXKj5KQT.G9UHv0g7P';
            const decoded = VID.base62Decode(invalidBase62VersionId);
            assert(decoded instanceof Error);
        });

        it('should encode and decode base62 versionIds', () => {
            const encoded = vids.map(vid => VID.base62Encode(vid));
            const decoded = encoded.map(vid => VID.base62Decode(vid));
            assert.strictEqual(vids.length, count);
            assert.deepStrictEqual(vids, decoded);
        });

        it('should encode and decode correctly with new 32 byte format', () => {
            const encoded = vids.map(vid => VID.encode(vid));
            const decoded = encoded.map(vid => VID.decode(vid));
            assert(vids.every(x => x.length === 27));
            assert(encoded.every(x => x.length === 32));
            assert.deepStrictEqual(vids, decoded);
        });
    });
});
