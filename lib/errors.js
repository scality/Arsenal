'use strict' // eslint-disable-line

const ERRORS = require('../errors/arsenalErrors.json');

module.exports = class Errors extends Error {
    constructor(type) {
        super(type);
        this.code = ERRORS[type].httpCode;
        this.description = ERRORS[type].description;
        this[type] = true;
    }
};
