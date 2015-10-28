import { Kinetic } from '../../index';
import assert from 'assert';
import net from 'net';
import fs from 'fs';
import util from 'util';
import winston from 'winston';

const logger = new (winston.Logger)({
    transports: [
        new (winston.transports.Console)({ level: 'warn' }),
    ]
});

const dataChunk = fs.readFileSync('./package.json');
const HOST = '127.0.0.1';
let _tmp = undefined;
let _errorTest = undefined;

const requestsArr = [
    ['put', 'PUT_RESPONSE'],
    ['get', 'GET_RESPONSE'],
    ['delete', 'DELETE_RESPONSE'],
    ['noop', 'NOOP_RESPONSE'],
    ['flush', 'FLUSHALLDATA_RESPONSE'],
    ['getLog', 'GETLOG_RESPONSE']
];

const kinetic = new Kinetic;
kinetic.setChunk(dataChunk);

function getSlice(obj) {
    return obj.buffer.slice(obj.offset, obj.limit);
}

function checkRequest(request, done) {
    const PORT = 6969;
    const client = new net.Socket();
    client.connect(PORT, HOST, function firstConn() {
        switch (request) {
        case 'put':
            kinetic.put(new Buffer('qwer'), 1,
                new Buffer('1234'), new Buffer('1235'), 12);
            break;
        case 'get':
            kinetic.get('qwer', 1, 1);
            break;
        case 'delete':
            kinetic.delete('qwer', 1, 1);
            break;
        case 'flush':
            kinetic.flush(1, 1);
            break;
        case 'noop':
            kinetic.noOp(1, 1);
            break;
        case 'getLog':
            kinetic.getLog(1, [1, 2, 3, 4], 1);
            break;
        default:
            throw new Error("wrong request");
        }
        kinetic.send(client);
        _tmp = kinetic.getCommand().decode(kinetic.getProtobuf().commandBytes);
        let ret = undefined;
        client.on('data', function handleData(data) {
            ret = data;
            client.end();
        });

        client.on('end', function requestEnd() {
            kinetic.parse(ret);
            logger.info('=Local================================');
            logger.info(util.inspect(_tmp,
            {showHidden: false, depth: null}));
            logger.info('*Received*****************************');
            logger.info(util.inspect(kinetic.getProtobuf(),
            {showHidden: false, depth: null}));

            const protobuf = kinetic.getProtobuf();

            assert.deepEqual(dataChunk, kinetic.getChunk());
            assert.deepEqual(_tmp.header.messageType,
                    protobuf.header.messageType);
            assert.deepEqual(_tmp.header.sequence,
                    protobuf.header.sequence);
            assert.deepEqual(_tmp.header.clusterVersion,
                    protobuf.header.clusterVersion);

            if (request !== 'noop' &&
                    request !== 'flush' &&
                    request !== 'getLog') {
                assert.deepEqual(getSlice(_tmp.body.keyValue.key),
                        getSlice(protobuf.body.keyValue.key));
            }
            if (request === 'put') {
                assert.deepEqual(getSlice(_tmp.body.keyValue.dbVersion),
                        getSlice(protobuf.body.keyValue.dbVersion));

                assert.deepEqual(getSlice(_tmp.body.keyValue.newVersion),
                        getSlice(protobuf.body.keyValue.newVersion));
            }
            if (request === 'getLog') {
                assert.deepEqual(_tmp.body.getLog.types,
                        protobuf.body.getLog.types);
            }
            done();
        });
    });
}

function checkResponse(request, response, done) {
    const PORT = 6970;
    let ret = undefined;
    const client = new net.Socket();
    const errorMessage = new Buffer('qwerty');

    const message = new kinetic.build.Command({
        "header": {
            "messageType": response,
            "ackSequence": 1,
        },
        "body": {
            "keyValue": {},
        },
        "status": {
            "code": 1,
            "detailedMessage": errorMessage,
        },
    });
    client.connect(PORT, HOST, function conn() {
        switch (request) {
        case 'put':
            kinetic.put('qwer', 1, new Buffer('234'), new Buffer('1235'), 12);
            break;
        case 'get':
            kinetic.get('qwer', 1, 1);
            break;
        case 'delete':
            kinetic.delete('qwer', 1, 1);
            break;
        case 'flush':
            kinetic.flush(1, 1);
            break;
        case 'noop':
            kinetic.noOp(1, 1);
            break;
        case 'getLog':
            kinetic.getLog(1, [1, 2, 3, 4, 5, 6], 1);
            break;
        default:
            throw new Error("wrong request");
        }
        kinetic.send(client);

        client.on('data', function handle(data) {
            ret = data;
            client.end();
        });
        client.on('end', function responseEnd() {
            kinetic.parse(ret);
            const protobuf = kinetic.getProtobuf();

            logger.info('=Local================================');
            logger.info(util.inspect(message,
            {showHidden: false, depth: null}));
            logger.info('*Received*****************************');
            logger.info(util.inspect(protobuf,
            {showHidden: false, depth: null}));

            const detail = message.status.detailedMessage;
            const objDetail = protobuf.status.detailedMessage;
            assert.deepEqual(detail.buffer, getSlice(objDetail));
            assert.deepEqual(message.header.messageType,
                    protobuf.header.messageType);

            done();
        });
    });
}

function checkIntegrity(requestArr) {
    const request = requestArr[0];
    const response = requestArr[1];
    describe(`Assess ${request} and its response ${response}`, () => {
        it(`Chunk and ${request} protobufMessage should be preserved`,
                (done) => { checkRequest(request, done); });
        it(`Assess ${response} Type`, (done) => {
            checkResponse(request, response, done);
        });
    });
}

function checkError(done) {
    _errorTest = new Buffer('VERSION_FAILURE');
    assert.deepEqual(kinetic.parse(_errorTest),
        kinetic.errors.VERSION_FAILURE);
    _errorTest[0] = 70;
    assert.deepEqual(kinetic.parse(_errorTest),
        kinetic.errors.DATA_ERROR);
    done();
}

describe(`Assess Errors`, () => {
    after(`Assess  Type`, (done) => {
        checkError(done);
    });
});


requestsArr.forEach(checkIntegrity);
