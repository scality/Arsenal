'use strict';

require('babel/register');

const KineticConstructor = require('../index').Kinetic;
const assert = require("assert");
const net = require("net");
const fs = require("fs");
const util = require('util');

const dataChunk = fs.readFileSync(process.argv[3]);
const HOST = '127.0.0.1';
const Kinetic = new KineticConstructor;
let _tmp = undefined;

const requests = [
    'put',
    'get',
    'delete',
    'noop',
    'flush',
    'getLog'
];

const requestResponses = [
    'PUT_RESPONSE',
    'GET_RESPONSE',
    'DELETE_RESPONSE',
    'NOOP_RESPONSE',
    'FLUSHALLDATA_RESPONSE',
    'GETLOG_RESPONSE'
];

Kinetic.setChunk(dataChunk);

function _fn(val, valResponse) {
    describe('Chunck and protobuf integrity', function () {
        const label2 = 'Parsing _ Chunk and protobufMessage ' +
            'integrity (' + val + ')- should be equal';
        it(label2, function (done) {
            const PORT = 6969;
            const client = new net.Socket();
            client.connect(PORT, HOST, function () {
                switch (val) {
                case 'put':
                    Kinetic.put(client, 'qwer', 1, '1234', '1235');
                    _tmp = Kinetic.getProtobuf();
                    break;
                case 'get':
                    Kinetic.get(client, 'qwer', 1, 1);
                    _tmp = Kinetic.getProtobuf();
                    break;
                case 'delete':
                    Kinetic.delete(client, 'qwer', 1, 1);
                    _tmp = Kinetic.getProtobuf();
                    break;
                case 'flush':
                    Kinetic.flush(client, 1, 1);
                    _tmp = Kinetic.getProtobuf();
                    break;
                case 'noop':
                    Kinetic.noOp(client, 1, 1);
                    _tmp = Kinetic.getProtobuf();
                    break;
                case 'getLog':
                    Kinetic.getLog(client, 1, [1, 2, 3, 4], 1);
                    _tmp = Kinetic.getProtobuf();
                    break;
                default:
                }
                let ret = undefined;
                client.on('data', function (data) {
                    ret = data;
                    client.end();
                });

                client.on('end', function () {
                    Kinetic.parse(ret);

                    // Uncomment those lines for more details (pb structure);
                    // console.log('=Local================================');
                    // console.log(util.inspect(_tmp,
                    // {showHidden: false, depth: null}));
                    // console.log('*Received*****************************');
                    // console.log(util.inspect(Kinetic.getProtobuf(),
                    // {showHidden: false, depth: null}));

                    assert.deepEqual(dataChunk, Kinetic.getChunk());
                    assert.deepEqual(_tmp.header.messageType,
                        Kinetic.getProtobuf().header.messageType);
                    assert.deepEqual(_tmp.header.sequence,
                        Kinetic.getProtobuf().header.sequence);
                    assert.deepEqual(_tmp.header.clusterVersion,
                        Kinetic.getProtobuf().header.clusterVersion);

                    if (val !== 'noop' &&
                        val !== 'flush' &&
                        val !== 'getLog') {
                        assert.deepEqual(_tmp
                                .body.keyValue.key.buffer.slice(
                                _tmp.body.keyValue.key.offset,
                                _tmp.body.keyValue.key.limit),
                            Kinetic.getProtobuf()
                                .body.keyValue.key.buffer.slice(
                                Kinetic.getProtobuf()
                                    .body.keyValue.key.offset,
                                Kinetic.getProtobuf()
                                    .body.keyValue.key.limit));
                    }
                    if (val === 'put') {
                        assert.deepEqual(
                            _tmp.body.keyValue.dbVersion.buffer.slice(
                                _tmp.body.keyValue.dbVersion.offset,
                                _tmp.body.keyValue.dbVersion.limit),
                            Kinetic.getProtobuf()
                                .body.keyValue.dbVersion.buffer.slice(
                                Kinetic.getProtobuf()
                                    .body.keyValue.dbVersion.offset,
                                Kinetic.getProtobuf()
                                    .body.keyValue.dbVersion.limit));

                        assert.deepEqual(_tmp
                                .body.keyValue.newVersion.buffer.slice(
                                _tmp.body.keyValue.newVersion.offset,
                                _tmp.body.keyValue.newVersion.limit),
                            Kinetic.getProtobuf()
                                .body.keyValue.newVersion.buffer.slice(
                                Kinetic.getProtobuf()
                                    .body.keyValue.newVersion.offset,
                                Kinetic.getProtobuf()
                                    .body.keyValue.newVersion.limit));
                    }
                    if (val === 'getLog') {
                        assert.deepEqual(_tmp.body.getLog.types,
                                        Kinetic.getProtobuf()
                                            .body.getLog.types);
                    }
                    done();
                });
            });
        });

        const label = valResponse + ' _ errorMessage ' +
            'and messageType - should be equal';
        it(label, function (done) {
            const PORT = 6970;
            let ret = undefined;
            const client = new net.Socket();
            const errorMessage = new Buffer('qwerty');

            const message = new Kinetic.build.Command({
                "header": {
                    "messageType": valResponse,
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
            client.connect(PORT, HOST, function () {
                switch (val) {
                case 'put':
                    Kinetic.put(client, 'qwer', 1, '1234', '1235');
                    break;
                case 'get':
                    Kinetic.get(client, 'qwer', 1, 1);
                    break;
                case 'delete':
                    Kinetic.delete(client, 'qwer', 1, 1);
                    break;
                case 'flush':
                    Kinetic.flush(client, 1, 1);
                    break;
                case 'noop':
                    Kinetic.noOp(client, 1, 1);
                    break;
                case 'getLog':
                    Kinetic.getLog(client, 1, [1, 2, 3, 4, 5, 6], 1);
                    break;
                default:
                }

                client.on('data', function (data) {
                    ret = data;
                    client.end();
                }).on('end', function () {
                    Kinetic.parse(ret);

                    // Uncomment those lines for more details (pb structure);
                    // console.log('=Local================================');
                    // console.log(util.inspect(message,
                    // {showHidden: false, depth: null}));
                    // console.log('*Received*****************************');
                    // console.log(util.inspect(Kinetic.getProtobuf(),
                    // {showHidden: false, depth: null}));

                    assert.deepEqual(message
                            .status.detailedMessage.buffer.slice(
                            message.status.detailedMessage.offset,
                            message.status.detailedMessage.limit),
                        Kinetic.getProtobuf()
                            .status.detailedMessage.buffer.slice(
                            Kinetic.getProtobuf()
                                .status.detailedMessage.offset,
                            Kinetic.getProtobuf()
                                .status.detailedMessage.limit));
                    assert.deepEqual(message.header.messageType,
                        Kinetic.getProtobuf().header.messageType);

                    done();
                });
            });
        });
    });
}

for (let i = 0; i <= 5; i++) {
    _fn(requests[i], requestResponses[i]);
}
