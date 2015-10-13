import net from 'net';
const HOST = '127.0.0.1';
const PORT = 6969;
import winston from 'winston';

const logger = new (winston.Logger)({
    transports: [
        new (winston.transports.Console)({ level: 'warm' }),
    ]
});

net.createServer(function handle(sock) {
    logger.info('CONNECTED: ' + sock.remoteAddress + ':' + sock.remotePort);

    sock.on('data', function receive(data) {
        logger.info('DATA ' + sock.remoteAddress + ': ' + data);

        sock.write(data);
    });

    sock.on('close', function closing(data) {
        logger.info('CLOSED: ' + sock.remoteAddress + ' ' + sock.remotePort);
        data;
    });
}).listen(PORT, HOST);

logger.info('Server listening on ' + HOST + ':' + PORT);
