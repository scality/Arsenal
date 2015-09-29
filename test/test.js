var Kinetic = require('../index').Kinetic;
var mocha = require('mocha');
var assert = require("assert");
var net = require("net");
var fs = require("fs");
var util = require('util');

var dataChunk = fs.readFileSync(process.argv[3]);
var HOST = '127.0.0.1';
var _tmp = undefined;

var requests = [
    'put',
    'get',
    'delete',
    'noop',
    'flush'
];
var request_responses = [
    'PUT_RESPONSE',
    'GET_RESPONSE',
    'DELETE_RESPONSE',
    'NOOP_RESPONSE',
    'FLUSHALLDATA_RESPONSE'
];

Kinetic.setChunk(dataChunk);

function _fn(val, val_response) {

    describe('Chunck and protobuf integrity', function () {

        it('Parsing ___ Chunk and protobufMessage integrity (' + val + ')- should be equal', function (done) {
            var PORT = 6969;
            var client = new net.Socket();
            client.connect(PORT, HOST, function () {
                if (val === 'put') {
                    Kinetic.put(client, 'qwer', 1, '1234', '1235');
                    _tmp = Kinetic.getProtobuf();
                }
                else if (val === 'get') {
                    Kinetic.get(client, 'qwer', 1, 1);
                    _tmp = Kinetic.getProtobuf();
                }
                else if (val === 'delete') {
                    Kinetic.delete(client, 'qwer', 1, 1);
                    _tmp = Kinetic.getProtobuf();
                }
                else if (val === 'flush') {
                    Kinetic.flush(client, 1, 1);
                    _tmp = Kinetic.getProtobuf();
                }
                else if (val === 'noop') {
                    Kinetic.noOp(client, 1, 1);
                    _tmp = Kinetic.getProtobuf();
                }
                var ret = undefined;
                client.on('data', function (data) {
                    ret = data;
                    client.end();
                }).on('end', function () {
                    Kinetic.parse(ret);
                    assert.deepEqual(dataChunk, Kinetic.getChunk());
                    assert.deepEqual(_tmp.header.messageType, Kinetic.getProtobuf().header.messageType);
                    assert.deepEqual(_tmp.header.sequence, Kinetic.getProtobuf().header.sequence);
                    assert.deepEqual(_tmp.header.clusterVersion, Kinetic.getProtobuf().header.clusterVersion);
                    if (val !== 'noop' && val !== 'flush') {
                        assert.deepEqual(_tmp.body.keyValue.key.buffer.slice(_tmp.body.keyValue.key.offset, _tmp.body.keyValue.key.limit),
                            Kinetic.getProtobuf().body.keyValue.key.buffer.slice(Kinetic.getProtobuf().body.keyValue.key.offset, Kinetic.getProtobuf().body.keyValue.key.limit));
                    };
                    if (val === 'put') {
                        assert.deepEqual(_tmp.body.keyValue.dbVersion.buffer.slice(_tmp.body.keyValue.dbVersion.offset, _tmp.body.keyValue.dbVersion.limit),
                            Kinetic.getProtobuf().body.keyValue.dbVersion.buffer.slice(Kinetic.getProtobuf().body.keyValue.dbVersion.offset, Kinetic.getProtobuf().body.keyValue.dbVersion.limit));
                        assert.deepEqual(_tmp.body.keyValue.newVersion.buffer.slice(_tmp.body.keyValue.newVersion.offset, _tmp.body.keyValue.newVersion.limit),
                            Kinetic.getProtobuf().body.keyValue.newVersion.buffer.slice(Kinetic.getProtobuf().body.keyValue.newVersion.offset, Kinetic.getProtobuf().body.keyValue.newVersion.limit));
                    };

                    //Uncomment those lines for more details (protobuf structure);
                    //console.log('=Local=======================================================');
                    //console.log(util.inspect(_tmp, {showHidden: false, depth: null}));
                    //console.log('*Received****************************************************');
                    //console.log(util.inspect(Kinetic.getProtobuf(), {showHidden: false, depth: null}));

                    done();
                });
            });
        });

        it( val_response + ' ___ errorMessage and messageType - should be equal', function (done) {
            var PORT = 6970;
            var ret = undefined;
            var client = new net.Socket();
            var errorMessage = new Buffer('qwerty');

            const message = new Kinetic.build.Command({
                "header": {
                    "messageType": val_response,
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
                if (val === 'put')
                    Kinetic.put(client, 'qwer', 1, '1234', '1235');
                else if (val === 'get')
                    Kinetic.get(client,'qwer', 1, 1);
                else if (val === 'delete')
                    Kinetic.delete(client, 'qwer', 1, 1);
                else if (val === 'flush')
                    Kinetic.flush(client, 1, 1);
                else if (val === 'noop')
                    Kinetic.noOp(client, 1, 1);

                client.on('data', function (data) {
                    ret = data;
                    client.end();
                }).on('end', function () {
                    Kinetic.parse(ret);
                    assert.deepEqual(message.status.detailedMessage.buffer.toString('utf8', message.status.detailedMessage.offset, message.status.detailedMessage.limit),
                        Kinetic.getProtobuf().status.detailedMessage.buffer.toString('utf8', Kinetic.getProtobuf().status.detailedMessage.offset, Kinetic.getProtobuf().status.detailedMessage.limit));
                    assert.deepEqual(message.header.messageType, Kinetic.getProtobuf().header.messageType);
                    done();
                });
            });
        });
    });
};

for(var i = 0; i <= 4; i++){
    _fn(requests[i], request_responses[i]);
}