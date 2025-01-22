'use strict'; // eslint-disable-line strict

const assert = require('assert');
const sinon = require('sinon');

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
            checkPolicies: sandbox.stub(),
            getOrCreateEncryptionKeyId: sandbox.stub(),
        };

        vault = new Vault(mockClient, 'mockImpl');
    });

    afterEach(() => {
        sandbox.restore();
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

            vault.authenticateV4Request(mockParams, [], (err, data, results,
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

            vault.authenticateV4Request(mockParams, [], (err, data, results,
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

            vault.authenticateV4Request(mockParams, [], err => {
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

            vault.authenticateV4Request(mockParams, mockRequestContexts,
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

            vault.authenticateV4Request(mockParams, [], (err, _data, _results,
                _params, infos) => {
                assert.strictEqual(err, null);
                assert.strictEqual(infos.accountQuota.quota.toString(),
                    '9007199254740992');
                done();
            });
        });
    });
});
