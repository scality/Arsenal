import { JSONLib } from '../../index';
import winston from 'winston';
import fs from 'fs';

const logOptions = {
    'filename': 'timerJSON.log',
    'timestamp': false,
};

const timer = new (winston.Logger)({
    transports: [
        new (winston.transports.Console)({ level: 'warn' }),
        new (winston.transports.File)(logOptions)
    ]
});

const json = new JSONLib;
let time0 = [];
let time1 = [];
let incrementTCP = 0;
let encodedMessage = undefined;

const requestsArr = [
    'put',
    'get',
    'delete',
    'noop',
    'flush',
    'getLog'
];

const filesArr = ['1Byte', '1KByte', '1MByte'];

function encodeMessage() {
    const buf = new Buffer(9);

    const buf2 = new Buffer(JSON.stringify(json.getProtobuf()));

    buf.writeInt8(json.getVersion(), 0);
    buf.writeInt32BE(buf2.length, 1);
    buf.writeInt32BE(json.getChunkSize(), 5);

    timer.info('Size of the message : ' + buf2.length + ' Bytes');

    return Buffer.concat(
        [buf, buf2, json.getChunk()]
    );
}

function requestsLauncher(request, file) {
    timer.info('==================' + file + '========================');

    json.setChunk(fs.readFileSync(file));

    time0 = [];
    time1 = [];

    if (request === 'noop') {
        time0 = process.hrtime();
        json.noOp(incrementTCP, 0);
        time1 = process.hrtime(time0);
        timer.info('Time for the BUILD of ' + request + ' : ' +
            (time1[0] * 1e3 + time1[1] * 1e-6) + ' millisecondes');
    } else if (request === 'put') {
        time0 = process.hrtime();
        json.put('qwer', incrementTCP, null, '1', 0);
        time1 = process.hrtime(time0);
        timer.info('Time for the BUILD of ' + request + ' : ' +
            (time1[0] * 1e3 + time1[1] * 1e-6) + ' millisecondes');
    } else if (request === 'get') {
        time0 = process.hrtime();
        json.get('qwer', incrementTCP, 0);
        time1 = process.hrtime(time0);
        timer.info('Time for the BUILD of ' + request + ' : ' +
            (time1[0] * 1e3 + time1[1] * 1e-6) + ' millisecondes');
    } else if (request === 'delete') {
        time0 = process.hrtime();
        json.delete('qwer', incrementTCP, 0, '1');
        time1 = process.hrtime(time0);
        timer.info('Time for the BUILD of ' + request + ' : ' +
            (time1[0] * 1e3 + time1[1] * 1e-6) + ' millisecondes');
    } else if (request === 'flush') {
        time0 = process.hrtime();
        json.flush(incrementTCP, 0);
        time1 = process.hrtime(time0);
        timer.info('Time for the BUILD of ' + request + ' : ' +
            (time1[0] * 1e3 + time1[1] * 1e-6) + ' millisecondes');
    } else if (request === 'getLog') {
        time0 = process.hrtime();
        json.getLog(incrementTCP, [1, 2, 3, 4], 0);
        time1 = process.hrtime(time0);
        timer.info('Time for the BUILD of ' + request + ' : ' +
            (time1[0] * 1e3 + time1[1] * 1e-6) + ' millisecondes');
    }
    incrementTCP++;

    time0 = process.hrtime();
    encodedMessage = encodeMessage();
    time1 = process.hrtime(time0);
    timer.info('Time for the ENCODE of ' + request + ' : ' +
        (time1[0] * 1e3 + time1[1] * 1e-6) + ' millisecondes');

    time0 = process.hrtime();
    json.parseJSON(encodedMessage);
    time1 = process.hrtime(time0);
    timer.info('Time for the DECODE of ' + request + ' : ' +
        (time1[0] * 1e3 + time1[1] * 1e-6) + ' millisecondes');
    timer.info('*************************************************************');
}

for (let i = 0; i < filesArr.length; i++) {
    for (let j = 0; j < requestsArr.length; j++) {
        requestsLauncher(requestsArr[j], filesArr[i]);
    }
}
