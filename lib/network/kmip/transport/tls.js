'use strict'; // eslint-disable-line

const tls = require('tls');
const TransportTemplate = require('./TransportTemplate.js');

class TlsTransport extends TransportTemplate {
    constructor(options) {
        super(tls, options);
    }
}

module.exports = TlsTransport;
