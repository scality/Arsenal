import fs from 'fs';

import winston from 'winston';

import { Kinetic } from '../../index';

const logOptions = {
    'filename': 'timerKinetic.log',
    'timestamp': false,
};

const timer = new (winston.Logger)({
    transports: [
        new (winston.transports.Console)({ level: 'warn' }),
        new (winston.transports.File)(logOptions)
    ]
});

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

function encodeMessage(k) {
    const pduHeader = new Buffer(9);

    pduHeader.writeInt8(Kinetic.getVersion(), 0);

    pduHeader.writeInt32BE(k.getProtobufSize(), 1);
    timer.info('Size of the message : ' + k.getProtobufSize() + ' Bytes');
    pduHeader.writeInt32BE(k.getChunkSize(), 5);

    if (k.getChunk() !== undefined)
        return Buffer.concat(
            [pduHeader, k.getProtobuf().toBuffer(), k.getChunk()]);
    return Buffer.concat([pduHeader, k.getProtobuf().toBuffer()]);
}

function requestsLauncher(request, file) {
    let pdu;

    const pduKey = new Buffer('qwer');
    const oldClusterVersion = new Buffer(0);
    const clusterVersion = new Buffer('1');

    timer.info('==================' + file + '========================');
    time0 = [];
    time1 = [];
    if (request === 'noop') {
        time0 = process.hrtime();
        pdu = new Kinetic.NoOpPDU(incrementTCP, 0);
        time1 = process.hrtime(time0);
        timer.info('Time for the BUILD of ' + request + ' : ' +
            (time1[0] * 1e3 + time1[1] * 1e-6) + ' millisecondes');
    } else if (request === 'put') {
        time0 = process.hrtime();
        pdu = new Kinetic.PutPDU(pduKey, incrementTCP, oldClusterVersion,
            clusterVersion, 0);
        time1 = process.hrtime(time0);
        timer.info('Time for the BUILD of ' + request + ' : ' +
            (time1[0] * 1e3 + time1[1] * 1e-6) + ' millisecondes');
        pdu.setChunk(fs.readFileSync(file));
    } else if (request === 'get') {
        time0 = process.hrtime();
        pdu = new Kinetic.GetPDU(pduKey, incrementTCP, 0);
        time1 = process.hrtime(time0);
        timer.info('Time for the BUILD of ' + request + ' : ' +
            (time1[0] * 1e3 + time1[1] * 1e-6) + ' millisecondes');
    } else if (request === 'delete') {
        time0 = process.hrtime();
        pdu = new Kinetic.DeletePDU(pduKey, incrementTCP, 0, clusterVersion);
        time1 = process.hrtime(time0);
        timer.info('Time for the BUILD of ' + request + ' : ' +
            (time1[0] * 1e3 + time1[1] * 1e-6) + ' millisecondes');
    } else if (request === 'flush') {
        time0 = process.hrtime();
        pdu = new Kinetic.FlushPDU(incrementTCP, 0);
        time1 = process.hrtime(time0);
        timer.info('Time for the BUILD of ' + request + ' : ' +
            (time1[0] * 1e3 + time1[1] * 1e-6) + ' millisecondes');
    } else if (request === 'getLog') {
        const types = [0, 1, 2, 4, 5, 6];
        time0 = process.hrtime();
        pdu = new Kinetic.GetLogPDU(incrementTCP, types, 0);
        time1 = process.hrtime(time0);
        timer.info('Time for the BUILD of ' + request + ' : ' +
            (time1[0] * 1e3 + time1[1] * 1e-6) + ' millisecondes');
    }
    incrementTCP++;

    time0 = process.hrtime();
    const k = new Kinetic.PDU();
    time1 = process.hrtime(time0);
    timer.info('Time for the new instance : ' +
        (time1[0] * 1e3 + time1[1] * 1e-6) + ' millisecondes');

    time0 = process.hrtime();
    encodedMessage = encodeMessage(pdu);
    time1 = process.hrtime(time0);
    timer.info('Time for the ENCODE of ' + request + ' : ' +
        (time1[0] * 1e3 + time1[1] * 1e-6) + ' millisecondes');

    time0 = process.hrtime();
    k._parse(encodedMessage);
    time1 = process.hrtime(time0);
    timer.info('Time for the DECODE of ' + request + ' : ' +
        (time1[0] * 1e3 + time1[1] * 1e-6) + ' millisecondes');
    timer.info('*************************************************************');
}

for (let i = 0; i < 3; i++) {
    for (let j = 0; j < requestsArr.length; j++) {
        requestsLauncher(requestsArr[j], filesArr[i]);
    }
}
