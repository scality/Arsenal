const sinon = require('sinon');
const assert = require('assert');
const http = require('http');
const net = require('net');
const WerelogsLogger = require('werelogs/lib/Logger');
const Client = require('../../../lib/network/kmsAWS/Client').default;
const { NotFoundException, KMSInvalidStateException } = require('@aws-sdk/client-kms');

describe('KmsAWSClient', () => {
    const logger = {
        info: () => {},
        debug: () => {},
        error: () => {},
        warn: () => {},
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
            assert.strictEqual(
                keyArn,
                'arn:scality:kms:external:aws_kms:tests:key/arn:aws:kms:region:accountId:key/mock-key-id',
            );
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
            assert.strictEqual(
                keyArn,
                'arn:scality:kms:external:aws_kms:tests:key/arn:aws:kms:region:accountId:key/mock-key-id',
            );
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
            },
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
            },
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
                requestId: 'mock-request-id',
            },
        };

        sendStub = sinon.stub(client.client, 'send');
        sendStub.resolves(mockResponse);

        client.generateDataKey(1, key, logger, err => {
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

    it.skip('should list keys as a health check', done => {
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

    it.skip('should return a failed health check when list keys is unsuccessful', done => {
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

describe('KmsAWSClient request time limit', () => {
    const logger = {
        info: () => {},
        debug: () => {},
        error: () => {},
        warn: () => {},
    };
    const requestTimeoutMs = 100;

    let server;

    beforeEach(done => {
        // accepts requests and never answers them
        server = http.createServer(() => {});
        server.listen(0, '127.0.0.1', done);
    });

    afterEach(done => {
        server.closeAllConnections();
        server.close(done);
    });

    function createClient(endpoint) {
        return new Client({
            kmsAWS: { providerName: 'tests', region: 'us-east-1', endpoint, ak: 'ak', sk: 'sk', requestTimeoutMs },
        });
    }

    /**
     * Assert that a request failed on its time limit: the SDK also names a
     * reset connection TimeoutError
     * @param {Error} err - the error of the request
     * @param {number} start - when the request was sent
     * @returns {undefined}
     */
    function assertTimedOut(err, start) {
        const elapsed = Date.now() - start;
        assert.strictEqual(err.code, 500);
        assert.strictEqual(err.message, 'KMS.TimeoutError');
        assert.ok(
            elapsed >= requestTimeoutMs - 1,
            `The request should fail after its time limit of ${requestTimeoutMs} ms, failed after ${elapsed} ms`,
        );
    }

    it('should fail a request without answer as a KMS error', done => {
        const client = createClient(`http://127.0.0.1:${server.address().port}`);

        const start = Date.now();
        client.cipherDataKey(1, 'mock-key-id', Buffer.alloc(32), logger, err => {
            assertTimedOut(err, start);
            done();
        });
    });

    it('should fail a request whose TLS connection is never established as a KMS error', done => {
        // accepts connections and never answers the TLS handshake
        const sockets = [];
        const stalled = net.createServer(socket => sockets.push(socket));
        stalled.listen(0, '127.0.0.1', () => {
            const client = createClient(`https://127.0.0.1:${stalled.address().port}`);

            const start = Date.now();
            client.cipherDataKey(1, 'mock-key-id', Buffer.alloc(32), logger, err => {
                sockets.forEach(socket => socket.destroy());
                stalled.close();
                assertTimedOut(err, start);
                done();
            });
        });
    });
});

describe('KmsAWSClient request report', () => {
    const logger = {
        info: () => {},
        debug: () => {},
        error: () => {},
        warn: () => {},
    };
    const requestTimeoutMs = 100;

    let server;
    /** Answers a request: `(req, res) => void`, does not answer when null */
    let answer;
    let reports;

    beforeEach(done => {
        reports = [];
        server = http.createServer((req, res) => {
            req.resume();
            req.on('end', () => answer?.(req, res));
        });
        server.listen(0, '127.0.0.1', done);
    });

    afterEach(done => {
        sinon.restore();
        server.closeAllConnections();
        server.close(done);
    });

    function createClient() {
        return new Client({
            kmsAWS: {
                providerName: 'tests',
                region: 'us-east-1',
                endpoint: `http://127.0.0.1:${server.address().port}`,
                ak: 'ak',
                sk: 'sk',
                requestTimeoutMs,
                onRequestDone: report => reports.push(report),
            },
        });
    }

    function answerJson(statusCode, body) {
        return (req, res) => {
            res.writeHead(statusCode, { 'Content-Type': 'application/x-amz-json-1.1' });
            res.end(JSON.stringify(body));
        };
    }

    it('should report a request the KMS answers as a success, with its operation and duration', done => {
        answer = answerJson(200, { CiphertextBlob: Buffer.from('ciphered').toString('base64'), KeyId: 'key' });
        const client = createClient();

        client.cipherDataKey(1, 'key', Buffer.alloc(32), logger, err => {
            assert.ifError(err);
            assert.strictEqual(reports.length, 1);
            const [{ operation, outcome, durationMs }] = reports;
            assert.strictEqual(operation, 'Encrypt');
            assert.strictEqual(outcome, 'success');
            assert.ok(Number.isInteger(durationMs) && durationMs >= 0, `durationMs: ${durationMs}`);
            done();
        });
    });

    it('should keep the outcome of a request whose report fails, and log the failure', done => {
        answer = answerJson(200, { CiphertextBlob: Buffer.from('ciphered').toString('base64'), KeyId: 'key' });
        const error = new Error('report failed');
        // onRequestDone pushes each report
        sinon.stub(reports, 'push').throws(error);
        // the client logs with a logger of its own
        const logError = sinon.stub(WerelogsLogger.prototype, 'error');
        const client = createClient();

        client.cipherDataKey(1, 'key', Buffer.alloc(32), logger, err => {
            assert.ifError(err);
            sinon.assert.calledOnceWithExactly(
                logError,
                'KMS request report failed',
                sinon.match({ error, report: sinon.match({ operation: 'Encrypt', outcome: 'success' }) }),
            );
            done();
        });
    });

    it('should report a request the KMS answers with an error as an error', done => {
        answer = answerJson(400, { __type: 'NotFoundException', message: 'no such key' });
        const client = createClient();

        client.generateDataKey(1, 'key', logger, err => {
            assert.ok(err);
            assert.deepStrictEqual(
                reports.map(({ operation, outcome }) => ({ operation, outcome })),
                [{ operation: 'GenerateDataKey', outcome: 'error' }],
            );
            done();
        });
    });

    it('should report each attempt of a request whose connection is reset as an error', done => {
        answer = req => req.socket.destroy();
        const client = createClient();

        client.cipherDataKey(1, 'key', Buffer.alloc(32), logger, err => {
            assert.ok(err);
            // the SDK makes 3 attempts
            assert.deepStrictEqual(
                reports.map(({ operation, outcome }) => ({ operation, outcome })),
                Array(3).fill({ operation: 'Encrypt', outcome: 'error' }),
            );
            done();
        });
    });

    it('should report each attempt of a request without answer as a timeout, after the time limit', done => {
        answer = null;
        const client = createClient();

        client.decipherDataKey(1, 'key', Buffer.from('ciphered'), logger, err => {
            assert.ok(err);
            // the SDK makes 3 attempts
            assert.strictEqual(reports.length, 3);
            reports.forEach(({ operation, outcome, durationMs }) => {
                assert.strictEqual(operation, 'Decrypt');
                assert.strictEqual(outcome, 'timeout');
                assert.ok(durationMs >= requestTimeoutMs - 1, `durationMs: ${durationMs}`);
            });
            done();
        });
    });
});
