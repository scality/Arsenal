const crypto = require('crypto');
const MVID = require('../../../lib/versioning/MicroVersionId');
const assert = require('assert');

function randomRepGroupId() {
    return crypto.randomBytes(7).toString('hex').slice(0, 7);
}

describe('microVersionId', () => {
    it('should generate unique, length-27 timestamp-ordered ids', () => {
        const repGroupId = randomRepGroupId();
        const ids = Array(1000).fill(null).map(() => MVID.generate(repGroupId));

        assert.strictEqual(new Set(ids).size, ids.length);
        ids.forEach(id => assert.strictEqual(id.length, 27));

        // reversed-time scheme: newer values sort before older ones
        const isDecreasing = ids.slice(1).every((id, i) => id < ids[i]);
        assert(isDecreasing);
    });

    it('should embed the replication group id', () => {
        const repGroupId = randomRepGroupId();
        const id = MVID.generate(repGroupId);
        assert.strictEqual(id.slice(20), repGroupId);
    });

    it('should space-pad a short replication group id', () => {
        const id = MVID.generate('abc');
        assert.strictEqual(id.length, 27);
        assert.strictEqual(id.slice(20), 'abc    ');
    });

    it('should truncate a long replication group id', () => {
        const id = MVID.generate('abcdefghij');
        assert.strictEqual(id.length, 27);
        assert.strictEqual(id.slice(20), 'abcdefg');
    });

    it('should round-trip through encode/decode', () => {
        const repGroupId = randomRepGroupId();
        const id = MVID.generate(repGroupId);

        const encoded = MVID.encode(id);
        assert.notStrictEqual(encoded, id);

        const decoded = MVID.decode(encoded);
        assert.strictEqual(decoded, id);
    });

    it('should return an Error for legacy 16-char hex microVersionIds', () => {
        const legacy = '0123456789abcdef';
        assert(MVID.decode(legacy) instanceof Error);
    });

    it('should return an Error for anything not matching the current format', () => {
        assert(MVID.decode('not-valid-hex!') instanceof Error);

        // valid hex but wrong length
        const wrongLength = Buffer.from('short').toString('hex');
        assert(MVID.decode(wrongLength) instanceof Error);
    });

    it('should compare microVersionIds chronologically', () => {
        const repGroupId = randomRepGroupId();
        const older = MVID.generate(repGroupId);
        const newer = MVID.generate(repGroupId);

        assert(MVID.compare(newer, older) > 0);
        assert(MVID.compare(older, newer) < 0);
        assert.strictEqual(MVID.compare(newer, newer), 0);
    });
});
