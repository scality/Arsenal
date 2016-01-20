import errors from '../../index';

import assert from 'assert';
import util from 'util';

describe('errorWithCode with routes s3 error file', () => {
    it ('should respond the right error object', (done) => {
        const errorTest = errors.errorWithCode("AccountProblem");
        const result = new Error("There is a problem with your AWS account " +
                                 "that prevents the operation from completing" +
                                 " successfully. Please use Contact Us.");
        result["AccountProblem"] = true;
        result.code = 403;
        assert.deepStrictEqual(errorTest, result);
        done();
    });

    it('Should grab the error with the index', (done) => {
        const errorTest = errors.errorWithCode("AccountProblem");
        assert.deepStrictEqual(errorTest.AccountProblem, true);
        done();
    })

    it('Should add details', (done) => {
        const errorTest = errors.errorWithCode("AccountProblem","--details--");
        const result = new Error("There is a problem with your AWS account " +
                                 "that prevents the operation from completing" +
                                 " successfully. Please use Contact Us.");
        result["AccountProblem"] = true;
        result.code = 403;
        result.details = "--details--";
        assert.deepStrictEqual(errorTest, result);
        done();
    })    
});
