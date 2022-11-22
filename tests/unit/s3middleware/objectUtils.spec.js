const assert = require('assert');
const crypto = require('crypto');

const objectUtils =
    require('../../../lib/s3middleware/objectUtils');

const hexHash = 'd41d8cd98f00b204e9800998ecf8427e';
const base64Hash = '1B2M2Y8AsgTpgAmY7PhCfg==';
const base64Buffer = Buffer.from([
    0xd4, 0x1d, 0x8c, 0xd9, 0x8f, 0x00, 0xb2, 0x04,
    0xe9, 0x80, 0x09, 0x98, 0xec, 0xf8, 0x42, 0x7e,
]);

describe('s3middleware object utilities', () => {
    it('should convert hexadecimal MD5 to base 64', done => {
        const hash = crypto.createHash('md5').digest('hex');
        const convertedHash = objectUtils.getBase64MD5(hash);
        assert.strictEqual(convertedHash, base64Hash);
        done();
    });

    it('should convert base 64 MD5 string to hexadecimal', done => {
        const hash = crypto.createHash('md5').digest('base64');
        const hashBuffer = objectUtils.getMD5Buffer(hash);
        assert.ok(base64Buffer.equals(hashBuffer));
        done();
    });

    it('should convert base 64 MD5 buffer to hexadecimal', done => {
        const hash = crypto.createHash('md5').digest();
        const hashBuffer = objectUtils.getMD5Buffer(hash);
        assert.ok(base64Buffer.equals(hashBuffer));
        done();
    });

    it('should convert base 64 MD5 string to hexadecimal', done => {
        const hash = crypto.createHash('md5').digest('base64');
        const convertedHash = objectUtils.getHexMD5(hash);
        assert.strictEqual(convertedHash, hexHash);
        done();
    });

    it('should convert base 64 MD5 buffer to hexadecimal', done => {
        const hash = crypto.createHash('md5').digest();
        const convertedHash = objectUtils.getHexMD5(hash);
        assert.strictEqual(convertedHash, hexHash);
        done();
    });
});
