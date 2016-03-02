'use strict'; // eslint-disable-line strict

class ArsenalError extends Error {
    constructor(type, code, desc) {
        super(type);
        this.code = code;
        this.description = desc;
        this[type] = true;
    }
}

function errorsGen() {
    const errors = {};
    const errorsObj = require('../errors/arsenalErrors.json');

    Object.keys(errorsObj)
          .filter(index => index !== '_comment')
          .forEach((index) => {
              errors[index] = new ArsenalError(index, errorsObj[index].code,
                                               errorsObj[index].description);
          });
    return errors;
}

module.exports = errorsGen();
