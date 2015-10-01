'use strict';

require('babel/register');

const net = require('net');
const KineticConstructor = require('../index.js').Kinetic;
const errorMessage = new Buffer('qwerty');

const HOST = '127.0.0.1';
const PORT = 6970;
const Kinetic = new KineticConstructor;

function loadLogs(int) {
    switch (int) {
    case 0:
        return {
            "name": 'Device1',
            "value": 5,
        };
    case 1:
        return {
            "name": "device1",
            "current": 40,
            "minimum": 30,
            "maximum": 50,
            "target": 40,
        };
    case 2:
        return {
            "nominalCapacityInBytes": 2048,
            "portionFull": 1024,
        };
    case 3:
        return {
            "vendor": "Scality",
            "model": "Ironman",
        };
    case 4:
        return {
            "messageType": "PUT",
            "count": 12345,
        };
    case 5:
        return new Buffer('Salut les copains');
    case 6:
        return {
            maxKeySize: 55,
            maxValueSize: 55,
            maxVersionSize: 55,
            maxTagSize: 55,
            maxConnections: 55,
            maxOutstandingReadRequests: 55,
            maxOutstandingWriteRequests: 55,
            maxMessageSize: 55,
            maxKeyRangeCount: 55,
        };
    default:
    }
}

net.createServer(function (sock) {
    // uncomment for showing the connection opening
    // console.log('CONNECTED: ' + sock.remoteAddress +':'+ sock.remotePort);

    sock.on('data', function (data) {
        // uncomment for showing the received DATA
        // console.log('DATA ' + sock.remoteAddress + ': ' + data)

        Kinetic.parse(data);

        switch (Kinetic.getProtobuf().header.messageType) {
        case 2:
            Kinetic.getResponse(sock, 1, errorMessage, '1234');
            break;
        case 4:
            Kinetic.putResponse(sock, 1, errorMessage);
            break;
        case 6:
            Kinetic.deleteResponse(sock, 1, errorMessage);
            break;
        case 22:
            Kinetic.setupResponse(sock, 1, errorMessage);
            break;
        case 32:
            Kinetic.flushResponse(sock, 1, errorMessage);
            break;
        case 30:
            Kinetic.noOpResponse(sock, 1, errorMessage);
            break;
        case 24:
            const logObject = {
                "types": Kinetic.getProtobuf().body.getLog.types
            };
            for (let i = 0; i < Kinetic.getProtobuf()
                .body.getLog.types.length; i++) {
                switch (Kinetic.getProtobuf().body.getLog.types[i]) {
                case 0:
                    logObject.utilization = loadLogs(
                        Kinetic.getProtobuf().body.getLog.types[i]);
                    break;
                case 1:
                    logObject.temperatures = loadLogs(
                        Kinetic.getProtobuf().body.getLog.types[i]);
                    break;
                case 2:
                    logObject.capacity = loadLogs(
                        Kinetic.getProtobuf().body.getLog.types[i]);
                    break;
                case 3:
                    logObject.configuration = loadLogs(
                        Kinetic.getProtobuf().body.getLog.types[i]);
                    break;
                case 4:
                    logObject.statistics = loadLogs(
                        Kinetic.getProtobuf().body.getLog.types[i]);
                    break;
                case 5:
                    logObject.messages = loadLogs(
                        Kinetic.getProtobuf().body.getLog.types[i]);
                    break;
                case 6:
                    logObject.limits = loadLogs(
                        Kinetic.getProtobuf().body.getLog.types[i]);
                    break;
                default:
                }
            }
            Kinetic.getLogResponse(sock, 1, errorMessage, logObject);
            break;
        default:
        }
    });

    sock.on('close', function (data) {
        // uncomment for showing the connection closing
        // console.log('CLOSED: ' + sock.remoteAddress +' '+ sock.remotePort);
    });
}).listen(PORT, HOST);
// console.log('Server listening on ' + HOST +':'+ PORT);
