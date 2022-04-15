const assert = require('assert');

const ChainBackend = require('../../../lib/auth/auth').backends.chainBackend;
const BaseBackend = require('../../../lib/auth/auth').backends.baseBackend;


const testError = new Error('backend error');

const backendWithAllMethods = {
    verifySignatureV2: () => {},
    verifySignatureV4: () => {},
    getCanonicalIds: () => {},
    getEmailAddresses: () => {},
    checkPolicies: () => {},
    healthcheck: () => {},
};

function getBackendWithMissingMethod(methodName) {
    const backend = Object.assign({}, backendWithAllMethods);
    delete backend[methodName];
    return backend;
}

class TestBackend extends BaseBackend {
    constructor(service, error, result) {
        super(service);
        this._error = error;
        this._result = result;
    }

    verifySignatureV2(stringToSign, signatureFromRequest, accessKey, options, callback) {
        return callback(this._error, this._result);
    }

    verifySignatureV4(stringToSign, signatureFromRequest, accessKey, region, scopeDate, options, callback) {
        return callback(this._error, this._result);
    }

    getCanonicalIds(emailAddresses, options, callback) {
        return callback(this._error, this._result);
    }

    getEmailAddresses(canonicalIDs, options, callback) {
        return callback(this._error, this._result);
    }

    checkPolicies(requestContextParams, userArn, options, callback) {
        return callback(this._error, this._result);
    }

    healthcheck(reqUid, callback) {
        return callback(this._error, this._result);
    }
}

describe('Auth Backend: Chain Backend', () => {
    [
        ['should throw an error if client list is not an array', null],
        ['should throw an error if client list empty', []],
        ['should throw an error if a client is missing the verifySignatureV2 method', [
            new TestBackend(),
            getBackendWithMissingMethod('verifySignatureV2'),
        ]],
        ['should throw an error if a client is missing the verifySignatureV4 auth method', [
            new TestBackend(),
            getBackendWithMissingMethod('verifySignatureV4'),
        ]],
        ['should throw an error if a client is missing the getCanonicalId method', [
            new TestBackend(),
            getBackendWithMissingMethod('getCanonicalIds'),
        ]],
        ['should throw an error if a client is missing the getEmailAddresses method', [
            new TestBackend(),
            getBackendWithMissingMethod('getEmailAddresses'),
        ]],
        ['should throw an error if a client is missing the checkPolicies method', [
            new TestBackend(),
            getBackendWithMissingMethod('checkPolicies'),
        ]],
        ['should throw an error if a client is missing the healthcheck method', [
            new TestBackend(),
            getBackendWithMissingMethod('healthcheck'),
        ]],
    ].forEach(([msg, input]) => it(msg, () => {
        assert.throws(() => {
            new ChainBackend('chain', input); // eslint-disable-line no-new
        });
    }));

    [
        // function name, function args
        ['verifySignatureV2', [null, null, null, null]],
        ['verifySignatureV4', [null, null, null, null, null, null]],
    ].forEach(([fn, fnArgs]) =>
        describe(`::${fn}`, () => {
            it('should return an error if none of the clients returns a result', done => {
                const backend = new ChainBackend('chain', [
                    new TestBackend('test1', testError, null),
                    new TestBackend('test2', testError, null),
                    new TestBackend('test3', testError, null),
                ]);

                backend[fn](...fnArgs, err => {
                    assert.deepStrictEqual(err, testError);
                    done();
                });
            });

            [
                [
                    'should return result of the first successful client (multiple successful client)',
                    'expectedResult',
                    // backend constructor args
                    [
                        ['test1', null, 'expectedResult'],
                        ['test2', null, 'test2'],
                        ['test3', testError, null],
                    ],
                ],
                [
                    'should return result of successful client',
                    'expectedResult',
                    // backend constructor args
                    [
                        ['test1', testError, null],
                        ['test2', null, 'expectedResult'],
                        ['test3', testError, null],
                    ],
                ],
                [
                    'should return result of successful client',
                    'expectedResult',
                    // backend constructor args
                    [
                        ['test1', testError, null],
                        ['test1', testError, null],
                        ['test3', null, 'expectedResult'],
                    ],
                ],
            ].forEach(([msg, expected, backendArgs]) => {
                it(msg, done => {
                    const backend = new ChainBackend('chain',
                        backendArgs.map((args) => new TestBackend(...args)));
                    backend[fn](...fnArgs, (err, res) => {
                        assert.ifError(err);
                        assert.strictEqual(res, expected);
                        done();
                    });
                });
            });
        }));

    [
        // function name, function args
        ['getCanonicalIds', [null, null]],
        ['getEmailAddresses', [null, null]],
    ].forEach(([fn, fnArgs]) =>
        describe(`::${fn}`, () => {
            it('should return an error if any of the clients fails', done => {
                const backend = new ChainBackend('chain', [
                    new TestBackend('test1', null, { message: { body: { test1: 'aaa' } } }),
                    new TestBackend('test2', testError, null),
                    new TestBackend('test3', null, { message: { body: { test2: 'bbb' } } }),
                ]);

                backend[fn](...fnArgs, err => {
                    assert.deepStrictEqual(err, testError);
                    done();
                });
            });

            it('should merge results from clients into a single response object', done => {
                const backend = new ChainBackend('chain', [
                    new TestBackend('test1', null, { message: { body: { test1: 'aaa' } } }),
                    new TestBackend('test2', null, { message: { body: { test2: 'bbb' } } }),
                ]);

                backend[fn](...fnArgs, (err, res) => {
                    assert.ifError(err);
                    assert.deepStrictEqual(res, {
                        message: { body: {
                            test1: 'aaa',
                            test2: 'bbb',
                        } },
                    });
                    done();
                });
            });
        }));

    describe('::checkPolicies', () => {
        it('should return an error if any of the clients fails', done => {
            const backend = new ChainBackend('chain', [
                new TestBackend('test1', null, {
                    message: { body: [{ isAllowed: false, arn: 'arn:aws:s3:::policybucket/obj1' }] },
                }),
                new TestBackend('test2', testError, null),
                new TestBackend('test3', null, {
                    message: { body: [{ isAllowed: true, arn: 'arn:aws:s3:::policybucket/obj1' }] },
                }),
            ]);

            backend.checkPolicies(null, null, null, err => {
                assert.deepStrictEqual(err, testError);
                done();
            });
        });

        it('should merge results from clients into a single response object', done => {
            const backend = new ChainBackend('chain', [
                new TestBackend('test1', null, {
                    message: { body: [{ isAllowed: false, arn: 'arn:aws:s3:::policybucket/obj1' }] },
                }),
                new TestBackend('test2', null, {
                    message: { body: [{ isAllowed: true, arn: 'arn:aws:s3:::policybucket/obj2' }] },
                }),
                new TestBackend('test3', null, {
                    message: { body: [{ isAllowed: true, arn: 'arn:aws:s3:::policybucket/obj1' }] },
                }),
            ]);

            backend.checkPolicies(null, null, null, (err, res) => {
                assert.ifError(err);
                assert.deepStrictEqual(res, {
                    message: { body: [
                        { isAllowed: true, arn: 'arn:aws:s3:::policybucket/obj1' },
                        { isAllowed: true, arn: 'arn:aws:s3:::policybucket/obj2' },
                    ] },
                });
                done();
            });
        });
    });


    describe('::_mergeObject', () => {
        it('should correctly merge reponses', () => {
            const objectResps = [
                { message: { body: {
                    id1: 'email1@test.com',
                    wrongformatcanid: 'WrongFormat',
                    id4: 'email4@test.com',
                } } },
                { message: { body: {
                    id2: 'NotFound',
                    id3: 'email3@test.com',
                    id4: 'email5@test.com',
                } } },
            ];
            assert.deepStrictEqual(
                ChainBackend._mergeObjects(objectResps),
                {
                    id1: 'email1@test.com',
                    wrongformatcanid: 'WrongFormat',
                    id2: 'NotFound',
                    id3: 'email3@test.com',
                    // id4 should be overwritten
                    id4: 'email5@test.com',
                },
            );
        });
    });

    describe('::_mergePolicies', () => {
        it('should correctly merge policies', () => {
            const policyResps = [
                { message: { body: [
                    { isAllowed: false, arn: 'arn:aws:s3:::policybucket/true1' },
                    { isAllowed: true, arn: 'arn:aws:s3:::policybucket/true2' },
                    { isAllowed: false, arn: 'arn:aws:s3:::policybucket/false1' },
                ] } },
                { message: { body: [
                    { isAllowed: true, arn: 'arn:aws:s3:::policybucket/true1' },
                    { isAllowed: false, arn: 'arn:aws:s3:::policybucket/true2' },
                    { isAllowed: false, arn: 'arn:aws:s3:::policybucket/false2' },
                ] } },
            ];
            assert.deepStrictEqual(
                ChainBackend._mergePolicies(policyResps),
                [
                    { isAllowed: true, arn: 'arn:aws:s3:::policybucket/true1' },
                    { isAllowed: true, arn: 'arn:aws:s3:::policybucket/true2' },
                    { isAllowed: false, arn: 'arn:aws:s3:::policybucket/false1' },
                    { isAllowed: false, arn: 'arn:aws:s3:::policybucket/false2' },
                ],
            );
        });
    });

    describe('::checkhealth', () => {
        it('should return error if a single client is unhealthy', done => {
            const backend = new ChainBackend('chain', [
                new TestBackend('test1', null, { code: 200 }),
                new TestBackend('test2', testError, { code: 503 }),
                new TestBackend('test3', null, { code: 200 }),
            ]);
            backend.healthcheck(null, (err, res) => {
                expect(err.is.InternalError).toBeTruthy();
                assert.deepStrictEqual(res, [
                    { error: null, status: { code: 200 } },
                    { error: testError, status: { code: 503 } },
                    { error: null, status: { code: 200 } },
                ]);
                done();
            });
        });

        it('should return result if all clients are healthy', done => {
            const backend = new ChainBackend('chain', [
                new TestBackend('test1', null, { msg: 'test1', code: 200 }),
                new TestBackend('test2', null, { msg: 'test2', code: 200 }),
                new TestBackend('test3', null, { msg: 'test3', code: 200 }),
            ]);
            backend.healthcheck(null, (err, res) => {
                assert.ifError(err);
                assert.deepStrictEqual(res, [
                    { error: null, status: { msg: 'test1', code: 200 } },
                    { error: null, status: { msg: 'test2', code: 200 } },
                    { error: null, status: { msg: 'test3', code: 200 } },
                ]);
                done();
            });
        });
    });
});
