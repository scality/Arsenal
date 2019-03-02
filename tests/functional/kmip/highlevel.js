'use strict'; // eslint-disable-line strict

const assert = require('assert');
const crypto = require('crypto');
const async = require('async');
const TTLVCodec = require('../../../lib/network/kmip/codec/ttlv.js');
const LoopbackServerChannel =
      require('../../utils/kmip/LoopbackServerChannel.js');
const TransportTemplate =
      require('../../../lib/network/kmip/transport/TransportTemplate.js');
const KMIP = require('../../../lib/network/kmip');
const KMIPClient = require('../../../lib/network/kmip/Client.js');
const {
    logger,
} = require('../../utils/kmip/ersatz.js');

class LoopbackServerTransport extends TransportTemplate {
    constructor(options) {
        super(new LoopbackServerChannel(KMIP, TTLVCodec), options);
    }
}

describe('KMIP High Level Driver', () => {
    [null, 'dummyAttributeName'].forEach(bucketNameAttributeName => {
        [false, true].forEach(compoundCreateActivate => {
            const options = {
                kmip: {
                    client: {
                        bucketNameAttributeName,
                        compoundCreateActivate,
                    },
                    codec: {},
                    transport: {
                        pipelineDepth: 8,
                        tls: {
                            port: 5696,
                        },
                    },
                },
            };
            it('should work with' +
               ` x-name attribute: ${!!bucketNameAttributeName},` +
               ` compound creation: ${compoundCreateActivate}`,
               done => {
                   const kmipClient = new KMIPClient(options, TTLVCodec,
                                                     LoopbackServerTransport);
                   const plaintext = Buffer.from(crypto.randomBytes(32));
                   async.waterfall([
                       next => kmipClient.createBucketKey('plop', logger, next),
                       (id, next) =>
                           kmipClient.cipherDataKey(1, id, plaintext,
                                                    logger, (err, ciphered) => {
                                                        next(err, id, ciphered);
                                                    }),
                       (id, ciphered, next) =>
                           kmipClient.decipherDataKey(
                               1, id, ciphered, logger, (err, deciphered) => {
                                   assert(plaintext
                                          .compare(deciphered) === 0);
                                   next(err, id);
                               }),
                       (id, next) =>
                           kmipClient.destroyBucketKey(id, logger, next),
                   ], done);
               });
        });
    });
});
