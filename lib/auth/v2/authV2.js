'use strict'; // eslint-disable-line strict

const queryAuthCheck = require('./queryAuthCheck');
const headerAuthCheck = require('./headerAuthCheck');

const authV2 = {
    headerAuthCheck,
    queryAuthCheck,
};

module.exports = authV2;
