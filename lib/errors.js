'use strict'; // eslint-disable-line strict

const errors = {};

class ArsenalError extends Error {
    constructor(type, code, desc, translation) {
        super(type);
        this.code = code;
        this.description = desc;
        this[type] = true;
        this.translation = translation;
    }

    /**
     * Translate errors to S3
     * @returns {Object.<ArsenalError>} - the instance of the S3 corresponding
     *                                    error
     */
    toS3() {
        return this.translation ? errors[this.translation.S3] : this;
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
                  errorsObj[index].description, errorsObj[index].translation);
          });
    return errors;
}

module.exports = errorsGen();
