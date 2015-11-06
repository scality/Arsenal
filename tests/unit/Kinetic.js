import assert from 'assert';
import stream from 'stream';
import util from 'util';

import winston from 'winston';

import { Kinetic } from '../../index';

const logger = new (winston.Logger)({
    transports: [new (winston.transports.Console)({ level: 'error' })]
});

describe('Kinetic.PDU constructor()', () => {
    it('should parse valid NOOP', (done) => {
        /*
         * Note: expected buffers formatted using:
         *   hexdump -C FILE | cut -b10-33,35-58 | sed 's/\s\+$//g;s/ /\\x/g'
         */
        const rawData = new Buffer(
            "\x46\x00\x00\x00\x32\x00\x00\x00\x00\x20\x01\x2a\x18\x08\x01\x12" +
            "\x14\x70\x14\x62\x07\x0b\x41\xf4\xb0\x21\xd1\x93\xfa\x53\xb4\x15" +
            "\xf0\x4b\xb6\xba\xa2\x3a\x14\x0a\x10\x08\xbe\xea\xda\x04\x18\xcd" +
            "\xa0\x85\xc4\x8c\x2a\x20\x7b\x38\x1e\x12\x00", "ascii");

        try {
            const pdu = new Kinetic.PDU(rawData);

            assert.equal(pdu.getProtobufSize(), 20);
            assert.equal(pdu.getChunkSize(), 0);
            assert.equal(pdu.getMessageType(), Kinetic.ops.NOOP);
            assert.equal(pdu.getClusterVersion(), 9876798);

            done();
        } catch (e) {
            done(e);
        }
    });

    it('should parse Version failure NOOP', (done) => {
        const rawData = new Buffer(
            "\x47\x00\x00\x00\x32\x00\x00\x00\x00\x20\x01\x2a\x18\x08\x01\x12" +
            "\x14\x70\x14\x62\x07\x0b\x41\xf4\xb0\x21\xd1\x93\xfa\x53\xb4\x15" +
            "\xf0\x4b\xb6\xba\xa2\x3a\x14\x0a\x10\x08\xbe\xea\xda\x04\x18\xcd" +
            "\xa0\x85\xc4\x8c\x2a\x20\x7b\x38\x1e\x12\x00", "ascii");

        try {
            const pdu = new Kinetic.PDU(rawData);
            logger.info(util.inspect(pdu.getProtobuf(),
                {showHidden: false, depth: null}));

            done(new Error('Bad error throwing in _parse/constructor()'));
        } catch (e) {
            if (e.badVersion === true && e.message === 'version failure')
                done();
            else
                done(e);
        }
    });

    it('should parse bad chunk NOOP', (done) => {
        const rawData = new Buffer(
            "\x46\x00\x00\x00\x32\x00\x00\x00\x10\x20\x01\x2a\x18\x08\x01\x12" +
            "\x14\x70\x14\x62\x07\x0b\x41\xf4\xb0\x21\xd1\x93\xfa\x53\xb4\x15" +
            "\xf0\x4b\xb6\xba\xa2\x3a\x14\x0a\x10\x08\xbe\xea\xda\x04\x18\xcd" +
            "\xa0\x85\xc4\x8c\x2a\x20\x7b\x38\x1e\x12\x00", "ascii");

        try {
            const pdu = new Kinetic.PDU(rawData);
            logger.info(util.inspect(pdu.getProtobuf(),
                {showHidden: false, depth: null}));

            done(new Error('Bad error throwing in _parse/constructor()'));
        } catch (e) {
            if (e.badChunk && e.message === 'bad chunk')
                done();
            else
                done(e);
        }
    });

    it('should parse hmac failure NOOP', (done) => {
        const rawData = new Buffer(
            "\x46\x00\x00\x00\x32\x00\x00\x00\x00\x20\x01\x2a\x18\x08\x01\x12" +
            "\x14\x70\x14\x62\x07\x0b\x41\xf4\xb0\x22\xd1\x93\xfa\x53\xb4\x15" +
            "\xf0\x4b\xb6\xba\xa2\x3a\x14\x0a\x10\x08\xbe\xea\xda\x04\x18\xcd" +
            "\xa0\x85\xc4\x8c\x2a\x20\x7b\x38\x1e\x12\x00", "ascii");

        try {
            const pdu = new Kinetic.PDU(rawData);
            logger.info(util.inspect(pdu.getProtobuf(),
                {showHidden: false, depth: null}));

            done(new Error('Bad error throwing in _parse/constructor()'));
        } catch (e) {
            if (e.hmacFail && e.message === 'HMAC did not compare')
                done();
            else
                done(e);
        }
    });

    it('should parse valid NOOP_RESPONSE', (done) => {
        const rawData = new Buffer(
            "\x46\x00\x00\x00\x2f\x00\x00\x00\x00\x20\x01\x2a\x18\x08\x01\x12" +
            "\x14\x62\x0c\xb9\x95\xa8\x03\x38\xe4\x79\x5f\xac\xe0\x21\x8c\xbd" +
            "\x11\xaf\x14\x74\x83\x3a\x11\x0a\x0b\x18\xa9\xc4\xd2\x92\x8d\x2a" +
            "\x30\x02\x38\x1d\x1a\x02\x08\x01", "ascii");

        try {
            const pdu = new Kinetic.PDU(rawData);
            assert.equal(pdu.getProtobufSize(), 17);
            assert.equal(pdu.getChunkSize(), 0);
            assert.equal(pdu.getMessageType(), Kinetic.ops.NOOP_RESPONSE);

            done();
        } catch (e) {
            done(e);
        }
    });

    it('should parse valid PUT', (done) => {
        const rawData = new Buffer(
            "\x46\x00\x00\x00\x41\x00\x00\x00\x28\x20\x01\x2a\x18\x08\x01\x12" +
            "\x14\x3b\xad\xea\x16\x6f\x8b\x37\xff\xf6\xd6\x0d\x03\x24\xf1\xb5" +
            "\x53\xa9\x14\xbb\xc6\x3a\x23\x0a\x0e\x08\xc5\x0f\x18\xf8\x87\xcd" +
            "\xf4\x8c\x2a\x20\x01\x38\x04\x12\x11\x0a\x0f\x12\x01\xe3\x1a\x05" +
            "mykey\x22\x01\xe3\x48\x01D4T4d4t4D4T4d4t4D4T4d4t4D4T4d4t4D4T4d4t4",
            "ascii");

        try {
            const pdu = new Kinetic.PDU(rawData);
            assert.equal(pdu.getProtobufSize(), 35);
            assert.equal(pdu.getChunkSize(), 40);
            assert.equal(pdu.getMessageType(), Kinetic.ops.PUT);
            assert.equal(pdu.getClusterVersion(), 1989);
            assert.equal(pdu.getKey(), "mykey");
            assert(pdu.getChunk().equals(
                new Buffer("D4T4d4t4D4T4d4t4D4T4d4t4D4T4d4t4D4T4d4t4")));

            done();
        } catch (e) {
            done(e);
        }
    });

    it('should parse valid PUT_RESPONSE', (done) => {
        const rawData = new Buffer(
            "\x46\x00\x00\x00\x33\x00\x00\x00\x00\x20\x01\x2a\x18\x08\x01\x12" +
            "\x14\x01\x6d\x91\xa7\x8c\x67\xdf\x96\x1f\xca\x53\xa5\xa5\x0b\xdf" +
            "\xa5\xe6\x4f\x0a\xe2\x3a\x15\x0a\x0b\x18\x8d\xc4\xd2\x92\x8d\x2a" +
            "\x30\x00\x38\x03\x12\x02\x0a\x00\x1a\x02\x08\x01", "ascii");


        try {
            const pdu = new Kinetic.PDU(rawData);

            assert.equal(pdu.getProtobufSize(), 21);
            assert.equal(pdu.getChunkSize(), 0);
            assert.equal(pdu.getMessageType(), Kinetic.ops.PUT_RESPONSE);

            done();
        } catch (e) {
            done(e);
        }
    });

    it('should parse valid GET', (done) => {
        const rawData = new Buffer(
            "\x46\x00\x00\x00\x37\x00\x00\x00\x00\x20\x01\x2a\x18\x08\x01\x12" +
            "\x14\xb6\x8a\x74\x54\x51\xf1\xcb\x4a\x99\xe2\x78\x3c\x29\x15\x45" +
            "\x21\x42\x45\xc0\x33\x3a\x19\x0a\x0d\x08\x00\x18\xd6\xec\xde\x95" +
            "\x8d\x2a\x20\x01\x38\x02\x12\x08\x0a\x06\x1a\x04\x71\x77\x65\x72",
            "ascii");


        try {
            const pdu = new Kinetic.PDU(rawData);

            assert.equal(pdu.getProtobufSize(), 25);
            assert.equal(pdu.getChunkSize(), 0);
            assert.equal(pdu.getMessageType(), Kinetic.ops.GET);
            assert.equal(pdu.getClusterVersion(), 0);
            assert.equal(pdu.getKey(), "qwer");

            done();
        } catch (e) {
            done(e);
        }
    });

    it('should parse valid GET_RESPONSE', (done) => {
        const rawData = new Buffer(
            "\x46\x00\x00\x00\x3d\x00\x00\x00\x1c\x20\x01\x2a\x18\x08\x01\x12" +
            "\x14\x40\x97\x7d\x14\xc5\xb3\xd4\x17\x87\x27\x23\xcf\xb7\x25\x8d" +
            "\x6a\x36\xbe\x54\xe2\x3a\x1f\x0a\x0b\x18\xab\xdf\x96\xf5\x8c\x2a" +
            "\x30\x01\x38\x01\x12\x0c\x0a\x0a\x1a\x04qwer\x22\x00" +
            "\x2a\x00\x1a\x02\x08\x01ON DIT BONJOUR TOUT LE MONDE", "ascii");

        try {
            const pdu = new Kinetic.PDU(rawData);

            assert.equal(pdu.getProtobufSize(), 31);
            assert.equal(pdu.getChunkSize(), 28);
            assert.equal(pdu.getMessageType(), Kinetic.ops.GET_RESPONSE);
            assert.equal(pdu.getKey(), "qwer");
            assert(pdu.getChunk().equals(
                new Buffer("ON DIT BONJOUR TOUT LE MONDE")));

            done();
        } catch (e) {
            done(e);
        }
    });

    it('should parse valid FLUSH', (done) => {
        const rawData = new Buffer(
            "\x46\x00\x00\x00\x2f\x00\x00\x00\x00\x20\x01\x2a\x18\x08\x01\x12" +
            "\x14\x51\xb0\x2c\x5f\xad\x9e\x5a\x59\x85\x9c\xa2\x91\x53\xd4\x47" +
            "\xe1\x1f\x6b\x73\x8e\x3a\x11\x0a\x0d\x08\x00\x18\xe3\xec\xde\x95" +
            "\x8d\x2a\x20\x03\x38\x20\x12\x00", "ascii");

        try {
            const pdu = new Kinetic.PDU(rawData);

            assert.equal(pdu.getProtobufSize(), 17);
            assert.equal(pdu.getChunkSize(), 0);
            assert.equal(pdu.getMessageType(), Kinetic.ops.FLUSH);
            assert.equal(pdu.getClusterVersion(), 0);

            done();
        } catch (e) {
            done(e);
        }
    });


    it('should parse valid FLUSH_RESPONSE', (done) => {
        const rawData = new Buffer(
            "\x46\x00\x00\x00\x2f\x00\x00\x00\x00\x20\x01\x2a\x18\x08\x01\x12" +
            "\x14\x54\x1a\xc5\x91\x49\xdf\xf4\x1d\x5d\xdd\x73\xac\x23\xce\xeb" +
            "\xe0\x10\x74\xf8\x1a\x3a\x11\x0a\x0b\x18\xad\xc4\xd2\x92\x8d\x2a" +
            "\x30\x03\x38\x1f\x1a\x02\x08\x01", "ascii");

        try {
            const pdu = new Kinetic.PDU(rawData);

            assert.equal(pdu.getProtobufSize(), 17);
            assert.equal(pdu.getChunkSize(), 0);
            assert.equal(pdu.getMessageType(), Kinetic.ops.FLUSH_RESPONSE);

            done();
        } catch (e) {
            done(e);
        }
    });

    it('should parse valid GETLOG', (done) => {
        const rawData = new Buffer(
            "\x46\x00\x00\x00\x3f\x00\x00\x00\x00\x20\x01\x2a\x18\x08\x01\x12" +
            "\x14\xcf\xa0\xb4\xec\xc7\x18\xd6\x1f\x55\x6f\xd8\xde\xd4\x91\x3b" +
            "\x5a\xaf\x7d\x91\x19\x3a\x21\x0a\x0d\x08\x00\x18\xec\xec\xde\x95" +
            "\x8d\x2a\x20\x04\x38\x18\x12\x10\x32\x0e\x08\x00\x08\x01\x08\x02" +
            "\x08\x03\x08\x04\x08\x05\x08\x06", "ascii");


        try {
            const pdu = new Kinetic.PDU(rawData);

            assert.equal(pdu.getProtobufSize(), 33);
            assert.equal(pdu.getChunkSize(), 0);
            assert.equal(pdu.getMessageType(), Kinetic.ops.GETLOG);
            assert.equal(pdu.getClusterVersion(), 0);

            done();
        } catch (e) {
            done(e);
        }
    });

        /*
         *  GETLOG_RESPONSE - Little problem for the HMAC integrity verification
         *  with the log type 3 (configuration)
         *  issue #29 : https://github.com/scality/IronMan-Arsenal/issues/29
         */
    it('should parse valid GETLOG_RESPONSE', (done) => {
        const rawData = new Buffer(
            "\x46\x00\x00\x01\x7f\x00\x00\x00\x00\x20\x01\x2a\x18\x08\x01\x12" +
            "\x14\xc3\x10\xd3\x89\xce\xf8\x78\xb0\x3d\x30\x1b\x33\xb7\xbf\xa1" +
            "\x55\xc9\x5e\x40\x15\x3a\xe0\x02\x0a\x0b\x18\xff\xdc\xe3\xba\x8d" +
            "\x2a\x30\x04\x38\x17\x12\xcc\x02\x32\xc9\x02\x08\x00\x08\x01\x08" +
            "\x02\x08\x04\x08\x05\x08\x06\x12\x0a\x0a\x03\x48\x44\x41\x15\x85" +
            "\xeb\x11\x3f\x12\x0a\x0a\x03\x45\x4e\x30\x15\xae\x47\xe1\x3e\x12" +
            "\x0a\x0a\x03\x45\x4e\x31\x15\x8f\xc2\xf5\x3d\x12\x0a\x0a\x03\x43" +
            "\x50\x55\x15\xec\x51\x38\x3f\x1a\x19\x0a\x03\x48\x44\x41\x15\x00" +
            "\x00\x1c\x42\x1d\x00\x00\xa0\x40\x25\x00\x00\xc8\x42\x2d\x00\x00" +
            "\xc8\x41\x1a\x19\x0a\x03\x43\x50\x55\x15\x00\x00\x50\x42\x1d\x00" +
            "\x00\xa0\x40\x25\x00\x00\xc8\x42\x2d\x00\x00\xc8\x41\x22\x0c\x20" +
            "\x80\xa0\xcd\xec\xeb\x06\x2d\x79\x62\x26\x3d\x32\x0b\x08\x04\x20" +
            "\xb0\xb0\x01\x28\xee\xfc\xb3\x0a\x32\x0a\x08\x02\x20\xf4\x6e\x28" +
            "\xd6\xe9\xb7\x05\x32\x0b\x08\x06\x20\xd0\xfd\x01\x28\x99\xac\xea" +
            "\x01\x32\x09\x08\x0a\x20\xfa\x01\x28\xc9\x84\x02\x32\x09\x08\x08" +
            "\x20\xfe\x01\x28\xd4\x87\x02\x32\x09\x08\x0c\x20\xe4\x0c\x28\xa0" +
            "\xd6\x17\x32\x06\x08\x10\x20\x00\x28\x00\x32\x09\x08\x1a\x20\x8b" +
            "\x06\x28\x99\xc7\x05\x32\x09\x08\x16\x20\xb9\x02\x28\xe4\x94\x02" +
            "\x32\x0a\x08\x18\x20\xa2\x02\x28\xe6\xcf\x88\x04\x32\x07\x08\x1c" +
            "\x20\x1c\x28\xef\x27\x3a\x16\x4d\x65\x73\x73\x61\x67\x65\x20\x66" +
            "\x72\x6f\x6d\x20\x73\x69\x6d\x75\x6c\x61\x74\x6f\x72\x42\x35\x08" +
            "\x80\x20\x10\x80\x80\x40\x18\x80\x10\x20\xff\xff\xff\xff\x0f\x28" +
            "\xff\xff\xff\xff\x0f\x30\xff\xff\xff\xff\x0f\x38\xff\xff\xff\xff" +
            "\x0f\x40\xff\xff\xff\xff\x0f\x48\xc8\x01\x50\xff\xff\xff\xff\x0f" +
            "\x60\x0f\x68\x05\x1a\x02\x08\x01",  "ascii");

        try {
            const pdu = new Kinetic.PDU(rawData);

            assert.equal(pdu.getProtobufSize(), 352);
            assert.equal(pdu.getChunkSize(), 0);
            assert.equal(pdu.getMessageType(), Kinetic.ops.GETLOG_RESPONSE);
            assert.deepEqual(pdu._message.body.getLog.types,
                [0, 1, 2, 4, 5, 6]);
            done();
        } catch (e) {
            done(e);
        }
    });
});

describe('Kinetic.PDU send()', () => {
    it('should write valid NOOP', (done) => {
        const sock = new stream.PassThrough();

        const k = new Kinetic.NoOpPDU(123, 9876798);
        try {
            k.send(sock);
        } catch (e) {
            done(e);
        }

        const result = sock.read();

        const expected = new Buffer(
            "\x46\x00\x00\x00\x32\x00\x00\x00\x00\x20\x01\x2a\x18\x08\x01\x12" +
            "\x14\xde\x57\x30\x36\x5a\x4a\x6f\xb7\x88\x02\x0b\xc4\x38\x0f\x76" +
            "\xd9\xf1\xae\x57\x3b\x3a\x14\x0a\x10\x08\xbe\xea\xda\x04\x18\x82" +
            "\xf9\xdb\x8f\x8d\x2a\x20\x7b\x38\x1e\x12\x00", "ascii");

        // Ignore the timestamp bytes (17 -> 37 & 47 -> 51)
        assert(result.slice(0, 17).equals(expected.slice(0, 17)));
        assert(result.slice(37, 47).equals(expected.slice(37, 47)));
        assert(result.slice(52).equals(expected.slice(52)));

        done();
    });
    it('should write valid PUT', (done) => {
        const sock = new stream.PassThrough();

        const k = new Kinetic.PutPDU(new Buffer('qwer'), 0,
            new Buffer(0), new Buffer('1'), 0);
        k.setChunk(new Buffer("ON DIT BONJOUR TOUT LE MONDE"));

        try {
            k.send(sock);
        } catch (e) {
            done(e);
        }

        const result = sock.read();

        const expected = new Buffer(
            "\x46\x00\x00\x00\x3e\x00\x00\x00\x1c\x20\x01\x2a\x18\x08\x01\x12" +
            "\x14\x7d\x41\xc3\xd7\x37\xb9\x69\x82\xef\xb5\x2d\x7b\xc3\x9f\x47" +
            "\x35\x82\x92\x29\x6d\x3a\x20\x0a\x0d\x08\x00\x18\xdb\x9e\xcc\xc0" +
            "\x8d\x2a\x20\x00\x38\x04\x12\x0f\x0a\x0d\x12\x01\x31\x1a\x04qwer" +
            "\x22\x00\x48\x01ON DIT BONJOUR TOUT LE MONDE", "ascii");

        // Ignore the timestamp bytes (17 -> 37 & 44 -> 48)
        assert(result.slice(0, 17).equals(expected.slice(0, 17)));
        assert(result.slice(37, 44).equals(expected.slice(37, 44)));
        assert(result.slice(49).equals(expected.slice(49)));

        done();
    });
    it('should write valid GET', (done) => {
        const sock = new stream.PassThrough();

        const k = new Kinetic.GetPDU(new Buffer('qwer'), 0, 0);

        try {
            k.send(sock);
        } catch (e) {
            done(e);
        }

        const result = sock.read();

        const expected = new Buffer(
            "\x46\x00\x00\x00\x37\x00\x00\x00\x00\x20\x01\x2a\x18\x08\x01\x12" +
            "\x14\x71\x45\xcf\xea\xa2\x7c\x91\xc9\x90\xfb\x3e\x09\xa1\xe0\x92" +
            "\xd4\x5a\xb6\x17\xfd\x3a\x19\x0a\x0d\x08\x00\x18\x95\xd3\xeb\xc2" +
            "\x8d\x2a\x20\x00\x38\x02\x12\x08\x0a\x06\x1a\x04\x71\x77\x65\x72",
            "ascii");

        // Ignore the timestamp bytes (17 -> 37 & 44 -> 48)
        assert(result.slice(0, 17).equals(expected.slice(0, 17)));
        assert(result.slice(37, 44).equals(expected.slice(37, 44)));
        assert(result.slice(49).equals(expected.slice(49)));

        done();
    });
    it('should write valid DELETE', (done) => {
        const sock = new stream.PassThrough();

        const k = new Kinetic.DeletePDU(new Buffer('qwer'), 0, 0,
            new Buffer('1234'));

        try {
            k.send(sock);
        } catch (e) {
            done(e);
        }

        const result = sock.read();

        const expected = new Buffer(
            "\x46\x00\x00\x00\x3f\x00\x00\x00\x00\x20\x01\x2a\x18\x08\x01\x12" +
            "\x14\x9b\xbd\xcc\x31\xf6\x25\xa1\x0d\xd0\x0f\xcd\xd4\x22\xf5\xd0" +
            "\x27\xe8\x20\x7a\xc4\x3a\x21\x0a\x0d\x08\x00\x18\x98\xe2\xb3\xc3" +
            "\x8d\x2a\x20\x00\x38\x06\x12\x10\x0a\x0e\x1a\x04\x71\x77\x65\x72" +
            "\x22\x04\x31\x32\x33\x34\x48\x01", "ascii");

        // Ignore the timestamp bytes (17 -> 37 & 44 -> 48)
        assert(result.slice(0, 17).equals(expected.slice(0, 17)));
        assert(result.slice(37, 44).equals(expected.slice(37, 44)));
        assert(result.slice(49).equals(expected.slice(49)));

        done();
    });
    it('should write valid FLUSH', (done) => {
        const sock = new stream.PassThrough();

        const k = new Kinetic.FlushPDU(0, 0);

        try {
            k.send(sock);
        } catch (e) {
            done(e);
        }

        const result = sock.read();

        const expected = new Buffer(
            "\x46\x00\x00\x00\x2f\x00\x00\x00\x00\x20\x01\x2a\x18\x08\x01\x12" +
            "\x14\x1b\xb1\x4c\x9d\x7c\x95\xe6\xbc\x7b\xb0\x0f\x65\x1d\x5e\x24" +
            "\xaa\x6a\xb5\xf0\x0a\x3a\x11\x0a\x0d\x08\x00\x18\xa8\x99\xee\xc3" +
            "\x8d\x2a\x20\x00\x38\x20\x12\x00", "ascii");


        // Ignore the timestamp bytes (17 -> 37 & 44 -> 48)
        assert(result.slice(0, 17).equals(expected.slice(0, 17)));
        assert(result.slice(37, 44).equals(expected.slice(37, 44)));
        assert(result.slice(49).equals(expected.slice(49)));

        done();
    });
    it('should write valid GETLOG', (done) => {
        const sock = new stream.PassThrough();

        const k = new Kinetic.GetLogPDU(0, [0, 1, 2, 4, 5, 6], 0);

        try {
            k.send(sock);
        } catch (e) {
            done(e);
        }

        const result = sock.read();

        const expected = new Buffer(
            "\x46\x00\x00\x00\x3d\x00\x00\x00\x00\x20\x01\x2a\x18\x08\x01\x12" +
            "\x14\xa6\x25\x09\x88\xca\x6f\xbf\x42\x80\xc7\x87\x77\x47\xc4\x78" +
            "\x97\x88\xd9\x2b\xd7\x3a\x1f\x0a\x0d\x08\x00\x18\xb1\xea\xa7\xc4" +
            "\x8d\x2a\x20\x00\x38\x18\x12\x0e\x32\x0c\x08\x00\x08\x01\x08\x02" +
            "\x08\x04\x08\x05\x08\x06", "ascii");

        // Ignore the timestamp bytes (17 -> 37 & 44 -> 48)
        assert(result.slice(0, 17).equals(expected.slice(0, 17)));
        assert(result.slice(37, 44).equals(expected.slice(37, 44)));
        assert(result.slice(49).equals(expected.slice(49)));

        done();
    });
});

describe('Kinetic.PutPDU()', () => {
    it('should check key type', (done) => {
        try {
            const k = new Kinetic.PutPDU("string", 1, new Buffer('2'),
                new Buffer('3'), 1);
            k;
            done(new Error("constructor accepted string-typed key"));
        } catch (e) {
            if (e.message !== "key is not a buffer")
                done(e);
            done();
        }
    });
    it('should check the old dbVersion type', (done) => {
        try {
            const k = new Kinetic.PutPDU(new Buffer("string"), 1, '2',
                new Buffer('3'), 1);
            k;
            done(new Error("constructor accepted string-typed key"));
        } catch (e) {
            if (e.message !== "old dbversion is not a buffer")
                done(e);
            done();
        }
    });
    it('should check the new dbVersion type', (done) => {
        try {
            const k = new Kinetic.PutPDU(new Buffer("string"), 1,
                new Buffer('2'), '3', 1);
            k;
            done(new Error("constructor accepted string-typed key"));
        } catch (e) {
            if (e.message !== "new dbversion is not a buffer")
                done(e);
            done();
        }
    });
});

describe('Kinetic.GetPDU()', () => {
    it('should check key type', (done) => {
        try {
            const k = new Kinetic.GetPDU("string", 1, 2);
            k;
            done(new Error("constructor accepted string-typed key"));
        } catch (e) {
            if (e.message !== "key is not a buffer")
                done(e);
            done();
        }
    });
});

describe('Kinetic.DeletePDU()', () => {
    it('should check key type', (done) => {
        try {
            const k = new Kinetic.DeletePDU("string", 1, 2, new Buffer('3'));
            k;
            done(new Error("constructor accepted string-typed key"));
        } catch (e) {
            if (e.message !== "key is not a buffer")
                done(e);
            done();
        }
    });
    it('should check the dbVersion type', (done) => {
        try {
            const k = new Kinetic.DeletePDU(new Buffer("string"), 1, 2, '3');
            k;
            done(new Error("constructor accepted string-typed key"));
        } catch (e) {
            if (e.message !== "dbVersion is not a buffer")
                done(e);
            done();
        }
    });
});
