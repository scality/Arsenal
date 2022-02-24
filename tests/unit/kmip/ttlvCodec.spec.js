'use strict'; // eslint-disable-line strict
/* eslint new-cap: "off" */

const assert = require('assert');

const TTLVCodec = require('../../../lib/network/kmip/codec/ttlv').default;
const KMIP = require('../../../lib/network/kmip').default;
const ttlvFixtures = require('../../utils/kmip/ttlvFixtures');
const badTtlvFixtures = require('../../utils/kmip/badTtlvFixtures');
const messageFixtures = require('../../utils/kmip/messageFixtures');
const { logger } = require('../../utils/kmip/ersatz');

function newKMIP() {
    return new KMIP(TTLVCodec,
        class DummyTransport {},
        { kmip: {} }, () => {});
}

describe('KMIP TTLV Codec', () => {
    it('should map, encode and decode an extension', done => {
        const kmip = newKMIP();
        kmip.mapExtension('Dummy Extension', 0x54a000);
        const msg = KMIP.Message([
            KMIP.TextString('Dummy Extension', 'beautiful'),
        ]);
        const encodedMsg = kmip._encodeMessage(msg);
        const decodedMsg = kmip._decodeMessage(logger, encodedMsg);
        assert.deepStrictEqual(msg, decodedMsg);
        done();
    });

    ttlvFixtures.forEach((item, idx) => {
        ['request', 'response'].forEach(fixture => {
            it(`should decode the TTLV ${fixture} fixture[${idx}]`, done => {
                const kmip = newKMIP();
                const msg = kmip._decodeMessage(logger, item[fixture]);
                if (!item.degenerated) {
                    const encodedMsg = kmip._encodeMessage(msg);
                    assert(encodedMsg.compare(item[fixture]) === 0);
                }
                done();
            });
        });
    });

    it('should validate supported operations', done => {
        const kmip = newKMIP();
        const msg = kmip._decodeMessage(logger, ttlvFixtures[1].response);

        const supportedOperations =
              msg.lookup('Response Message/Batch Item/' +
                         'Response Payload/Operation');
        const supportedObjectTypes =
              msg.lookup('Response Message/Batch Item/' +
                         'Response Payload/Object Type');
        const protocolVersionMajor =
              msg.lookup('Response Message/Response Header/' +
                         'Protocol Version/Protocol Version Major');
        const protocolVersionMinor =
              msg.lookup('Response Message/Response Header/' +
                         'Protocol Version/Protocol Version Minor');

        assert(supportedOperations.includes('Encrypt'));
        assert(supportedOperations.includes('Decrypt'));
        assert(supportedOperations.includes('Create'));
        assert(supportedOperations.includes('Destroy'));
        assert(supportedOperations.includes('Query'));
        assert(supportedObjectTypes.includes('Symmetric Key'));
        assert(protocolVersionMajor[0] >= 2 ||
               (protocolVersionMajor[0] === 1 &&
                protocolVersionMinor[0] >= 2));
        done();
    });

    it('should detect unsupported operations', done => {
        const kmip = newKMIP();
        const msg = kmip._decodeMessage(logger, ttlvFixtures[2].response);

        const supportedOperations =
              msg.lookup('Response Message/Batch Item/' +
                         'Response Payload/Operation');

        assert(!supportedOperations.includes('Encrypt'));
        assert(!supportedOperations.includes('Decrypt'));
        done();
    });

    it('should support non canonical search path', done => {
        const kmip = newKMIP();
        const msg = kmip._decodeMessage(logger, ttlvFixtures[1].response);

        const supportedOperations =
              msg.lookup('/Response Message/Batch Item/' +
                         'Response Payload/Operation');
        const supportedObjectTypes =
              msg.lookup('Response Message/Batch Item/' +
                         'Response Payload/Object Type/');
        const protocolVersionMajor =
              msg.lookup('Response Message//Response Header///' +
                         'Protocol Version////Protocol Version Major');
        const protocolVersionMinor =
              msg.lookup('/Response Message////Response Header///' +
                         'Protocol Version//Protocol Version Minor/');

        assert(supportedOperations.includes('Encrypt'));
        assert(supportedOperations.includes('Decrypt'));
        assert(supportedOperations.includes('Create'));
        assert(supportedOperations.includes('Destroy'));
        assert(supportedOperations.includes('Query'));
        assert(supportedObjectTypes.includes('Symmetric Key'));
        assert(protocolVersionMajor[0] >= 2 ||
               (protocolVersionMajor[0] === 1 &&
                protocolVersionMinor[0] >= 2));
        done();
    });

    it('should return nothing with an empty search path', done => {
        const kmip = newKMIP();
        const msg = kmip._decodeMessage(logger, ttlvFixtures[2].response);

        const empty1 = msg.lookup('');
        const empty2 = msg.lookup('////');
        assert(empty1.length === 0);
        assert(empty2.length === 0);
        done();
    });

    it('should encode/decode a bit mask', done => {
        const kmip = newKMIP();
        const usageMask = ['Encrypt', 'Decrypt', 'Export'];
        const decodedMask =
              kmip.decodeMask('Cryptographic Usage Mask',
                  kmip.encodeMask('Cryptographic Usage Mask',
                      usageMask));
        assert.deepStrictEqual(usageMask.sort(), decodedMask.sort());
        done();
    });

    it('should detect invalid bit name', done => {
        const kmip = newKMIP();
        const usageMask = ['Encrypt', 'Decrypt', 'Exprot'];
        try {
            kmip.encodeMask('Cryptographic Usage Mask', usageMask);
            done(Error('Must not succeed'));
        } catch (e) {
            done();
        }
    });

    messageFixtures.forEach((item, idx) => {
        it(`should encode the KMIP message fixture[${idx}]`, done => {
            const kmip = newKMIP();
            const encodedMessage = kmip._encodeMessage(item);
            const decodedMessage = kmip._decodeMessage(logger, encodedMessage);
            assert.deepStrictEqual(item.content, decodedMessage.content);
            done();
        });
    });

    badTtlvFixtures.forEach((rawMessage, idx) => {
        it(`should fail to parse invalid TTLV message fixture[${idx}]`,
            done => {
                const kmip = newKMIP();
                try {
                    kmip._decodeMessage(logger, rawMessage);
                    done(Error('Must not succeed'));
                } catch (e) {
                    done();
                }
            });
    });
});
