'use strict';// eslint-disable-line strict

const assert = require('assert');

const Matrix = require('../../index').Testing.Matrix.TestMatrix;

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
    * 2 (auth) * 5 (delimiter) * 5 (prefix)
    */
    describe('Should generate 40 matrix', () => {
        let numberOfCall = 0;

        const testMatrix = new Matrix(params);
        testMatrix.generate(['auth'], testMatrix => {
            testMatrix.generate(['delimiter', 'prefix'], testMatrix => {
                assert.equal(testMatrix.params.auth !== undefined, true);
                ++numberOfCall;
            });
        }).execute();

        it('Has generated 40 matrix', done => {
            assert.equal(numberOfCall === 40, true);
            done();
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
            testMatrix.generate(['delimiter', 'prefix'], testMatrix => {
                assert.equal(testMatrix.params.auth === 'v2', true);
                ++numberOfCallV2;
            }).if(ifParams, testMatrix => {
                assert.equal(testMatrix.params.auth === 'v4', true);
                ++numberOfCallV4;
            });
        }).execute();

        it('Should was call 20 times per auth value', done => {
            assert.equal(numberOfCallV2 === 20, true);
            assert.equal(numberOfCallV4 === 20, true);
            done();
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
            testMatrix.generate(['delimiter', 'prefix'], testMatrix => {
                assert(testMatrix.params.auth !== undefined, true);
            }).if(ifParams, testMatrix => {
                const isAbcd = testMatrix.params.delimiter === 'abcd';
                const isUndefined = testMatrix.params.delimiter === undefined;

                assert(isAbcd || isUndefined, true);
                if (testMatrix.params.delimiter === undefined) {
                    callUndefined = true;
                } else if (testMatrix.params.delimiter === 'abcd') {
                    callAbcd = true;
                }
            });
        }).execute();

        it('All exception was called', done => {
            assert(callAbcd === true && callUndefined === true, true);
            done();
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
            testMatrix.generate(['delimiter', 'prefix'], testMatrix => {
                assert(testMatrix.params.auth !== undefined, true);
            }).if(ifParams, testMatrix => {
                const isV4 = testMatrix.params.auth === 'v4';
                const isAbcd = testMatrix.params.delimiter === 'abcd';
                const isUndefined = testMatrix.params.delimiter === undefined;
                assert(isV4 && (isAbcd || isUndefined), true);
                if (testMatrix.params.delimiter === undefined) {
                    callUndefined = true;
                } else if (testMatrix.params.delimiter === 'abcd') {
                    callAbcd = true;
                }
            });
        }).execute();

        it('All exception was called', done => {
            assert(callAbcd === true && callUndefined === true, true);
            done();
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

        testMatrix.generate([], testMatrix => {
            assert(testMatrix.params.auth !== undefined, true);
            hasBeenCalled = true;
        }).execute();
        it('Has been called', done => {
            assert.equal(hasBeenCalled, true);
            done();
        });
    });

    describe('Should launch an exception during bad specialization', () => {
        const testMatrix = new Matrix(params);
        let anExceptionWasFound = false;
        try {
            testMatrix.generate(['invalid specialization'], testMatrix => {
                assert(testMatrix.params.auth !== undefined, true);
            }).execute();
        } catch (e) {
            anExceptionWasFound = true;
        }
        it('An exception was launched', (done) => {
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
            testMatrix.generate(['delimiter', 'prefix'], testMatrix => {
                assert(testMatrix.params.auth !== undefined, true);
            }).if(ifParams, testMatrix => {
                assert(testMatrix.params.auth !== undefined, true);
            });
        }).execute();
    });
});
