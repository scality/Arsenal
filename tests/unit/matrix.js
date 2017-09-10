'use strict';// eslint-disable-line strict

const assert = require('assert');

const Matrix = require('../../index').testing.matrix.TestMatrix;

describe('Matrix', () => {
    const params = {
        auth: ['v2', 'v4'],
        user: 'nobody',
        password: 'nopassword',
        delimiter: [undefined, '/', '', '|', 'abcd'],
        prefix: [undefined, '/validPrefix/ThatIsNot/InTheSet',
            '/validPrefix/ThatIsPresent/InTheTestSet', 'InvalidPrefix'],
    };

    /**
    * 2 (auth) * 5 (delimiter) * 4 (prefix)
    */
    describe('Should generate 40 matrix', () => {
        let numberOfCall = 0;

        const testMatrix = new Matrix(params);
        testMatrix.generate(['auth'], testMatrix => {
            testMatrix.generate(['delimiter', 'prefix'], (testMatrix, done) => {
                assert.equal(testMatrix.params.auth !== undefined, true);
                ++numberOfCall;
                done();
            }, 'should generate matrix');
        }).execute();

        describe('Check if matrix was well generated', () => {
            it('Has generated 40 matrix', done => {
                const callback = () => {
                    if (numberOfCall === 40) {
                        done();
                    } else {
                        process.nextTick(callback);
                    }
                };
                callback();
            });
        });
    });

    describe('Create an exception for "v4" authentification', () => {
        let numberOfCallV2 = 0;
        let numberOfCallV4 = 0;

        const testMatrix = new Matrix(params);
        const ifParams = {
            auth: ['v4'],
        };

        testMatrix.generate(['auth'], testMatrix => {
            testMatrix.generate(['delimiter', 'prefix'], (testMatrix, done) => {
                assert.equal(testMatrix.params.auth === 'v2', true);
                ++numberOfCallV2;
                done();
            }, 'should use v2 auth').testSpecialCase(ifParams, (testMatrix,
                done) => {
                assert.equal(testMatrix.params.auth === 'v4', true);
                ++numberOfCallV4;
                done();
            }, 'should use v4 auth');
        }).execute();

        describe('Check if matrix was well generated', () => {
            it('Should was call 20 times per auth value', done => {
                const callback = () => {
                    if (numberOfCallV2 === 20 && numberOfCallV4 === 20) {
                        done();
                    } else {
                        process.nextTick(callback);
                    }
                };
                callback();
            });
        });
    });

    describe('Create an exception for multiples values', () => {
        const testMatrix = new Matrix(params);
        const ifParams = {
            delimiter: [undefined, 'abcd'],
        };

        let callUndefined = false;
        let callAbcd = false;
        testMatrix.generate(['auth'], testMatrix => {
            testMatrix.generate(['delimiter', 'prefix'], (testMatrix, done) => {
                assert(testMatrix.params.auth !== undefined, true);
                done();
            }, 'should generate matrix').testSpecialCase(ifParams, (testMatrix,
                done) => {
                const isAbcd = testMatrix.params.delimiter === 'abcd';
                const isUndefined = testMatrix.params.delimiter === undefined;

                assert(isAbcd || isUndefined, true);
                if (testMatrix.params.delimiter === undefined) {
                    callUndefined = true;
                } else if (testMatrix.params.delimiter === 'abcd') {
                    callAbcd = true;
                }
                done();
            }, 'should call specific delimiter');
        }).execute();

        describe('Check if matrix was well generated', () => {
            it('All exception was called', done => {
                const callback = () => {
                    if (callAbcd === true && callUndefined === true) {
                        done();
                    } else {
                        process.nextTick(callback);
                    }
                };
                callback();
            });
        });
    });

    describe('Should create an exception for multiples keys', () => {
        const testMatrix = new Matrix(params);
        const ifParams = {
            auth: ['v4'],
            delimiter: [undefined, 'abcd'],
        };

        let callUndefined = false;
        let callAbcd = false;
        testMatrix.generate(['auth'], testMatrix => {
            testMatrix.generate(['delimiter', 'prefix'], (testMatrix, done) => {
                assert(testMatrix.params.auth !== undefined, true);
                done();
            }, 'should generate matrix').testSpecialCase(ifParams, (testMatrix,
                done) => {
                const isV4 = testMatrix.params.auth === 'v4';
                const isAbcd = testMatrix.params.delimiter === 'abcd';
                const isUndefined = testMatrix.params.delimiter === undefined;
                assert(isV4 && (isAbcd || isUndefined), true);

                if (testMatrix.params.delimiter === undefined) {
                    callUndefined = true;
                } else if (testMatrix.params.delimiter === 'abcd') {
                    callAbcd = true;
                }
                done();
            }, 'should call specific delimiter');
        }).execute();

        describe('Check if matrix was well generated', () => {
            it('All exception was called', done => {
                const callback = () => {
                    if (callAbcd === true && callUndefined === true) {
                        done();
                    } else {
                        process.nextTick(callback);
                    }
                };
                callback();
            });
        });
    });

    describe('Should call without any specialization', () => {
        const params = {
            auth: 'v2',
            user: 'nobody',
            password: 'nopassword',
            delimiter: undefined,
            prefix: undefined,
        };

        const testMatrix = new Matrix(params);
        let hasBeenCalled = false;

        testMatrix.generate([], (testMatrix, done) => {
            assert(testMatrix.params.auth !== undefined, true);
            hasBeenCalled = true;
            done();
        }, 'should generate matrix').execute();

        describe('Check if matrix was well generated', () => {
            it('Has been called', done => {
                const callback = () => {
                    if (hasBeenCalled === true) {
                        done();
                    } else {
                        process.nextTick(callback);
                    }
                };
                callback();
            });
        });
    });

    describe('Should launch an exception during bad specialization', () => {
        const testMatrix = new Matrix(params);
        let anExceptionWasFound = false;
        try {
            testMatrix.generate(['invalid specialization'],
            (testMatrix, done) => {
                assert(testMatrix.params.auth !== undefined, true);
                done();
            }, 'should generate matrix').execute();
        } catch (e) {
            anExceptionWasFound = true;
        }
        it('An exception was launched', done => {
            assert.equal(anExceptionWasFound, true);
            done();
        });
    });

    describe('Should launch an exception if element already specialized',
    () => {
        const testMatrix = new Matrix(params);
        let anExceptionWasFound = false;
        try {
            testMatrix.generate(['auth'], testMatrix => {
                testMatrix.generate(['auth'], testMatrix => {
                    assert(testMatrix.params.auth !== undefined, true);
                }, 'should generate matrix');
            }).execute();
        } catch (e) {
            anExceptionWasFound = true;
        }
        it('An exception was launched', done => {
            assert.equal(anExceptionWasFound, true);
            done();
        });
    });
    describe('Should execute even bad key exception', () => {
        const testMatrix = new Matrix(params);

        const ifParams = {
            'invalid field': null,
        };
        testMatrix.generate(['auth'], testMatrix => {
            testMatrix.generate(['delimiter', 'prefix'], (testMatrix, done) => {
                assert(testMatrix.params.auth !== undefined, true);
                done();
            }, 'should generate matrix').testSpecialCase(ifParams, (testMatrix,
                done) => {
                assert(testMatrix.params.auth !== undefined, true);
                done();
            }, 'should not run');
        }).execute();
    });

    describe('Use array of object', () => {
        const params = {
            auth: [{ auth: 'v2' }, { auth: 'v4' }],
        };
        const testMatrix = new Matrix(params);
        testMatrix.generate(['auth'], (testMatrix, done) => {
            assert(testMatrix.params.auth.auth === 'v2'
            || testMatrix.params.auth.auth === 'v4', true);
            done();
        }, 'should generate matrix').execute();
    });
});
