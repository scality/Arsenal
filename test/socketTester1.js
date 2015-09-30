"use strict";

const net = require('net');
const Kinetic = require('../index.js').Kinetic;
const errorMessage = new Buffer('qwerty');

const HOST = '127.0.0.1';
const PORT = 6970;

net.createServer(function (sock) {
    // uncomment for showing the connection opening
    // console.log('CONNECTED: ' + sock.remoteAddress +':'+ sock.remotePort);

    sock.on('data', function (data) {
        // uncomment for showing the received DATA
        // console.log('DATA ' + sock.remoteAddress + ': ' + data)

        Kinetic.parse(data);

        if (Kinetic.getProtobuf().header.messageType === 2) {
            Kinetic.getResponse(sock, 1, errorMessage, '1234');
        } else if (Kinetic.getProtobuf().header.messageType === 4) {
            Kinetic.putResponse(sock, 1, errorMessage);
        } else if (Kinetic.getProtobuf().header.messageType === 6) {
            Kinetic.deleteResponse(sock, 1, errorMessage);
        } else if (Kinetic.getProtobuf().header.messageType === 22) {
            Kinetic.setupResponse(sock, 1, errorMessage);
        } else if (Kinetic.getProtobuf().header.messageType === 32) {
            Kinetic.flushResponse(sock, 1, errorMessage);
        } else if (Kinetic.getProtobuf().header.messageType === 30) {
            Kinetic.noOpResponse(sock, 1, errorMessage);
        }else if (Kinetic.getProtobuf().header.messageType === 24) {
            let logObject = {
                "types": Kinetic.getProtobuf().body.getLog.types
            };
            const temperature = {
                "name": "device1",
                "current": 40,
                "minimum": 30,
                "maximum": 50,
                "target": 40
            };
            logObject.temperatures = temperature;
            Kinetic.getLogResponse(sock, 1, errorMessage, logObject);
        }
    });

    sock.on('close', function (data) {
        // uncomment for showing the connection closing
        // console.log('CLOSED: ' + sock.remoteAddress +' '+ sock.remotePort);
    });

}).listen(PORT, HOST);

// console.log('Server listening on ' + HOST +':'+ PORT);
