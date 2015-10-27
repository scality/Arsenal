import { JSONLib } from '../../index.js';
import winston from 'winston';
import fs from 'fs';


const timer = new (winston.Logger)({
    transports: [new (winston.transports.Console)({ level: 'warn' }),
        new (winston.transports.File)({ filename: 'timerJSON.log' })
    ]
});

let incrementTCP = 0;

const json = new JSONLib;
let time0 = [];
let time1 = [];
let encodedMessage = undefined;
const requestsArr = [
    ['put'],
    ['get'],
    ['delete'],
    ['noop'],
    ['flush'],
    ['getLog']
];

const filesArr = ['1Byte', '1KByte', '1MByte'];

function encodeMessage() {
    const buf = new Buffer(9);

    const buf2 = new Buffer(JSON.stringify(json.getProtobuf()));

    buf.writeInt8(json.getVersion(), 0);
    buf.writeInt32BE(buf2.length, 1);
    buf.writeInt32BE(json.getChunkSize(), 5);

    timer.info('Size of the message : ' + buf2.length + ' ');

    return Buffer.concat(
        [buf, buf2, json.getChunk()]
    );
}

function requestsLauncher(request, file, done) {
    timer.info('==================' + file + '========================');

    json.setChunk(fs.readFileSync(file));

    time0 = [];
    time1 = [];

    if (request === 'noop') {
        time0 = process.hrtime();
        json.noOp(incrementTCP, 0);
        time1 = process.hrtime(time0);
        timer.info('Time for the BUILD of ' + request + ' : ' +
            time1[0] + 'secondes and ' + time1[1] + ' nanosecondes');
    } else if (request === 'put') {
        time0 = process.hrtime();
        json.put('qwer', incrementTCP, null, '1', 0);
        time1 = process.hrtime(time0);
        timer.info('Time for the BUILD of ' + request + ' : ' +
            time1[0] + 'secondes and ' + time1[1] + ' nanosecondes');
    } else if (request === 'get') {
        time0 = process.hrtime();
        json.get('qwer', incrementTCP, 0);
        time1 = process.hrtime(time0);
        timer.info('Time for the BUILD of ' + request + ' : ' +
            time1[0] + 'secondes and ' + time1[1] + ' nanosecondes');
    } else if (request === 'delete') {
        time0 = process.hrtime();
        json.delete('qwer', incrementTCP, 0, '1');
        time1 = process.hrtime(time0);
        timer.info('Time for the BUILD of ' + request + ' : ' +
            time1[0] + 'secondes and ' + time1[1] + ' nanosecondes');
    } else if (request === 'flush') {
        time0 = process.hrtime();
        json.flush(incrementTCP, 0);
        time1 = process.hrtime(time0);
        timer.info('Time for the BUILD of ' + request + ' : ' +
            time1[0] + 'secondes and ' + time1[1] + ' nanosecondes');
    } else if (request === 'getLog') {
        time0 = process.hrtime();
        json.getLog(incrementTCP, [1, 2, 3, 4], 0);
        time1 = process.hrtime(time0);
        timer.info('Time for the BUILD of ' + request + ' : ' +
            time1[0] + 'secondes and ' + time1[1] + ' nanosecondes');
    }
    incrementTCP++;

    time0 = process.hrtime();
    encodedMessage = encodeMessage();
    time1 = process.hrtime(time0);
    timer.info('Time for the ENCODE of ' + request + ' : ' +
        time1[0] + 'secondes and ' + time1[1] + ' nanosecondes');

    time0 = process.hrtime();
    json.parseJSON(encodedMessage);
    time1 = process.hrtime(time0);
    timer.info('Time for the DECODE of ' + request + ' : ' +
        time1[0] + 'secondes and ' + time1[1] +
        ' nanosecondes');
    timer.info('*************************************************************');
    done();
}

function checkIntegrity(requestArr, file) {
    const request = requestArr[0];
    const response = requestArr[1];
    describe(`Assess ${request} and its response ${response}`, () => {
        it(`Chunk and ${request} protobufMessage should be preserved`,
        (done) => { requestsLauncher(request, file, done); });
    });
}

for (let i = 0; i < 3; i++) {
    for (let j = 0; j < requestsArr.length; j++) {
        checkIntegrity(requestsArr[j], filesArr[i]);
    }
}
