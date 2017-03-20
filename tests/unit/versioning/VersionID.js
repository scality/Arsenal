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
    process.env.VID_CRYPTO_PASSWORD = randkey(64);

    it('sorted in reversed chronological and alphabetical order', done => {
        let previd = null;
        for (let i = 0; i < count; i++) {
            vids[i] = VID.generateVersionId(randkey(15));
            if (previd) {
                assert(previd > vids[i], 'versionIds increased');
                previd = vids[i];
            }
        }
        done();
    });

    it('should not decrypt bad versionIds', done => {
        const encrypted = vids.map(vid => VID.encrypt(vid));
        try {
            encrypted.map(vid => VID.decrypt(`${vid}foo`));
            done('decrypted bad versionIds with good password');
        } catch (exception) {
            done();
        }
    });

    it('should encrypt and decrypt versionIds using same password', done => {
        const encrypted = vids.map(vid => VID.encrypt(vid));
        const decrypted = encrypted.map(vid => VID.decrypt(vid));
        assert.strictEqual(vids.length, count);
        // workaround because assert.strictEqual(vids, decrypted) does not work
        assert.strictEqual(vids.length, decrypted.length);
        for (let i = 0; i < count; i++) {
            assert.strictEqual(vids[i], decrypted[i]);
        }
        done();
    });
});
