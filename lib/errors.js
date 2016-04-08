'use strict'; // eslint-disable-line strict

const errors = {};

class ArsenalError extends Error {
    constructor(type, code, desc) {
        super(type);
        this.code = code;
        this.description = desc;
        this[type] = true;
    }

    /**
     * Map errors from MD to S3
     * @returns {Object.<ArsenalError>} - the instance of the S3 corresponding
     *                                    error
     */
    errorsMap() {
        const map = {
            NoSuchBucket: 'NoSuchBucket',
            BucketAlreadyExists: 'BucketAlreadyExists',
            NoSuchKey: 'NoSuchKey',
            DBNotFound: 'NoSuchBucket',
            DBAlreadyExists: 'BucketAlreadyExists',
            ObjNotFound: 'NoSuchKey',
            NotImplemented: 'NotImplemented',
        };
        return errors[map[this.message]] ? errors[map[this.message]] :
            errors.InternalError;
    }
}

/**
 * Generate an Errors instances object.
 *
 * @returns {Object.<string, ArsenalError>} - object field by arsenalError
 *                                            instances
 */
function errorsGen() {
    const errorsObj = require('../errors/arsenalErrors.json');

    Object.keys(errorsObj)
          .filter(index => index !== '_comment')
          .forEach(index => {
              errors[index] = new ArsenalError(index, errorsObj[index].code,
                                               errorsObj[index].description);
          });
    return errors;
}

module.exports = errorsGen();
