# Testing IronMan-Arsenal(Kinetic)

This repo is full of tests to ensure our software is working now, and will keep
working as we add more code.

* [Unit tests](#unit-tests)  to test individual functions and make sure they
 behave correctly with specific sets of arguments.
* [Functional tests](#functional-tests) to test the compatibility between our 
 kinetic library with the kinetic device simulator.

#### I wrote a patch and I want to check tests are passing!

Sure. You can run some tests locally:

```
npm run --silent lint
npm run --silent tests_unit
npm run --silent tests_functional
```

Integration and performance tests really need a CI infrastructure to simulate
multiple machines and work properly.

## Unit tests

Unit tests are located in the `tests/unit` directory.

### Architecture

* PDU generation
* mocha

### Method

* Generate some PDU and write it in a file with a simple script :

```node
import fs from 'fs';

import { Kinetic } from '../index.js';

let rawData = undefined;

const k = new Kinetic.NoOpPDU(123, 9876798);


// if you want a put, you need a chunk : 
// k.setChunk(new Buffer("HI EVERYBODY"));


const pduHeader = new Buffer(9);

pduHeader.writeInt8(Kinetic.getVersion(), 0);

pduHeader.writeInt32BE(k.getProtobufSize(), 1);
pduHeader.writeInt32BE(k.getChunkSize(), 5);

const wstream = fs.createWriteStream('NOOP_request',  'ascii');

if (k.getChunk() !== undefined)
    rawData = Buffer.concat(
         [pduHeader, k._message.toBuffer(), k.getChunk()]);
else
    rawData = Buffer.concat([pduHeader, k._message.toBuffer()]);

wstream.write(rawData);
wstream.end(rawData);
```

* It is possible to check the message :

```node
const pdu = new Kinetic.PDU(rawData);

logger.info(util.inspect(pdu._message,{showHidden: false, depth: null}));
```

* Now let's convert it to hex :

```node
import fs from 'fs';

const requestsArr = [
    'NOOP_request',
];

function writeHex(request) {
    const file = fs.readFileSync(request , 'hex');

    let result = '';

    for (let i = 0; i < file.length; i += 2) {
        result += '/x${file[i]}${file[i + 1]}';
    }
    fs.writeFileSync(request + '_Hexatify', result);
}

requestsArr.forEach(writeHex);
```
  
  - You can also use :
  
  ``` 
  hexdump -C FILE | cut -b10-33,35-58 | sed 's/\s\+$//g;s/ /\\x/g' 
  ```

### Functions tested

* Kinetic
   - Kinetic.PDU constructor()
     - For all request check if the parsing works
       - Check the fields in the PDU
     - The responses PDU are generated from the simulator
   - Kinetic.PDU send()
     - NOOP
     - PUT
     - GET
     - DELETE
     - FLUSH
     - GETLOG
   - Variables type (Buffer for db version and key)
     - PUT
     - GET
     - DELETE
   
## Functional tests

Functional tests are located in the `tests/functional` directory.

### Architecture

* Kinetic Device simulator `tests/dependencies`
  - TCP connection
  - JAVA simulator
  - maven is needed for the build
    - Download : https://maven.apache.org/download.cgi
    - Installation guide : https://maven.apache.org/install.html
* mocha

### Method

Test are run by:
* lauching the Makefile located in the tests/functional directory :
  - make submodule_sync
    - sync and load the dependencies (simulator package) 
  - make build_cache
    - build the simulator package with cache rule for avoiding many downloads 
      and builds
  - make start_simulator
    - start the simulator
  - make stop_simulator
    - stop the simulator
  - make run_test
    - run the tests with mocha (`tests/functional/simulTest.js`)
  - can use make for an automatic load

### Functions tested

* Kinetic
  - Build (kinetic compatibility)
    - Protobuf message
    - Buffer sent format
  - Parse
    - Decode the received buffer
    - Check Version
    - HmacIntegrity 
      (compute an HMAC from the PDU and compare it to the one sent)
  - Send()
    - Check the simulator returns (SUCCESS)
    - The simulator check the HMAC(integrity of PDU sent)
