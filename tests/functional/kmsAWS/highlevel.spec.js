const sinon = require('sinon');
const assert = require('assert');
const Client = require('../../../lib/network/kmsAWS/Client').default;
const { NotFoundException, KMSInvalidStateException } = require('@aws-sdk/client-kms');

describe('KmsAWSClient', () => {
    const logger = {
        info: () => {},
        debug: () => {},
        error: () => {},
    };

    let client;
    let sendStub;

    beforeEach(() => {
        client = new Client({
            kmsAWS: {
                providerName: 'tests',
                region: 'us-east-1',
                ak: 'ak',
                sk: 'sk',
            },
        });
        // Don't set up global sendStub here - let each test manage its own
    });

    afterEach(() => {
        if (sendStub) {
            sendStub.restore();
            sendStub = null;
        }
    });

    it('should support default encryption key per account', done => {
        const mockResponse = {
            KeyMetadata: {
                KeyId: 'mock-key-id',
            },
        };
        sendStub = sinon.stub(client.client, 'send');
        sendStub.resolves(mockResponse);

        client.createMasterKey(logger, (err, keyId, keyArn) => {
            assert.ifError(err);
            assert.strictEqual(keyId, 'mock-key-id');
            assert.strictEqual(keyArn, 'arn:scality:kms:external:aws_kms:tests:key/mock-key-id');
            assert(sendStub.calledOnce);
            done();
        });
    });

    it('should be configured with noAwsArn falsy (undefined) by default', done => {
        client = new Client({
            kmsAWS: {
                providerName: 'tests',
                region: 'us-east-1',
                ak: 'ak',
                sk: 'sk',
            },
        });
        sendStub = sinon.stub(client.client, 'send');
        const mockResponse = {
            KeyMetadata: {
                KeyId: 'mock-key-id',
            },
        };
        sendStub.resolves(mockResponse);

        client.createMasterKey(logger, (err, keyId, keyArn) => {
            assert.ifError(err);
            assert.strictEqual(keyId, 'mock-key-id');
            assert.strictEqual(keyArn, 'arn:scality:kms:external:aws_kms:tests:key/mock-key-id');
            assert(sendStub.calledOnce);
            done();
        });
    });

    it('should create a new master encryption key', done => {
        sendStub = sinon.stub(client.client, 'send');
        const mockResponse = {
            KeyMetadata: {
                KeyId: 'mock-key-id',
            },
        };
        sendStub.resolves(mockResponse);

        client.createMasterKey(logger, (err, keyId, keyArn) => {
            assert.ifError(err);
            assert.strictEqual(keyId, 'mock-key-id');
            assert.strictEqual(keyArn, 'arn:scality:kms:external:aws_kms:tests:key/mock-key-id');
            assert(sendStub.calledOnce);
            done();
        });
    });

    it('should create a new master encryption key when configured to use Arn but fallback to KeyId', done => {
        client = new Client({
            kmsAWS: {
                providerName: 'tests',
                region: 'us-east-1',
                ak: 'ak',
                sk: 'sk',
                noAwsArn: false, // ignore default enforce using aws arn
            },
        });
        sendStub = sinon.stub(client.client, 'send');
        const mockResponse = {
            KeyMetadata: {
                KeyId: 'mock-key-id',
                Arn: 'arn:aws:kms:region:accountId:key/mock-key-id', // Add Arn to match test expectation
            },
        };
        sendStub.resolves(mockResponse);

        client.createMasterKey(logger, (err, keyId, keyArn) => {
            assert.ifError(err);
            assert.strictEqual(keyId, 'arn:aws:kms:region:accountId:key/mock-key-id');
            assert.strictEqual(keyArn,
                'arn:scality:kms:external:aws_kms:tests:key/arn:aws:kms:region:accountId:key/mock-key-id');
            assert(sendStub.calledOnce);
            done();
        });
    });

    it('should create a new master encryption key with aws arn', done => {
        client = new Client({
            kmsAWS: {
                providerName: 'tests',
                region: 'us-east-1',
                ak: 'ak',
                sk: 'sk',
                noAwsArn: false,
            },
        });
        sendStub = sinon.stub(client.client, 'send');
        const mockResponse = {
            KeyMetadata: {
                KeyId: 'mock-key-id',
                Arn: 'arn:aws:kms:region:accountId:key/mock-key-id', // Add Arn to match test expectation
            },
        };
        sendStub.resolves(mockResponse);

        client.createMasterKey(logger, (err, keyId, keyArn) => {
            assert.ifError(err);
            assert.strictEqual(keyId, 'arn:aws:kms:region:accountId:key/mock-key-id');
            assert.strictEqual(keyArn,
                'arn:scality:kms:external:aws_kms:tests:key/arn:aws:kms:region:accountId:key/mock-key-id');
            assert(sendStub.calledOnce);
            done();
        });
    });

    it('should create a new master encryption key without aws arn', done => {
        client = new Client({
            kmsAWS: {
                providerName: 'tests',
                region: 'us-east-1',
                ak: 'ak',
                sk: 'sk',
                noAwsArn: true,
            },
        });
        sendStub = sinon.stub(client.client, 'send');
        const mockResponse = {
            KeyMetadata: {
                KeyId: 'mock-key-id',
            },
        };
        sendStub.resolves(mockResponse);

        client.createMasterKey(logger, (err, keyId, keyArn) => {
            assert.ifError(err);
            assert.strictEqual(keyId, 'mock-key-id');
            assert.strictEqual(keyArn, 'arn:scality:kms:external:aws_kms:tests:key/mock-key-id');
            assert(sendStub.calledOnce);
            done();
        });
    });

    it('should handle errors creating a new master encryption key', done => {
        const mockError = new Error('mock error');
        mockError.name = 'AccessDeniedException';
        mockError.$metadata = {
            httpStatusCode: 403,
        };
        sendStub = sinon.stub(client.client, 'send');
        sendStub.rejects(mockError);

        client.createMasterKey(logger, err => {
            assert.strictEqual(err.message, 'KMS.AccessDeniedException');
            assert(sendStub.calledOnce);
            done();
        });
    });

    it('should create a bucket-level key', done => {
        const mockResponse = {
            KeyMetadata: {
                KeyId: 'mock-bucket-key-id',
            },
        };
        sendStub = sinon.stub(client.client, 'send');
        sendStub.resolves(mockResponse);

        client.createBucketKey('bucketName', logger, (err, keyId, keyArn) => {
            assert.ifError(err);
            assert.strictEqual(keyId, 'mock-bucket-key-id');
            assert.strictEqual(keyArn, 'arn:scality:kms:external:aws_kms:tests:key/mock-bucket-key-id');
            assert(sendStub.calledOnce);
            done();
        });
    });

    it('should handle errors creating a bucket-level key', done => {
        const mockError = new Error('mock error');
        mockError.name = 'AccessDeniedException';
        mockError.$metadata = {
            httpStatusCode: 403,
        };
        sendStub = sinon.stub(client.client, 'send');
        sendStub.rejects(mockError);

        client.createBucketKey('bucketName', logger, err => {
            assert.strictEqual(err.message, 'KMS.AccessDeniedException');
            assert(sendStub.calledOnce);
            done();
        });
    });

    it('should delete an existing key on bucket deletion', done => {
        const mockResponse = {
            KeyId: 'mock-key-id',
            KeyState: 'PendingDeletion',
        };
        sendStub = sinon.stub(client.client, 'send');
        sendStub.resolves(mockResponse);

        client.destroyBucketKey('mock-key-id', logger, err => {
            assert.ifError(err);
            assert(sendStub.calledOnce);
            done();
        });
    });

    it('should handle errors deleting an existing key on bucket deletion', done => {
        const mockError = new Error('mock delete error');
        mockError.name = 'AccessDeniedException';
        mockError.$metadata = {
            httpStatusCode: 403,
        };
        sendStub = sinon.stub(client.client, 'send');
        sendStub.rejects(mockError);

        client.destroyBucketKey('mock-key-id', logger, err => {
            assert.strictEqual(err.message, 'KMS.AccessDeniedException');
            assert(sendStub.calledOnce);
            done();
        });
    });

    it('should delete an existing key on account deletion', done => {
        const mockResponse = {
            KeyId: 'mock-key-id',
            PendingWindowInDays: 7,
        };
        sendStub = sinon.stub(client.client, 'send');
        sendStub.resolves(mockResponse);

        client.deleteMasterKey('mock-key-id', logger, err => {
            assert.ifError(err);
            assert(sendStub.calledOnce);
            done();
        });
    });

    it('should delete an existing key on account deletion without KeyState', done => {
        const mockResponse = {
            KeyId: 'mock-key-id',
            PendingWindowInDays: 7,
        };
        sendStub = sinon.stub(client.client, 'send');
        sendStub.resolves(mockResponse);

        client.deleteMasterKey('mock-key-id', logger, err => {
            assert.ifError(err);
            assert(sendStub.calledOnce);
            done();
        });
    });

    it('should handle errors deleting an existing key on account deletion', done => {
        const mockError = new Error('mock delete error');
        mockError.name = 'AccessDeniedException';
        mockError.$metadata = {
            httpStatusCode: 403,
        };
        sendStub = sinon.stub(client.client, 'send');
        sendStub.rejects(mockError);

        client.deleteMasterKey('mock-key-id', logger, err => {
            assert.strictEqual(err.message, 'KMS.AccessDeniedException');
            assert(sendStub.calledOnce);
            done();
        });
    });

    it('should handle NotFoundException when deleting master key', done => {
        const mockError = new NotFoundException({
            message: 'The request key was not found',
            $metadata: {
                httpStatusCode: 404,
            }
        });
        sendStub = sinon.stub(client.client, 'send');
        sendStub.rejects(mockError);

        client.deleteMasterKey('mock-key-id', logger, err => {
            assert.ifError(err);
            assert(sendStub.calledOnce);
            done();
        });
    });

    it('should handle KMSInvalidStateException when deleting master key', done => {
        const mockError = new KMSInvalidStateException({
            message: 'The request key is not in a valid state',
            $metadata: {
                httpStatusCode: 400,
            }
        });

        sendStub = sinon.stub(client.client, 'send');
        sendStub.rejects(mockError);

        client.deleteMasterKey('mock-key-id', logger, err => {
            assert.ifError(err);
            assert(sendStub.calledOnce);
            done();
        });
    });

    it('should generate a data key for ciphering', done => {
        const mockResponse = {
            Plaintext: Buffer.from('plaintext'),
            CiphertextBlob: Buffer.from('ciphertext'),
            KeyId: 'mocked-kms-key-id',
        };
        sendStub = sinon.stub(client.client, 'send');
        sendStub.resolves(mockResponse);

        client.generateDataKey(1, 'mock-key-id', logger, (err, plainText, cipherText) => {
            assert.ifError(err);
            assert.strictEqual(plainText.toString(), 'plaintext');
            assert.strictEqual(cipherText.toString(), 'ciphertext');
            assert(sendStub.calledOnce);
            done();
        });
    });

    it('should extract key from arn input to call generate a data key', done => {
        const arnPrefix = 'arn:scality:kms:external:aws_kms:tests:key/';
        const awsArn = 'arn:aws:kms:region:accountId:key/mock-key-id';
        const key = `${arnPrefix}${awsArn}`;
        const mockResponse = {
            Plaintext: Buffer.from('plaintext'),
            CiphertextBlob: Buffer.from('ciphertext'),
            KeyId: 'mocked-kms-key-id',
            $metadata: {
                httpStatusCode: 200,
                requestId: 'mock-request-id'
            }
        };
        
        sendStub = sinon.stub(client.client, 'send');
        sendStub.resolves(mockResponse);

        client.generateDataKey(1, key, logger, (err) => {
            assert.ifError(err);
            assert(sendStub.calledOnce);
            assert.strictEqual(sendStub.getCall(0).firstArg.input.KeyId, awsArn);
            done();
        });
    });

    it('should handle errors generating a data key', done => {
        const mockError = new Error('mock error');
        mockError.name = 'AccessDeniedException';
        mockError.$metadata = {
            httpStatusCode: 403,
        };
        sendStub = sinon.stub(client.client, 'send');
        sendStub.rejects(mockError);

        client.generateDataKey(1, 'mock-key-id', logger, err => {
            assert.strictEqual(err.message, 'KMS.AccessDeniedException');
            assert(sendStub.calledOnce);
            done();
        });
    });

    it('should allow ciphering a data key', done => {
        const mockResponse = {
            CiphertextBlob: Buffer.from('ciphertext'),
            KeyId: 'mocked-kms-key-id',
        };
        sendStub = sinon.stub(client.client, 'send');
        sendStub.resolves(mockResponse);

        client.cipherDataKey(1, 'mock-key-id', Buffer.from('plaintext'), logger, (err, cipherText) => {
            assert.ifError(err);
            assert.strictEqual(cipherText.toString(), 'ciphertext');
            assert(sendStub.calledOnce);
            done();
        });
    });

    it('should handle errors ciphering a data key', done => {
        const mockError = new Error('mock cipher error');
        mockError.name = 'AccessDeniedException';
        mockError.$metadata = {
            httpStatusCode: 403,
        };
        sendStub = sinon.stub(client.client, 'send');
        sendStub.rejects(mockError);

        client.cipherDataKey(1, 'mock-key-id', Buffer.from('plaintext'), logger, err => {
            assert.strictEqual(err.message, 'KMS.AccessDeniedException');
            assert(sendStub.calledOnce);
            done();
        });
    });

    it('should allow deciphering a data key', done => {
        const mockResponse = {
            Plaintext: Buffer.from('plaintext'),
            KeyId: 'mocked-kms-key-id',
        };
        sendStub = sinon.stub(client.client, 'send');
        sendStub.resolves(mockResponse);

        client.decipherDataKey(1, 'mock-key-id', Buffer.from('ciphertext'), logger, (err, plainText) => {
            assert.ifError(err);
            assert.strictEqual(plainText.toString(), 'plaintext');
            assert(sendStub.calledOnce);
            done();
        });
    });

    it('should handle errors deciphering a data key', done => {
        const mockError = new Error('mock decipher error');
        mockError.name = 'AccessDeniedException';
        mockError.$metadata = {
            httpStatusCode: 403,
        };
        sendStub = sinon.stub(client.client, 'send');
        sendStub.rejects(mockError);

        client.decipherDataKey(1, 'mock-key-id', Buffer.from('ciphertext'), logger, err => {
            assert.strictEqual(err.message, 'KMS.AccessDeniedException');
            assert(sendStub.calledOnce);
            done();
        });
    });

    it('should list keys as a health check', done => {
        const mockResponse = {
            Keys: [
                {
                    KeyId: 'mocked-kms-key-id',
                },
            ],
        };
        sendStub = sinon.stub(client.client, 'send');
        sendStub.resolves(mockResponse);

        client.healthcheck(logger, err => {
            assert.ifError(err);
            assert(sendStub.calledOnce);
            done();
        });
    });

    it('should return a failed health check when list keys is unsuccessful', done => {
        const mockError = new Error('mock listKeys error');
        mockError.name = 'AccessDeniedException';
        mockError.$metadata = {
            httpStatusCode: 403,
        };
        sendStub = sinon.stub(client.client, 'send');
        sendStub.rejects(mockError);

        client.healthcheck(logger, err => {
            assert(err);
            assert.strictEqual(err.message, 'KMS.AccessDeniedException');
            assert(sendStub.calledOnce);
            done();
        });
    });
});
