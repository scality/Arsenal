'use strict'; // eslint-disable-line strict

const headerAuthCheck = require('./headerAuthCheck');
const queryAuthCheck = require('./queryAuthCheck');

const authV4 = {
    header: headerAuthCheck,
    query: queryAuthCheck,
};

module.exports = authV4;
