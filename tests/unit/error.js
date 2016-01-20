const assert = require('assert');

const Errors = require('../../index').Errors;

describe('class errors extended from Error', () => {
    it('should be equal to the created error', (done) => {
        const errorTest = new Errors("AccountProblem");
        const result = new Error("AccountProblem");
        result.code = 403;
        result.description = 'There is a problem with your AWS account th' +
            'at prevents the operation from completing successfully. Plea' +
            'se use Contact Us.';
        assert.deepEqual(errorTest, result, errorTest.description);
        done();
    });
    it('should return AccountProblem Error (S3)',
       (done) => {
           const errorTest = new Errors("AccountProblem");
           assert.deepStrictEqual(errorTest instanceof Error, true);
           assert.deepStrictEqual(errorTest.code, 403);
           assert.deepStrictEqual(errorTest.description, 'There is a proble' +
                                  'm with your AWS account that prevents the' +
                                  ' operation from completing successfully. ' +
                                  'Please use Contact Us.');
           done();
       });
    it('should return noSuchEntity Error (Vault)',
       (done) => {
           const errorTest = new Errors("NoSuchEntity");
           assert.deepStrictEqual(errorTest instanceof Error, true);
           assert.deepStrictEqual(errorTest.code, 404);
           assert.deepStrictEqual(errorTest.description, 'The request was rej' +
                                  'ected because it referenced an entity that' +
                                  ' does not exist. The error message describ' +
                                  'es the entity.');
           done();
       });
});
