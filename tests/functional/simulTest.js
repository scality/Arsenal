import assert from 'assert';
import net from 'net';
import util from 'util';

import winston from 'winston';

import { Kinetic } from '../../index';

const HOST = '127.0.0.1';
const PORT = 8123;
let incrementTCP = 0;

const logger = new (winston.Logger)({
    transports: [new (winston.transports.Console)({ level: 'error' })]
});

const requestsArr = [
    ['put', 'PUT_RESPONSE'],
    ['get', 'GET_RESPONSE'],
    ['noop', 'NOOP_RESPONSE'],
    ['flush', 'FLUSH_RESPONSE'],
    ['getLog', 'GETLOG_RESPONSE']
];

function requestsLauncher(request, client) {
    let pdu;

    if (request === 'noop') {
        pdu = new Kinetic.NoOpPDU(incrementTCP, 0);
    } else if (request === 'put') {
        pdu = new Kinetic.PutPDU('qwer', incrementTCP, null, '1', 0);
        pdu.setChunk(new Buffer("ON DIT BONJOUR TOUT LE MONDE"));
    } else if (request === 'get') {
        pdu = new Kinetic.GetPDU('qwer', incrementTCP, 0);
    } else if (request === 'delete') {
        pdu = new Kinetic.DeletePDU('qwer', incrementTCP, 0, '1236');
    } else if (request === 'flush') {
        pdu = new Kinetic.FlushPDU(incrementTCP, 0);
    } else if (request === 'getLog') {
        pdu = new Kinetic.GetLogPDU(incrementTCP, [1, 2, 3, 4], 0);
    }

    pdu.send(client);
    incrementTCP++;
}

function checkTest(request, requestResponse, done) {
    const client = new net.Socket();
    client.connect(PORT, HOST, function firstConn() {

    });
    client.on('data', function heandleData(data) {
        const pdu = new Kinetic.PDU();
        const err = pdu._parse(data);
        logger.warn(Kinetic.getErrorName(err));
        if (pdu.getMessageType() === null ||
            Kinetic.getOpName(pdu.getMessageType()) !== requestResponse) {
            requestsLauncher(request, client);
        } else {
            client.end();
            logger.info(util.inspect(pdu.getProtobuf(),
                {showHidden: false, depth: null}));
            logger.info(util.inspect(pdu.getChunk().toString(),
                {showHidden: false, depth: null}));
            assert.deepEqual(Kinetic.getOpName(pdu.getMessageType()),
                requestResponse);
            done();
        }
    });
}

function checkIntegrity(requestArr) {
    const request = requestArr[0];
    const response = requestArr[1];
    describe(`Assess ${request} and its response ${response}`, () => {
        it(`Chunk and ${request} protobufMessage should be preserved`,
        (done) => { checkTest(request, response, done); });
    });
}

requestsArr.forEach(checkIntegrity);
