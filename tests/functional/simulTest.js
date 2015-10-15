import { Kinetic } from '../../index';
import net from 'net';
import util from 'util';
import assert from 'assert';
import winston from 'winston';

const HOST = '127.0.0.1';
const PORT = 8123;
let incrementTCP = 0;

const kinetic = new Kinetic;

kinetic.setChunk("");

const logger = new (winston.Logger)({
    transports: [
        new (winston.transports.Console)({ level: 'warn' }),
    ]
});

const requestsArr = [
    ['put', 'PUT_RESPONSE'],
    ['get', 'GET_RESPONSE'],
    ['delete', 'DELETE_RESPONSE'],
    ['noop', 'NOOP_RESPONSE'],
    ['flush', 'FLUSH_RESPONSE'],
    ['getLog', 'GETLOG_RESPONSE']
];

function functionx(request, client) {
    if (request === 'noop')
        kinetic.noOp(incrementTCP, 0);
    else if (request === 'put')
        kinetic.put('qwer', incrementTCP, '1234', '1235', 0);
    else if (request === 'get')
        kinetic.get('qwer', incrementTCP, 0);
    else if (request === 'delete')
        kinetic.delete('qwer', incrementTCP, 0);
    else if (request === 'flush')
        kinetic.flush(incrementTCP, 0);
    else if (request === 'getLog')
        kinetic.getLog(incrementTCP, [1, 2, 3, 4], 0);
    kinetic.send(client);
    incrementTCP++;
}

function checkTest(request, requestResponse, done) {
    const client = new net.Socket();
    client.connect(PORT, HOST, function firstConn() {

    });
    client.on('data', function heandleData(data) {
        kinetic.parse(data);
        logger.info(util.inspect(kinetic.getProtobuf(),
            {showHidden: false,  depth: null}));
        if (kinetic.getMessageType() === null ||
            kinetic.getOp(kinetic.getMessageType()) !== requestResponse)
            functionx(request, client);
        else {
            client.end();
            assert.deepEqual(kinetic.getOp(kinetic.getMessageType()),
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
