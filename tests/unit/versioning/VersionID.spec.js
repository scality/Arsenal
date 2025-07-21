const VID = require('../../../lib/versioning/VersionID');
const VersioningConstants = require('../../../lib/versioning/constants').VersioningConstants;
const assert = require('assert');

function randkey(length) {
    let key = '';
    for (let i = 0; i < length; i++) {
        // Generate ASCII characters from 32-125, excluding '?' (63)
        // as '?' is reserved for the version ID format marker
        let charCode = Math.floor(Math.random() * 94 + 32);
        if (charCode === 63) { // Skip '?' character
            charCode = 126; // Use '~' instead
        }
        key += String.fromCharCode(charCode);
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
        it('should return an error when an ID has unsupported characters', () => {
            const encoded = 'wHtI53.S4ApsYLRI5VZZ3Iw.7ny4NgQz';
            const decoded = VID.decode(encoded);
            assert(decoded instanceof Error);
            assert.strictEqual(decoded.message, 'Non-base62 character');
        });
    });

    describe('legacy hex encoding', () => {
        VID.S3_VERSION_ID_ENCODING_TYPE = 'hex';
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

        it('should not include format marker in legacy hex encoding', () => {
            assert.strictEqual(
                vids.every(vid => !vid.includes(VersioningConstants.VersionId.FormatMarker)),
                true,
            );
        });

        it('should encode and decode hex versionID with exactly Short ID length', () => {
            const versionID = '98248620612400999999RG00001145.20.5'; // 35 characters long
            const encoded = VID.encode(versionID);
            assert.strictEqual(encoded.length > 32, true);
            const decoded = VID.decode(encoded);
            assert.strictEqual(decoded, versionID);
        });

        it('should encode and decode versionID with legacy Short ID length', () => {
            const versionID = '98248620612400999999RG00001'; // 27 characters long
            const encoded = VID.encode(versionID);
            assert.strictEqual(encoded.length === 32, true);
            const decoded = VID.decode(encoded);
            assert.strictEqual(decoded, versionID);
        });

        it('should encode and decode Short ID', () => {
            const versionID = '98248700112011999999RG00001enr984?1'; // 35 characters long
            const encoded = VID.encode(versionID);
            assert.strictEqual(encoded.length === 32, true);
            const decoded = VID.decode(encoded);
            assert.strictEqual(decoded, versionID);
        });
    });

    [
        true, // Version ID formatting enabled
        false, // Version ID formatting disabled
    ].forEach(enableFormatting => {
        describe(`Short IDs : formatting ${enableFormatting ? 'enabled' : 'disabled'}`, () => {
            VID.S3_VERSION_ID_ENCODING_TYPE = 'base62';
            VID.ENABLE_FORMATTED_VERSION_ID = enableFormatting;
            const vids = generateRandomVIDs(count);

            it('sorted in reversed chronological and alphabetical order', () => {
                for (let i = 1; i < count; i++) {
                    assert(vids[i - 1] > vids[i],
                        'previous VersionID is higher than its next');
                }
            });

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
                const VIDLength = enableFormatting ? 35 : 27;
                assert(vids.every(x => x.length === VIDLength));
                assert(encoded.every(x => x.length === 32));
                assert.deepStrictEqual(vids, decoded);
            });

            it('should encode and decode hex versionID', () => {
                const legacyVID = '98248620612400999999RG00001someinformation';
                const encoded = VID.encode(legacyVID);
                assert.strictEqual(encoded.length > 32, true);
                const decoded = VID.decode(encoded);
                assert.strictEqual(decoded, legacyVID);
            });
        });
    });
});
