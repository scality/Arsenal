import { Kinetic } from '../../index';
import winston from 'winston';
import fs from 'fs';

const timer = new (winston.Logger)({
    transports: [new (winston.transports.Console)({ level: 'warn' }),
        new (winston.transports.File)({ filename: 'timerKinetic.log' })
    ]
});

let incrementTCP = 0;

const kinetic = new Kinetic;
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

    buf.writeInt8(kinetic.getVersion(), 0);

    buf.writeInt32BE(kinetic.getProtobufSize(), 1);
    timer.info('Size of the message : ' + kinetic.getProtobufSize() + '++++++');
    buf.writeInt32BE(kinetic.getChunkSize(), 5);

    return Buffer.concat(
        [buf, kinetic.getProtobuf().toBuffer(), kinetic.getChunk()]
    );
}

function requestsLauncher(request, file, done) {
    timer.info('==================' + file + '========================');
    time0 = [];
    time1 = [];
    if (request === 'noop') {
        time0 = process.hrtime();
        kinetic.noOp(incrementTCP, 0);
        time1 = process.hrtime(time0);
        timer.info('Time for the BUILD of ' + request + ' : ' +
            time1[0] + 'secondes and ' + time1[1] + ' nanosecondes');
    } else if (request === 'put') {
        time0 = process.hrtime();
        kinetic.put('qwer', incrementTCP, null, '1', 0);
        time1 = process.hrtime(time0);
        timer.info('Time for the BUILD of ' + request + ' : ' +
            time1[0] + 'secondes and ' + time1[1] + ' nanosecondes');
    } else if (request === 'get') {
        time0 = process.hrtime();
        kinetic.get('qwer', incrementTCP, 0);
        time1 = process.hrtime(time0);
        timer.info('Time for the BUILD of ' + request + ' : ' +
            time1[0] + 'secondes and ' + time1[1] + ' nanosecondes');
    } else if (request === 'delete') {
        time0 = process.hrtime();
        kinetic.delete('qwer', incrementTCP, 0, '1');
        time1 = process.hrtime(time0);
        timer.info('Time for the BUILD of ' + request + ' : ' +
            time1[0] + 'secondes and ' + time1[1] + ' nanosecondes');
    } else if (request === 'flush') {
        time0 = process.hrtime();
        kinetic.flush(incrementTCP, 0);
        time1 = process.hrtime(time0);
        timer.info('Time for the BUILD of ' + request + ' : ' +
            time1[0] + 'secondes and ' + time1[1] + ' nanosecondes');
    } else if (request === 'getLog') {
        time0 = process.hrtime();
        kinetic.getLog(incrementTCP, [1, 2, 3, 4], 0);
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
    kinetic.parse(encodedMessage);
    time1 = process.hrtime(time0);
    timer.info('Time for the DECODE of ' + request + ' : ' +
        time1[0] + 'secondes and ' + time1[1] + ' nanosecondes');
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
    kinetic.setChunk(fs.readFileSync(filesArr[i]));

    for (let j = 0; j < requestsArr.length; j++) {
        checkIntegrity(requestsArr[j], filesArr[i]);
    }
}
