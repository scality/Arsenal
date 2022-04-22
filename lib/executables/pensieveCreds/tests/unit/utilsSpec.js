const assert = require('assert');
const { parseServiceCredentials, decryptSecret } =
    require('../../utils');
const { privateKey, accessKey, secretKey, decryptedSecretKey }
    = require('../resources.json');

describe('decyrptSecret', () => {
    it('should decrypt a secret', () => {
        const instanceCredentials = {
            privateKey,
        };
        const result = decryptSecret(instanceCredentials, secretKey);
        assert.strictEqual(result, decryptedSecretKey);
    });
});

describe('parseServiceCredentials', () => {
    const conf = {
        users: [{ accessKey,
            accountType: 'service-clueso',
            secretKey,
            userName: 'Search Service Account' }],
    };
    const auth = JSON.stringify({ privateKey });

    it('should parse service credentials', () => {
        const result = parseServiceCredentials(conf, auth, 'clueso');
        const expectedResult = {
            accessKey,
            secretKey: decryptedSecretKey,
        };
        assert.deepStrictEqual(result, expectedResult);
    });

    it('should return undefined if no such service', () => {
        const result = parseServiceCredentials(conf, auth, undefined);
        assert.strictEqual(result, undefined);
    });
});
