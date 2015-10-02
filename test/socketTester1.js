import net from 'net';
import { Kinetic } from '../index';

const errorMessage = new Buffer('qwerty');
const HOST = '127.0.0.1';
const PORT = 6970;
const kinetic = new Kinetic;

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
        throw new Error('Unhandled message');
    }
}

net.createServer(function server(sock) {
    // uncomment for showing the connection opening
    // console.log('CONNECTED: ' + sock.remoteAddress +':'+ sock.remotePort);

    sock.on('data', function listener(data) {
        // uncomment for showing the received DATA
        // console.log('DATA ' + sock.remoteAddress + ': ' + data)

        kinetic.parse(data);

        switch (kinetic.getProtobuf().header.messageType) {
        case 2:
            kinetic.getResponse(1, errorMessage, '1234');
            break;
        case 4:
            kinetic.putResponse(1, errorMessage);
            break;
        case 6:
            kinetic.deleteResponse(1, errorMessage);
            break;
        case 22:
            kinetic.setupResponse(1, errorMessage);
            break;
        case 32:
            kinetic.flushResponse(1, errorMessage);
            break;
        case 30:
            kinetic.noOpResponse(1, errorMessage);
            break;
        case 24:
            const logObject = {
                "types": kinetic.getProtobuf().body.getLog.types
            };
            kinetic.getProtobuf().body.getLog.types.forEach((type) => {
                switch (type) {
                case 0:
                    logObject.utilization = loadLogs(type);
                    break;
                case 1:
                    logObject.temperatures = loadLogs(type);
                    break;
                case 2:
                    logObject.capacity = loadLogs(type);
                    break;
                case 3:
                    logObject.configuration = loadLogs(type);
                    break;
                case 4:
                    logObject.statistics = loadLogs(type);
                    break;
                case 5:
                    logObject.messages = loadLogs(type);
                    break;
                case 6:
                    logObject.limits = loadLogs(type);
                    break;
                default:
                    throw new Error('Unhandled log type');
                }
            });
            kinetic.getLogResponse(1, errorMessage, logObject);
            break;
        default:
            throw new Error('Unhandled message');
        }
        kinetic.send(sock);
    });

    sock.on('close', function serverClose(data) {
        data;
        // uncomment for showing the connection closing
        // console.log('CLOSED: ' + sock.remoteAddress +' '+ sock.remotePort);
    });
}).listen(PORT, HOST);
// console.log('Server listening on ' + HOST +':'+ PORT);
