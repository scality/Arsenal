'use strict'; // eslint-disable-line strict

class ArsenalError extends Error {
    constructor(type, code, desc) {
        super(type);
        this.code = code;
        this.description = desc;
        this[type] = true;
    }

    customizeDescription(description) {
        return new ArsenalError(this.message, this.code, description);
    }
}

/**
 * Generate an Errors instances object.
 *
 * @returns {Object.<string, ArsenalError>} - object field by arsenalError
 *                                            instances
 */
function errorsGen() {
    const errors = {};
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
