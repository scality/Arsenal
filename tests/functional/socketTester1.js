import net from 'net';
import { Kinetic } from '../../index';
import winston from 'winston';

const logger = new (winston.Logger)({
    transports: [
        new (winston.transports.Console)({ level: 'warn' }),
    ]
});

const errorMessage = new Buffer('qwerty');
const HOST = '127.0.0.1';
const PORT = 6970;
const kinetic = new Kinetic;

function loadLogs(int) {
    switch (int) {
    case kinetic.logs.UTILIZATIONS:
        return {
            "name": 'Device1',
            "value": 5,
        };
    case kinetic.logs.TEMPERATURES:
        return {
            "name": "device1",
            "current": 40,
            "minimum": 30,
            "maximum": 50,
            "target": 40,
        };
    case kinetic.logs.CAPACITIES:
        return {
            "nominalCapacityInBytes": 2048,
            "portionFull": 1024,
        };
    case kinetic.logs.CONFIGURATION:
        return {
            "vendor": "Scality",
            "model": "Ironman",
        };
    case kinetic.logs.STATISTICS:
        return {
            "messageType": "PUT",
            "count": 12345,
        };
    case kinetic.logs.MESSAGES:
        return new Buffer('Salut les copains');
    case kinetic.logs.LIMITS:
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
        throw new Error('socketTester1/loadLogs/INVALID_LOG_TYPE');
    }
}

net.createServer(function server(sock) {
    logger.info('CONNECTED: ' + sock.remoteAddress + ':' + sock.remotePort);

    sock.on('data', function listener(data) {
        logger.info('DATA ' + sock.remoteAddress + ': ' + data);

        kinetic.parse(data);

        switch (kinetic.getProtobuf().header.messageType) {
        case kinetic.op.GET:
            kinetic.getResponse(1, errorMessage, '1234');
            break;
        case kinetic.op.PUT:
            kinetic.putResponse(1, errorMessage);
            break;
        case kinetic.op.DELETE:
            kinetic.deleteResponse(1, errorMessage);
            break;
        case kinetic.op.SET_CLUSTER_VERSION:
            kinetic.setupResponse(1, errorMessage);
            break;
        case kinetic.op.FLUSH:
            kinetic.flushResponse(1, errorMessage);
            break;
        case kinetic.op.NOOP:
            kinetic.noOpResponse(1, errorMessage);
            break;
        case kinetic.op.GETLOG:
            const logObject = {
                "types": kinetic.getProtobuf().body.getLog.types
            };
            kinetic.getProtobuf().body.getLog.types.forEach((type) => {
                switch (type) {
                case kinetic.logs.UTILIZATIONS:
                    logObject.utilization = loadLogs(type);
                    break;
                case kinetic.logs.TEMPERATURES:
                    logObject.temperatures = loadLogs(type);
                    break;
                case kinetic.logs.CAPACITIES:
                    logObject.capacity = loadLogs(type);
                    break;
                case kinetic.logs.CONFIGURATION:
                    logObject.configuration = loadLogs(type);
                    break;
                case kinetic.logs.STATISTICS:
                    logObject.statistics = loadLogs(type);
                    break;
                case kinetic.logs.MESSAGES:
                    logObject.messages = loadLogs(type);
                    break;
                case kinetic.logs.LIMITS:
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
        logger.info('CLOSED: ' + sock.remoteAddress + ' ' + sock.remotePort);
    });
}).listen(PORT, HOST);
logger.info('Server listening on ' + HOST + ':' + PORT);
