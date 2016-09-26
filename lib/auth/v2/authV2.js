'use strict'; // eslint-disable-line strict

const headerAuthCheck = require('./headerAuthCheck');
const queryAuthCheck = require('./queryAuthCheck');

const authV2 = {
    header: headerAuthCheck,
    query: queryAuthCheck,
};

module.exports = authV2;
