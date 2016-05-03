const assert = require('assert');

const errorsJSON = require('../../errors/arsenalErrors.json');
const errors = require('../../index').errors;

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

describe('Error translation', () => {
    Object.keys(errors).forEach(index => {
        const err = errors[index].translation ?
                  errors[errors[index].translation.S3].message :
                  errors[index].message;
        it(`should return the S3 translation of ${errors[index]} (${err})`,
           done => {
               if (errors[index].translation) {
                   assert.deepStrictEqual(errors[errors[index].translation.S3],
                                          errors[index].toS3());
               } else {
                   assert.deepStrictEqual(errors[index], errors[index].toS3());
               }
               done();
           });
    });
});
