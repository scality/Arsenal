const assert = require('assert');

const errorsJSON = require('../../errors/arsenalErrors.json');
const errors = require('../../index').errors;

const map = {
    NoSuchBucket: 'NoSuchBucket',
    BucketAlreadyExists: 'BucketAlreadyExists',
    NoSuchKey: 'NoSuchKey',
    DBNotFound: 'NoSuchBucket',
    DBAlreadyExists: 'BucketAlreadyExists',
    ObjNotFound: 'NoSuchKey',
    NotImplemented: 'NotImplemented',
};


describe('Runtime errors instance generation', () => {
    Object.keys(errors).forEach(index => {
        it(`should return and instance of ${index} Error`, done => {
            assert.deepStrictEqual(errors[index] instanceof Error, true,
                                   'should be an instance of Error');
            assert.deepStrictEqual(errors[index].code, errorsJSON[index].code,
                                   'Wrong Code');
            assert.deepStrictEqual(errors[index].description,
                                   errorsJSON[index].description,
                                   'Incorrect description');
            assert.deepStrictEqual(errors[index][index], true,
                                   `${index} key must be true`);
            done();
        });
    });
});

describe('Error map(wrapper) MD -> S3', () => {
    Object.keys(map).forEach(index => {
        it(`should return an instance of ${map[index]} Error`, done => {
            assert.deepStrictEqual(errors[index].errorsMap(),
                                   errors[map[index]]);
            done();
        });
    });
});
