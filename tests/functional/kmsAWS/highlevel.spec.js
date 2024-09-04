const sinon = require('sinon');
const assert = require('assert');
const Client = require('../../../lib/network/kmsAWS/Client').default;

describe('KmsAWSClient', () => {
    const logger = {
        debug: () => {},
        error: () => {},
    };

    let client;
    let createKeyStub;
    let scheduleKeyDeletionStub;
    let generateDataKeyStub;
    let encryptStub;
    let decryptStub;
    let listKeysStub;

    beforeEach(() => {
        client = new Client({
            kmsAWS: {
                region: 'us-east-1',
                ak: 'ak',
                sk: 'sk',
            },
        });

        const kmsInstance = client.client;
        createKeyStub = sinon.stub(kmsInstance, 'createKey');
        scheduleKeyDeletionStub = sinon.stub(kmsInstance, 'scheduleKeyDeletion');
        generateDataKeyStub = sinon.stub(kmsInstance, 'generateDataKey');
        encryptStub = sinon.stub(kmsInstance, 'encrypt');
        decryptStub = sinon.stub(kmsInstance, 'decrypt');
        listKeysStub = sinon.stub(kmsInstance, 'listKeys');
    });

    afterEach(() => {
        createKeyStub.restore();
        scheduleKeyDeletionStub.restore();
        generateDataKeyStub.restore();
        encryptStub.restore();
        decryptStub.restore();
        listKeysStub.restore();
    });

    it('should support default encryption key per account', () => {
        assert.strictEqual(client.supportsDefaultKeyPerAccount, true);
    });

    it('should create a new master encryption key', done => {
        const mockResponse = {
            KeyMetadata: {
                KeyId: 'mock-key-id',
            },
        };
        createKeyStub.yields(null, mockResponse);

        client.createMasterKey(logger, (err, keyId) => {
            assert.ifError(err);
            assert.strictEqual(keyId, 'mock-key-id');
            assert(createKeyStub.calledOnce);
            done();
        });
    });

    it('should handle errors creating a new master encryption key', done => {
        const mockError = new Error('mock error');
        createKeyStub.yields(mockError, null);

        client.createMasterKey(logger, err => {
            assert.strictEqual(err.message, 'InternalError');
            assert(createKeyStub.calledOnce);
            done();
        });
    });

    it('should create a bucket-level key', done => {
        const mockResponse = {
            KeyMetadata: {
                KeyId: 'mock-bucket-key-id',
            },
        };
        createKeyStub.yields(null, mockResponse);

        client.createBucketKey('bucketName', logger, (err, keyId) => {
            assert.ifError(err);
            assert.strictEqual(keyId, 'mock-bucket-key-id');
            assert(createKeyStub.calledOnce);
            done();
        });
    });

    it('should handle errors creating a bucket-level key', done => {
        const mockError = new Error('mock error');
        createKeyStub.yields(mockError, null);

        client.createBucketKey('bucketName', logger, err => {
            assert.strictEqual(err.message, 'InternalError');
            assert(createKeyStub.calledOnce);
            done();
        });
    });

    it('should delete an existing key on bucket deletion', done => {
        const mockResponse = {
            KeyState: 'PendingDeletion',
        };
        scheduleKeyDeletionStub.yields(null, mockResponse);

        client.destroyBucketKey('mock-key-id', logger, err => {
            assert.ifError(err);
            assert(scheduleKeyDeletionStub.calledOnce);
            done();
        });
    });

    it('should handle errors deleting an existing key on bucket deletion', done => {
        const mockError = new Error('mock delete error');
        scheduleKeyDeletionStub.yields(mockError, null);

        client.destroyBucketKey('mock-key-id', logger, err => {
            assert.strictEqual(err.message, 'InternalError');
            assert(scheduleKeyDeletionStub.calledOnce);
            done();
        });
    });

    it('should delete an existing key on account deletion', done => {
        const mockResponse = {
            KeyId: 'mocked-kms-key-id',
            KeyState: 'PendingDeletion',
            PendingWindowInDays: 7,
        };
        scheduleKeyDeletionStub.yields(null, mockResponse);

        client.deleteMasterKey('mock-key-id', logger, err => {
            assert.ifError(err);
            assert(scheduleKeyDeletionStub.calledOnce);
            done();
        });
    });

    it('should delete an existing key on account deletion without KeyState', done => {
        const mockResponse = {
            KeyId: 'mocked-kms-key-id',
            PendingWindowInDays: 7,
        };
        scheduleKeyDeletionStub.yields(null, mockResponse);

        client.deleteMasterKey('mock-key-id', logger, err => {
            assert.ifError(err);
            assert(scheduleKeyDeletionStub.calledOnce);
            done();
        });
    });

    it('should handle errors deleting an existing key on account deletion', done => {
        const mockError = new Error('mock delete error');
        scheduleKeyDeletionStub.yields(mockError, null);

        client.deleteMasterKey('mock-key-id', logger, err => {
            assert.strictEqual(err.message, 'InternalError');
            assert(scheduleKeyDeletionStub.calledOnce);
            done();
        });
    });

    it('should generate a data key for ciphering', done => {
        const mockResponse = {
            Plaintext: Buffer.from('plaintext'),
            CiphertextBlob: Buffer.from('ciphertext'),
            KeyId: 'mocked-kms-key-id',
        };
        generateDataKeyStub.yields(null, mockResponse);

        client.generateDataKey(1, 'mock-key-id', logger, (err, plainText, cipherText) => {
            assert.ifError(err);
            assert.strictEqual(plainText.toString(), 'plaintext');
            assert.strictEqual(cipherText.toString(), 'ciphertext');
            assert(generateDataKeyStub.calledOnce);
            done();
        });
    });

    it('should handle errors generating a data key', done => {
        const mockError = new Error('mock error');
        generateDataKeyStub.yields(mockError, null);

        client.generateDataKey(1, 'mock-key-id', logger, err => {
            assert.strictEqual(err.message, 'InternalError');
            assert(generateDataKeyStub.calledOnce);
            done();
        });
    });

    it('should allow ciphering a data key', done => {
        const mockResponse = {
            CiphertextBlob: Buffer.from('ciphertext'),
            KeyId: 'mocked-kms-key-id',
        };
        encryptStub.yields(null, mockResponse);

        client.cipherDataKey(1, 'mock-key-id', Buffer.from('plaintext'), logger, (err, cipherText) => {
            assert.ifError(err);
            assert.strictEqual(cipherText.toString(), 'ciphertext');
            assert(encryptStub.calledOnce);
            done();
        });
    });

    it('should handle errors ciphering a data key', done => {
        const mockError = new Error('mock cipher error');
        encryptStub.yields(mockError, null);

        client.cipherDataKey(1, 'mock-key-id', Buffer.from('plaintext'), logger, err => {
            assert.strictEqual(err.message, 'InternalError');
            assert(encryptStub.calledOnce);
            done();
        });
    });

    it('should allow deciphering a data key', done => {
        const mockResponse = {
            Plaintext: Buffer.from('plaintext'),
            KeyId: 'mocked-kms-key-id',
        };
        decryptStub.yields(null, mockResponse);

        client.decipherDataKey(1, 'mock-key-id', Buffer.from('ciphertext'), logger, (err, plainText) => {
            assert.ifError(err);
            assert.strictEqual(plainText.toString(), 'plaintext');
            assert(decryptStub.calledOnce);
            done();
        });
    });

    it('should handle errors deciphering a data key', done => {
        const mockError = new Error('mock decipher error');
        decryptStub.yields(mockError, null);

        client.decipherDataKey(1, 'mock-key-id', Buffer.from('ciphertext'), logger, err => {
            assert.strictEqual(err.message, 'InternalError');
            assert(decryptStub.calledOnce);
            done();
        });
    });

    it.skip('should check the health of the KMS connection', done => {
        const mockResponse = {
            Keys: [
                { KeyId: 'mock-key-id' },
            ],
        };
        listKeysStub.yields(null, mockResponse);

        client.healthcheck(logger, err => {
            assert.ifError(err);
            assert(listKeysStub.calledOnce);
            done();
        });
    });

    it.skip('should return a failed health check when list keys is unsuccessful', done => {
        const mockError = new Error('mock listKeys error');
        listKeysStub.yields(mockError, null);

        client.healthcheck(logger, err => {
            assert(err);
            assert.strictEqual(err.message, 'InternalError');
            assert(listKeysStub.calledOnce);
            done();
        });
    });
});
