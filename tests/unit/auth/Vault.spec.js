'use strict'; // eslint-disable-line strict

const assert = require('assert');
const sinon = require('sinon');
const { vaultSignatureCb } = require('../../../lib/auth/Vault');

const Vault = require('../../../lib/auth/Vault').default;
const AuthInfo = require('../../../lib/auth/AuthInfo').default;
const DummyRequestLogger = require('../helpers').DummyRequestLogger;

const log = new DummyRequestLogger();

const mockUserInfo = {
    arn: 'arn:aws:iam::123456789012:user/testUser',
    canonicalID: 'canonical123',
    shortid: '123456789012',
    email: 'test@example.com',
    accountDisplayName: 'TestAccount',
    IAMdisplayName: 'TestUser',
};

describe('vaultSignatureCb', () => {
    let sandbox;

    beforeEach(() => {
        sandbox = sinon.createSandbox();
    });

    afterEach(() => {
        sandbox.restore();
    });

    it('should handle error case', done => {
        const mockError = new Error('Test error');
        const cb = sandbox.stub();

        vaultSignatureCb(mockError, null, log, cb);
        assert(cb.calledOnceWith(mockError));
        done();
    });

    it('should process successful response', done => {
        const mockAuthInfo = {
            message: {
                message: 'Success',
                body: {
                    userInfo: mockUserInfo,
                    authorizationResults: [{ isAllowed: true }],
                },
            },
        };
        const cb = sandbox.stub();

        vaultSignatureCb(null, mockAuthInfo, log, cb);
        assert(cb.calledOnce);
        const [err, authInfo, results] = cb.firstCall.args;
        assert.strictEqual(err, null);
        assert(authInfo instanceof AuthInfo);
        assert.deepStrictEqual(results, [{ isAllowed: true }]);
        done();
    });
});

describe('Vault class', () => {
    let vault;
    let mockClient;
    let sandbox;

    beforeEach(() => {
        sandbox = sinon.createSandbox();
        mockClient = {
            verifySignatureV4: sandbox.stub(),
            verifySignatureV2: sandbox.stub(),
            healthcheck: sandbox.stub(),
            report: sandbox.stub(),
            getCanonicalIds: sandbox.stub(),
            getEmailAddresses: sandbox.stub(),
            getAccountIds: sandbox.stub(),
            getCanonicalIdsByAccountIds: sandbox.stub(),
            checkPolicies: sandbox.stub(),
            getOrCreateEncryptionKeyId: sandbox.stub(),
        };

        vault = new Vault(mockClient, 'mockImpl');
    });

    afterEach(() => {
        sandbox.restore();
    });

    describe('authenticateV2Request', () => {
        const mockParams = {
            version: 2,
            log,
            data: {
                securityToken: 'testToken',
                accessKey: 'testAccessKey',
                signatureFromRequest: 'testSignature',
                stringToSign: 'testString',
                algo: 'sha256',
                authType: 'header',
                signatureVersion: 'AWS',
                signatureAge: 1000,
                log,
            },
        };

        it('should handle successful V2 authentication', done => {
            const mockResponse = {
                message: {
                    message: 'Success',
                    body: { userInfo: mockUserInfo },
                },
            };
            mockClient.verifySignatureV2.callsFake((_, __, ___, ____, cb) => cb(null, mockResponse));

            vault.authenticateV2Request(mockParams, [], (err, data) => {
                assert.strictEqual(err, null);
                assert(data instanceof AuthInfo);
                assert.strictEqual(data.getCanonicalID(), mockUserInfo.canonicalID);
                done();
            });
        });

        it('should handle V2 authentication error', done => {
            const mockError = new Error('V2 Auth failed');
            mockClient.verifySignatureV2.callsFake((_, __, ___, ____, cb) => cb(mockError));

            vault.authenticateV2Request(mockParams, [], (err) => {
                assert.strictEqual(err, mockError);
                done();
            });
        });
    });

    describe('authenticateV4Request', () => {
        const mockParams = {
            version: 4,
            log,
            data: {
                accessKey: 'testAccessKey',
                signatureFromRequest: 'testSignature',
                region: 'us-east-1',
                stringToSign: 'testStringToSign',
                scopeDate: '20250122',
                authType: 'header',
                signatureVersion: '4',
                signatureAge: 0,
                timestamp: Date.now(),
                credentialScope: 'testScope',
                securityToken: 'testToken',
                algo: 'sha256',
                log,
            },
        };

        it('should handle successful authentication with quota', done => {
            const mockAccountQuota = {
                account: '123456789012',
                quota: BigInt(1000),
            };

            const mockResponse = {
                message: {
                    message: 'Success',
                    body: {
                        userInfo: mockUserInfo,
                        authorizationResults: [{
                            isAllowed: true,
                            isImplicit: false,
                            arn: mockUserInfo.arn,
                            action: 'testAction',
                        }],
                        accountQuota: mockAccountQuota,
                    },
                },
            };

            mockClient.verifySignatureV4.callsFake(
                (_stringToSign, _signature, _accessKey, _region, _scopeDate,
                    _options, callback) => {
                    callback(null, mockResponse);
                },
            );

            vault.authenticateV4Request(mockParams, [], {}, (err, data, results,
                _params, infos) => {
                assert.strictEqual(err, null);
                assert(data instanceof AuthInfo);
                assert.strictEqual(data.getCanonicalID(), mockUserInfo.canonicalID);
                assert.deepStrictEqual(infos.accountQuota, mockAccountQuota);
                done();
            });
        });

        it('should handle authentication with missing quota', done => {
            const mockResponse = {
                message: {
                    message: 'Success',
                    body: {
                        userInfo: mockUserInfo,
                        authorizationResults: [{
                            isAllowed: true,
                            isImplicit: false,
                            arn: mockUserInfo.arn,
                            action: 'testAction',
                        }],
                    },
                },
            };

            mockClient.verifySignatureV4.callsFake(
                (_stringToSign, _signature, _accessKey, _region, _scopeDate,
                    _options, callback) => {
                    callback(null, mockResponse);
                },
            );

            vault.authenticateV4Request(mockParams, [], {}, (err, data, results,
                _params, infos) => {
                assert.strictEqual(err, null);
                assert(data instanceof AuthInfo);
                assert.deepStrictEqual(infos.accountQuota, {});
                done();
            });
        });

        it('should handle authentication failure', done => {
            const mockError = new Error('Authentication failed');
            mockClient.verifySignatureV4.callsFake(
                (_stringToSign, _signature, _accessKey, _region, _scopeDate,
                    _options, callback) => {
                    callback(mockError);
                },
            );

            vault.authenticateV4Request(mockParams, [], {}, err => {
                assert.strictEqual(err, mockError);
                done();
            });
        });

        it('should properly serialize request contexts', done => {
            const mockRequestContexts = [{
                serialize: () => ({ serialized: 'context' }),
            }];

            const mockResponse = {
                message: {
                    message: 'Success',
                    body: {
                        userInfo: mockUserInfo,
                        authorizationResults: [{
                            isAllowed: true,
                            isImplicit: false,
                            arn: mockUserInfo.arn,
                            action: 'testAction',
                        }],
                    },
                },
            };

            mockClient.verifySignatureV4.callsFake(
                (_stringToSign, _signature, _accessKey, _region, _scopeDate,
                    options, callback) => {
                    assert.deepStrictEqual(options.requestContext,
                        [{ serialized: 'context' }]);
                    callback(null, mockResponse);
                },
            );

            vault.authenticateV4Request(mockParams, mockRequestContexts, {},
                (err, data) => {
                    assert.strictEqual(err, null);
                    assert(data instanceof AuthInfo);
                    done();
                });
        });

        it('should handle quota with large numbers', done => {
            const largeQuota = {
                account: '123456789012',
                quota: BigInt('9007199254740992'),
            };

            const mockResponse = {
                message: {
                    message: 'Success',
                    body: {
                        userInfo: mockUserInfo,
                        authorizationResults: [{
                            isAllowed: true,
                            isImplicit: false,
                            arn: mockUserInfo.arn,
                            action: 'testAction',
                        }],
                        accountQuota: largeQuota,
                    },
                },
            };

            mockClient.verifySignatureV4.callsFake(
                (_stringToSign, _signature, _accessKey, _region, _scopeDate,
                    _options, callback) => {
                    callback(null, mockResponse);
                },
            );

            vault.authenticateV4Request(mockParams, [], {}, (err, _data, _results,
                _params, infos) => {
                assert.strictEqual(err, null);
                assert.strictEqual(infos.accountQuota.quota.toString(),
                    '9007199254740992');
                done();
            });
        });

        it('should handle authentication with additional options', done => {
            const mockOptions = {
                get: true,
            };

            const mockResponse = {
                message: {
                    message: 'Success',
                    body: {
                        userInfo: mockUserInfo,
                        authorizationResults: [{
                            isAllowed: true,
                            isImplicit: false,
                            arn: mockUserInfo.arn,
                            action: 'testAction',
                        }],
                    },
                },
            };

            mockClient.verifySignatureV4.callsFake(
                (_stringToSign, _signature, _accessKey, _region, _scopeDate,
                    _options, callback) => {
                    assert.strictEqual(_options.get, true);
                    callback(null, mockResponse);
                },
            );

            vault.authenticateV4Request(mockParams, [], mockOptions, (err, data) => {
                assert.strictEqual(err, null);
                assert(data instanceof AuthInfo);
                done();
            });
        });

        it('should handle successful authentication with account limits', done => {
            const limitConfig = {
                RequestsPerSecond: {
                    Limit: 1500,
                },
            };
            const mockResponse = {
                message: {
                    message: 'Success',
                    body: {
                        userInfo: mockUserInfo,
                        authorizationResults: [{
                            isAllowed: true,
                            isImplicit: false,
                            arn: mockUserInfo.arn,
                            action: 'testAction',
                        }],
                        limits: limitConfig,
                    },
                },
            };

            mockClient.verifySignatureV4.callsFake(
                (_stringToSign, _signature, _accessKey, _region, _scopeDate,
                    _options, callback) => {
                    callback(null, mockResponse);
                },
            );

            vault.authenticateV4Request(mockParams, [], {}, (err, data, results,
                _params, infos) => {
                assert.strictEqual(err, null);
                assert(data instanceof AuthInfo);
                assert.strictEqual(data.getCanonicalID(), mockUserInfo.canonicalID);
                assert.deepStrictEqual(infos.limits, limitConfig);
                done();
            });
        });

        it('should handle authentication with no account limits', done => {
            const mockResponse = {
                message: {
                    message: 'Success',
                    body: {
                        userInfo: mockUserInfo,
                        authorizationResults: [{
                            isAllowed: true,
                            isImplicit: false,
                            arn: mockUserInfo.arn,
                            action: 'testAction',
                        }],
                    },
                },
            };

            mockClient.verifySignatureV4.callsFake(
                (_stringToSign, _signature, _accessKey, _region, _scopeDate,
                    _options, callback) => {
                    callback(null, mockResponse);
                },
            );

            vault.authenticateV4Request(mockParams, [], {}, (err, data, results,
                _params, infos) => {
                assert.strictEqual(err, null);
                assert(data instanceof AuthInfo);
                assert.deepStrictEqual(infos.limits, {});
                done();
            });
        });
    });

    describe('getCanonicalIds', () => {
        it('should return canonical IDs for valid emails', done => {
            const mockEmails = ['test@example.com'];
            const mockResponse = {
                message: { body: { 'test@example.com': 'canonical123' } },
            };
            mockClient.getCanonicalIds.callsFake((_, __, cb) => cb(null, mockResponse));

            vault.getCanonicalIds(mockEmails, log, (err, data) => {
                assert.strictEqual(err, null);
                assert.deepStrictEqual(data, [{
                    email: 'test@example.com',
                    canonicalID: 'canonical123',
                }]);
                done();
            });
        });

        it('should return error for invalid email format', done => {
            const mockEmails = ['invalid'];
            const mockResponse = {
                message: { body: { invalid: 'WrongFormat' } },
            };
            mockClient.getCanonicalIds.callsFake((_, __, cb) => cb(null, mockResponse));

            vault.getCanonicalIds(mockEmails, log, (err) => {
                assert(err instanceof Error);
                done();
            });
        });
    });

    describe('getEmailAddresses', () => {
        it('should return email addresses for valid canonical IDs', done => {
            const mockIds = ['canonical123'];
            const mockResponse = {
                message: { body: { canonical123: 'test@example.com' } },
            };
            mockClient.getEmailAddresses.callsFake((_, __, cb) => cb(null, mockResponse));

            vault.getEmailAddresses(mockIds, log, (err, data) => {
                assert.strictEqual(err, null);
                assert.deepStrictEqual(data, { canonical123: 'test@example.com' });
                done();
            });
        });

        it('should exclude not found entries', done => {
            const mockIds = ['canonical123'];
            const mockResponse = {
                message: { body: { canonical123: 'NotFound' } },
            };
            mockClient.getEmailAddresses.callsFake((_, __, cb) => cb(null, mockResponse));

            vault.getEmailAddresses(mockIds, log, (err, data) => {
                assert.strictEqual(err, null);
                assert.deepStrictEqual(data, {});
                done();
            });
        });
    });

    describe('getAccountIds', () => {
        it('should return account IDs for valid canonical IDs', done => {
            const mockIds = ['canonical123'];
            const mockResponse = {
                message: { body: { canonical123: 'account123' } },
            };
            mockClient.getAccountIds.callsFake((_, __, cb) => cb(null, mockResponse));

            vault.getAccountIds(mockIds, log, (err, data) => {
                assert.strictEqual(err, null);
                assert.deepStrictEqual(data, { canonical123: 'account123' });
                done();
            });
        });

        it('should exclude not found entries', done => {
            const mockIds = ['canonical123'];
            const mockResponse = {
                message: { body: { canonical123: 'NotFound' } },
            };
            mockClient.getAccountIds.callsFake((_, __, cb) => cb(null, mockResponse));

            vault.getAccountIds(mockIds, log, (err, data) => {
                assert.strictEqual(err, null);
                assert.deepStrictEqual(data, {});
                done();
            });
        });
    });

    describe('getCanonicalIdsByAccountIds', () => {
        it('should return canonical IDs for valid account IDs', done => {
            const mockIds = ['account123'];
            const mockResponse = {
                message: { body: [{ account123: 'canonical123' }] },
            };
            mockClient.getCanonicalIdsByAccountIds.callsFake((_, __, cb) => cb(null, mockResponse));

            vault.getCanonicalIdsByAccountIds(mockIds, log, (err, data) => {
                assert.strictEqual(err, null);
                assert.deepStrictEqual(data, [{ account123: 'canonical123' }]);
                done();
            });
        });

        it('should return error when client fails', done => {
            const mockIds = ['account123'];
            const mockError = new Error('Client error');
            mockClient.getCanonicalIdsByAccountIds.callsFake((_, __, cb) => cb(mockError));

            vault.getCanonicalIdsByAccountIds(mockIds, log, (err) => {
                assert.strictEqual(err, mockError);
                done();
            });
        });
    });

    describe('checkPolicies', () => {
        it('should return authorization results', done => {
            const mockParams = [{ test: 'param' }];
            const mockResponse = {
                message: { body: [{ isAllowed: true }] },
            };
            mockClient.checkPolicies.callsFake((_, __, ___, cb) => cb(null, mockResponse));

            vault.checkPolicies(mockParams, 'userArn', log, (err, data) => {
                assert.strictEqual(err, null);
                assert.deepStrictEqual(data, [{ isAllowed: true }]);
                done();
            });
        });

        it('should handle error case', done => {
            const mockError = new Error('Policy check failed');
            mockClient.checkPolicies.callsFake((_, __, ___, cb) => cb(mockError));

            vault.checkPolicies([], 'userArn', log, (err) => {
                assert.strictEqual(err, mockError);
                done();
            });
        });
    });

    describe('checkHealth', () => {
        it('should return default OK when no healthcheck implemented', done => {
            delete mockClient.healthcheck;
            vault.checkHealth(log, (err, data) => {
                assert.strictEqual(err, null);
                assert.deepStrictEqual(data, {
                    mockImpl: { code: 200, message: 'OK' },
                });
                done();
            });
        });

        it('should return health status when implemented', done => {
            mockClient.healthcheck.callsFake((_, cb) => cb(null, { status: 'ok' }));
            vault.checkHealth(log, (err, data) => {
                assert.strictEqual(err, null);
                assert.deepStrictEqual(data, {
                    mockImpl: { code: 200, message: 'OK', body: { status: 'ok' } },
                });
                done();
            });
        });
    });

    describe('report', () => {
        it('should return empty object when no report implemented', done => {
            delete mockClient.report;
            vault.report(log, (err, data) => {
                assert.strictEqual(err, null);
                assert.deepStrictEqual(data, {});
                done();
            });
        });

        it('should return report data when implemented', done => {
            const mockReport = { data: 'report' };
            mockClient.report.callsFake((_, cb) => cb(null, mockReport));
            vault.report(log, (err, data) => {
                assert.strictEqual(err, null);
                assert.deepStrictEqual(data, mockReport);
                done();
            });
        });
    });

    describe('getOrCreateEncryptionKeyId', () => {
        it('should return encryption key info', done => {
            const mockResponse = {
                message: {
                    body: {
                        canonicalId: 'canonical123',
                        encryptionKeyId: 'key123',
                        action: 'created',
                    },
                },
            };
            mockClient.getOrCreateEncryptionKeyId.callsFake((_, __, cb) => cb(null, mockResponse));

            vault.getOrCreateEncryptionKeyId('canonical123', log, (err, data) => {
                assert.strictEqual(err, null);
                assert.deepStrictEqual(data, {
                    canonicalId: 'canonical123',
                    encryptionKeyId: 'key123',
                    action: 'created',
                });
                done();
            });
        });

        it('should handle error case', done => {
            const mockError = new Error('Key operation failed');
            mockClient.getOrCreateEncryptionKeyId.callsFake((_, __, cb) => cb(mockError));

            vault.getOrCreateEncryptionKeyId('canonical123', log, (err) => {
                assert.strictEqual(err, mockError);
                done();
            });
        });
    });
});
