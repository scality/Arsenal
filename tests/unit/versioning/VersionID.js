const VID = require('../../../lib/versioning/VersionID.js');
const assert = require('assert');
const crypto = require('crypto');

function randkey(length) {
    let key = '';
    for (let i = 0; i < length; i++) {
        key += String.fromCharCode(Math.floor(Math.random() * 94 + 32));
    }
    return key;
}

describe('VersionID', () => {
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
            assert(VID.decode('foo') instanceof Error);
        });

        it('should encode and decode versionIds', () => {
            const encoded = vids.map(vid => VID.encode(vid));
            const decoded = encoded.map(vid => VID.decode(vid));
            assert.strictEqual(vids.length, count);
            assert.deepStrictEqual(vids, decoded);
        });
    });

    describe('::hasRepGroupId', () => {
        it('should find if version id has replication group id', () => {
            const repGroupId1 = 'ZENKO  ';
            const vid1 = VID.generateVersionId(randkey(15), repGroupId1);
            // generate random 7 characters
            const repGroupId2 = crypto.randomBytes(4).toString('hex').slice(1);
            const vid2 = VID.generateVersionId(randkey(15), repGroupId2);
            assert.strictEqual(VID.hasRepGroupId(vid1, 'fAlSe'), false);
            assert.strictEqual(VID.hasRepGroupId(vid2, 'nope012'), false);
            assert.strictEqual(VID.hasRepGroupId(vid1, repGroupId1), true);
            assert.strictEqual(VID.hasRepGroupId(vid2, repGroupId2), true);

            // to compare against production version ids with existing default
            // replication group id
            const repGroupIdDefault = 'RG001  ';
            [
                '98445675956517999999RG001  14.124.3',
                '99999999999999999999RG001  ',
                '98445608101957999999RG001  24.14',
            ].forEach(v => {
                assert.strictEqual(
                    VID.hasRepGroupId(v, repGroupIdDefault), true);
            });
        });
    });
});
