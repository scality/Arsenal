# KMIP

Key Management Interoperability Protocol

## Preliminary usage example

```javascript
const {
    kmipServerHostName,
    clientKey,
    clientCert,
    serverCert,
    rootCa
} = require('./myconfiguration.js');

const assert = require('assert');
const fs = require('fs');
const tls = require('tls');
const werelogs = require('werelogs');
const KMIP = require('arsenal').network.kmip;

const logger = new werelogs.Logger('kmiptest');
const kmip = new KMIP;
const options = {
    host: kmipServerHostName,
    key: fs.readFileSync(clientKey),
    cert: fs.readFileSync(clientCert),
    ca: [ fs.readFileSync(serverCert),
          fs.readFileSync(rootCa), ],
    checkServerIdentity: console.log,
};

const message = KMIP.Message([
    KMIP.Structure('Request Message', [
        KMIP.Structure('Request Header', [
            KMIP.Structure('Protocol Version', [
                KMIP.Integer('Protocol Version Major', 1),
                KMIP.Integer('Protocol Version Minor', 3),
            ]),
            KMIP.Integer('Maximum Response Size', 3456),
            KMIP.Integer('Batch Count', 1),
        ]),
        KMIP.Structure('Batch Item', [
            KMIP.Enumeration('Operation', 'Query'),
            KMIP.Structure('Request Payload', [
                KMIP.Enumeration('Query Function', 'Query Operations'),
                KMIP.Enumeration('Query Function', 'Query Objects'),
                KMIP.Enumeration('Query Function', 'Query Server Information'),
                KMIP.Enumeration('Query Function', 'Query Extension Map'),
            ]),
        ]),
    ])
]);

const encodedMessage = kmip.encodeMessage(logger, message);

const socket = tls.connect(5696, options, () => {
    socket.write(encodedMessage);
});

socket.on('data', (data) => {
    const decodedMessage = kmip.decodeMessage(logger, data);
    const summary = {
        major: decodedMessage.lookup(
            'Response Message/Response Header/' +
                'Protocol Version/Protocol Version Major')[0],
        minor: decodedMessage.lookup(
            'Response Message/Response Header/' +
                'Protocol Version/Protocol Version Minor')[0],
        supportedOperations: decodedMessage.lookup(
            'Response Message/Batch Item/Response Payload/Operation'),
        supportedObjectTypes: decodedMessage.lookup(
            'Response Message/Batch Item/Response Payload/Object Type'),
        serverInformation: decodedMessage.lookup(
            'Response Message/Batch Item/Response Payload/Server Information'),
    };

    console.log(JSON.stringify(summary));
    //console.log(JSON.stringify(decodedMessage.content));
    //console.log(data.toString('hex'));

    const protocolVersionMajor =
        decodedMessage.lookup('Response Message/Response Header/' +
                              'Protocol Version/Protocol Version Major');
    const protocolVersionMinor =
        decodedMessage.lookup('Response Message/Response Header/' +
                              'Protocol Version/Protocol Version Minor');

    assert(summary.supportedOperations.includes('Encrypt'));
    assert(summary.supportedOperations.includes('Decrypt'));
    assert(summary.supportedOperations.includes('Create'));
    assert(summary.supportedOperations.includes('Destroy'));
    assert(summary.supportedOperations.includes('Query'));
    assert(summary.supportedObjectTypes.includes('Symmetric Key'));
    assert(protocolVersionMajor[0] >= 2 ||
           (protocolVersionMajor[0] === 1 &&
            protocolVersionMinor[0] >= 2));

    socket.end();
});

socket.on('end', () => {
    console.log('server ends connection');
});
```
