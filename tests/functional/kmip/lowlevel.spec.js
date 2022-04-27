'use strict'; // eslint-disable-line strict

const assert = require('assert');
const TTLVCodec = require('../../../lib/network/kmip/codec/ttlv').default;
const TransportTemplate =
      require('../../../lib/network/kmip/transport/TransportTemplate').default;
const KMIP = require('../../../lib/network/kmip').default;
const {
    logger,
    MirrorChannel,
} = require('../../utils/kmip/ersatz');
const lowlevelFixtures = require('../../utils/kmip/lowlevelFixtures');


class MirrorTransport extends TransportTemplate {
    constructor(options) {
        super(new MirrorChannel(KMIP, TTLVCodec), options);
    }
}

const options = {
    kmip: {
        codec: {},
        transport: {
            pipelineDepth: 8,
            tls: {
                port: 5696,
            },
        },
    },
};

describe('KMIP Low Level Driver', () => {
    lowlevelFixtures.forEach((fixture, n) => {
        it(`should work with fixture #${n}`, done => {
            const kmip = new KMIP(TTLVCodec, MirrorTransport, options);
            const requestPayload = fixture.payload(kmip);
            kmip.request(logger, fixture.operation,
                requestPayload, (err, response) => {
                    if (err) {
                        return done(err);
                    }
                    const responsePayload = response.lookup(
                        'Response Message/Batch Item/Response Payload',
                    )[0];
                    assert.deepStrictEqual(responsePayload,
                        requestPayload);
                    return done();
                });
        });
    });
});
