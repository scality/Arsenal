const assert = require('assert');

const errorsJSON = require('../../errors/arsenalErrors.json');
const errors = require('../../index').errors;

describe('Errors: ', () => {
    Object.keys(errors).forEach(index => {
        it(`should return and instance of ${index} Error`, done => {
            assert.strictEqual(errors[index] instanceof Error, true,
                'should be an instance of Error');
            assert.strictEqual(errors[index].code, errorsJSON[index].code,
                'Wrong Code');
            assert.strictEqual(errors[index].description,
                errorsJSON[index].description, 'Incorrect description');
            assert.strictEqual(errors[index][index], true,
                `${index} key must be true`);
            done();
        });
    });

    it('should allow custom error descriptions', () => {
        const originDescription = errors.NoSuchEntity.description;
        const error =
            errors.NoSuchEntity.customizeDescription('custom-description');
        assert.strictEqual(errors.NoSuchEntity.description, originDescription);
        assert.strictEqual(error.description, 'custom-description');
        assert.strictEqual(error.NoSuchEntity, true);
    });

    it('can be turned into strings', () => {
        assert.strictEqual(
            errors.NoSuchEntity.toString(),
            '{"errorType":"NoSuchEntity","errorMessage":"The request was rejected because it referenced an entity that does not exist. The error message describes the entity."}',
        )
    })

    it('can be used as an http response', () => {
        const fakeRes = {
            writeHead: code => assert.strictEqual(code, 404),
            end: msg => {
                assert.strictEqual(
                    msg,
                    '{"errorType":"NoSuchEntity","errorMessage":"The request was rejected because it referenced an entity that does not exist. The error message describes the entity."}',
                )
            },
        }
        errors.NoSuchEntity.writeResponse(fakeRes);
    })
});
