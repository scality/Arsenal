const assert = require('assert');
const crypto = require('crypto');

const objectUtils =
    require('../../../lib/s3middleware/objectUtils');

const hexHash = 'd41d8cd98f00b204e9800998ecf8427e';
const base64Hash = '1B2M2Y8AsgTpgAmY7PhCfg==';

describe('s3middleware object utilites', () => {
    it('should convert hexademal MD5 to base 64', done => {
        const hash = crypto.createHash('md5').digest('hex');
        const convertedHash = objectUtils.getBase64MD5(hash);
        assert.strictEqual(convertedHash, base64Hash);
        done();
    });

    it('should convert base 64 MD5 to hexadecimal', done => {
        const hash = crypto.createHash('md5').digest('base64');
        const convertedHash = objectUtils.getHexMD5(hash);
        assert.strictEqual(convertedHash, hexHash);
        done();
    });
});
