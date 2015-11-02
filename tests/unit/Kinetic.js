import assert from 'assert';

import { Kinetic } from '../../index';

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

        const pdu = new Kinetic.PDU(rawData);

        assert.equal(pdu.getProtobufSize(), 20);
        assert.equal(pdu.getChunkSize(), 0);
        assert.equal(pdu.getMessageType(), Kinetic.ops.NOOP);
        assert.equal(pdu.getClusterVersion(), 9876798);

        done();
    });

    it('should parse valid PUT', (done) => {
        const rawData = new Buffer(
            "\x46\x00\x00\x00\x41\x00\x00\x00\x28\x20\x01\x2a\x18\x08\x01\x12" +
            "\x14\x3b\xad\xea\x16\x6f\x8b\x37\xff\xf6\xd6\x0d\x03\x24\xf1\xb5" +
            "\x53\xa9\x14\xbb\xc6\x3a\x23\x0a\x0e\x08\xc5\x0f\x18\xf8\x87\xcd" +
            "\xf4\x8c\x2a\x20\x01\x38\x04\x12\x11\x0a\x0f\x12\x01\xe3\x1a\x05" +
            "mykey\x22\x01\xe3\x48\x01D4T4d4t4D4T4d4t4D4T4d4t4D4T4d4t4D4T4d4t4",
            "ascii");

        const pdu = new Kinetic.PDU(rawData);

        assert.equal(pdu.getProtobufSize(), 35);
        assert.equal(pdu.getChunkSize(), 40);
        assert.equal(pdu.getMessageType(), Kinetic.ops.PUT);
        assert.equal(pdu.getClusterVersion(), 1989);
        assert.equal(pdu.getKey(), "mykey");
        assert(pdu.getChunk().equals(
                    new Buffer("D4T4d4t4D4T4d4t4D4T4d4t4D4T4d4t4D4T4d4t4")));

        done();
    });

    it('should parse valid GET_RESPONSE', (done) => {
        const rawData = new Buffer(
            "\x46\x00\x00\x00\x3d\x00\x00\x00\x1c\x20\x01\x2a\x18\x08\x01\x12" +
            "\x14\x40\x97\x7d\x14\xc5\xb3\xd4\x17\x87\x27\x23\xcf\xb7\x25\x8d" +
            "\x6a\x36\xbe\x54\xe2\x3a\x1f\x0a\x0b\x18\xab\xdf\x96\xf5\x8c\x2a" +
            "\x30\x01\x38\x01\x12\x0c\x0a\x0a\x1a\x04qwer\x22\x00" +
            "\x2a\x00\x1a\x02\x08\x01ON DIT BONJOUR TOUT LE MONDE", "ascii");

        const pdu = new Kinetic.PDU(rawData);

        assert.equal(pdu.getProtobufSize(), 31);
        assert.equal(pdu.getChunkSize(), 28);
        assert.equal(pdu.getMessageType(), Kinetic.ops.GET_RESPONSE);
        assert.equal(pdu.getKey(), "qwer");
        assert(pdu.getChunk().equals(
                    new Buffer("ON DIT BONJOUR TOUT LE MONDE")));

        done();
    });
});

describe('Kinetic.PDU send()', () => {
    it('should write valid NOOP', (done) => {
        // TODO
        // const sock = new stream.PassThrough();
        //
        // const k = new Kinetic.NoOpPDU(123, 9876798);
        // const ret = k.send(sock);
        // assert(ret === Kinetic.errors.SUCCESS);
        //
        // const result = sock.read();
        //
        // const expected = new Buffer(...);
        //
        // // Clear variable fields such as connectionID, sequence,
        // // ackSequence...
        // result.write('\0\0\0\0\0\0\0\0', 9 + 8, 8);
        // result.write('\0\0\0\0\0\0\0\0', 9 + 16, 8);
        // result.write('\0\0\0\0\0\0\0\0', 9 + 24, 8);
        //
        // assert(result.equals(expected));

        done();
    });
});
