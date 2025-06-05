'use strict'; // eslint-disable-line strict

const assert = require('assert');
const crypto = require('crypto');
const async = require('async');
const TTLVCodec = require('../../../lib/network/kmip/codec/ttlv').default;
const LoopbackServerChannel =
      require('../../utils/kmip/LoopbackServerChannel');
const TransportTemplate =
      require('../../../lib/network/kmip/transport/TransportTemplate').default;
const TlsTransport =
      require('../../../lib/network/kmip/transport/tls').default;
const KMIP = require('../../../lib/network/kmip').default;
const KMIPClient = require('../../../lib/network/kmip/Client').default;
const {
    logger,
} = require('../../utils/kmip/ersatz');
const util = require('util');
const sinon = require('sinon');

class LoopbackServerTransport extends TransportTemplate {
    constructor(options) {
        super(new LoopbackServerChannel(KMIP, TTLVCodec), options);
    }
}

const defaultOptions = {
    kmip: {
        providerName: 'tests',
        client: {
            bucketNameAttributeName: null,
            compoundCreateActivate: false,
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

describe('KMIP High Level Driver', () => {
    let kmipClient;

    afterEach(async () => {
        sinon.restore();
        await util.promisify(kmipClient.stop.bind(kmipClient))();
    });

    [null, 'dummyAttributeName'].forEach(bucketNameAttributeName => {
        [false, true].forEach(compoundCreateActivate => {
            const options = {
                kmip: {
                    providerName: defaultOptions.kmip.providerName,
                    client: {
                        bucketNameAttributeName,
                        compoundCreateActivate,
                    },
                    codec: defaultOptions.kmip.codec,
                    transport: defaultOptions.kmip.transport,
                },
            };
            it('should work with' +
               ` x-name attribute: ${!!bucketNameAttributeName},` +
               ` compound creation: ${compoundCreateActivate}`,
            done => {
                kmipClient = new KMIPClient(options, TTLVCodec,
                    LoopbackServerTransport);
                const plaintext = Buffer.from(crypto.randomBytes(32));
                async.waterfall([
                    next => kmipClient.createBucketKey('plop', logger, next),
                    (id, arn, next) => {
                        assert.match(arn, /arn:scality:kms:external:kmip:tests:key\//);
                        kmipClient.cipherDataKey(1, id, plaintext,
                            logger, (err, ciphered) => {
                                next(err, id, ciphered);
                            });
                    },
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
    it('should succeed healthcheck with working KMIP client and server', done => {
        kmipClient = new KMIPClient(defaultOptions, TTLVCodec,
            LoopbackServerTransport);
        kmipClient.healthcheck(logger, err => {
            assert.ifError(err);
            done();
        });
    });

    it('should fail healthcheck with KMIP server not running', done => {
        kmipClient = new KMIPClient(defaultOptions, TTLVCodec, TlsTransport);
        kmipClient.healthcheck(logger, err => {
            assert(err);
            assert(err.is.InternalError);
            assert(err.description.includes('ECONNREFUSED'));
            done();
        });
    });

    describe('thales session revoked (mock 24h idle socket)', () => {
        let kmsKey;
        let encrypted;

        const reason = 'General Failure';
        const message = '[NCERRUnauthorizedAccess]: Token has been revoked';
        /** LoopbackServerTransport function that reply */
        let stub;
        let fakeErrorFct;

        let tlsWriteSpy;
        let tlsEndSpy;
        let tlsConnectSpy;

        // Instantiate a KMIPClient, create a master key and data key, prepare stubs and spys
        beforeEach(async () => {
            kmipClient = new KMIPClient(defaultOptions, TTLVCodec, LoopbackServerTransport);
            // healthcheck to start the connection and the kmipHandshake
            void await util.promisify(kmipClient.healthcheck.bind(kmipClient))(logger);

            kmsKey = await util.promisify(kmipClient.createBucketKey.bind(kmipClient))('mybucket', logger);

            encrypted = await util.promisify(kmipClient.cipherDataKey.bind(kmipClient))(
                1, kmsKey, Buffer.from('abc'), logger);

            stub = sinon.stub(kmipClient.kmip.transport.channel, '_transform');
            // function that can replace the stub to generate 1 or more errors
            fakeErrorFct = (_cipherFunc, _request, cb) => {
                kmipClient.kmip.transport.channel.stubbedResult = true;
                cb(null, kmipClient.kmip.transport.channel.errorResponse(reason, message));
                kmipClient.kmip.transport.channel.stubbedResult = false;
            };

            tlsWriteSpy = sinon.spy(kmipClient.kmip.transport.channel, 'write');
            tlsEndSpy = sinon.spy(kmipClient.kmip.transport.channel, 'end');
            tlsConnectSpy = sinon.spy(kmipClient.kmip.transport.channel, 'connect');
        });

        /**
         * Assert the same message was written twice
         * @returns {undefined}
         */
        function assertTlsSpys() {
            assert.strictEqual(tlsEndSpy.callCount, 1,
                `tls connection should have been ended once instead of ${tlsEndSpy.callCount}`);
            assert.strictEqual(tlsConnectSpy.callCount, 1,
                `tls connect should have been called once instead of ${tlsConnectSpy.callCount}`);
            assert.strictEqual(tlsWriteSpy.callCount, 2,
                `tls write should have been called twice because of retry instead of ${tlsWriteSpy.callCount}`);
            assert.ok(tlsWriteSpy.getCall(0).args[0].equals(tlsWriteSpy.getCall(1).args[0]),
                'tls write should have twice the same argument (same bytes)');
            // ensure the same buffer reference is reused during retry as there is no reason
            // to use more memory for the exact same message
            assert.strictEqual(tlsWriteSpy.getCall(0).args[0], tlsWriteSpy.getCall(1).args[0],
                'tls write should have twice the same argument (same buffer reference)');
            assert.strictEqual(stub.callCount, 2,
                `stub for encrypt should have been called twice instead of ${stub.callCount}`);
        }

        it('should retry without kmipHandshake on thales session revoked', async () => {
            // the next call should return a thales session revoked error only once
            stub
                .onFirstCall()
                .callsFake(fakeErrorFct)
                .callThrough();

            const retriedEncryption = await util.promisify(kmipClient.cipherDataKey.bind(kmipClient))(
                1, kmsKey, Buffer.from('abc'), logger);

            assert.ok(encrypted.equals(retriedEncryption),
                'second call to cipherDataKey with a retry should match 1st call');
            assertTlsSpys();
        });

        it('should retry and fail the second time on thales session revoked', async () => {
            // continuously return a thales session revoked error
            stub.callsFake(fakeErrorFct);

            await assert.rejects(util.promisify(kmipClient.cipherDataKey.bind(kmipClient))(
                1, kmsKey, Buffer.from('abc'), logger), (err) => {
                assert.strictEqual(err.AccessDenied, true);
                assert.strictEqual(err.description,
                    `KMS (KMIP) error for Encrypt on ${kmsKey}. ${reason}: ${message}`);
                return true;
            });
            assertTlsSpys();
        });
    });
});
