'use strict';

const TTLVCodec = require('../../../lib/network/kmip/codec/ttlv').default;
const TransportTemplate = require('../../../lib/network/kmip/transport/TransportTemplate').default;
const KMIP = require('../../../lib/network/kmip').default;
const LoopbackServerChannel = require('./LoopbackServerChannel');

/** KMIP transport to a KMIP server running in the test process */
class LoopbackServerTransport extends TransportTemplate {
    constructor(options) {
        super(new LoopbackServerChannel(KMIP, TTLVCodec), options);
    }
}

module.exports = LoopbackServerTransport;
