# Testing IronMan-Arsenal(Kinetic)

This repo is full of tests to ensure our software is working now, and will keep
working as we add more code.

* [Functional tests](#functional-tests) to test a single, insolated component
  of our sofware (allocd, datad, kineticd etc.).
* [Functional simulator tests](#Functional-kinetic-device-simulator-tests)
  to test the compatibility between our kinetic library with the kinetic
  device simulator.

#### I wrote a patch and I want to check tests are passing!

Sure. You can run some tests locally:

```
npm run --silent lint
npm run --silent tests_functional
npm run --silent tests_functional_simulator
```

Integration and performance tests really need a CI infrastructure to simulate
multiple machines and work properly.

## Functional tests

Functional tests are located in the `tests/functional` directory.

### Architecture

Test are run by:
* lauching test_launcher.sh: 
  * launch the servers 
    (`tests/functional/socketTester.js` and `tests/functional/socketTester1.js`)
  * launch the tests with mocha (`tests/functional/test.js`)
  * kill servers PID previously caught

### Functions tested

* Kinetic
  - Requests and it response
    - Protobuf Message format
      - put
      - get
      - delete
      - noop
      - flush
      - getLog
    - Error conditions 
      - Corrupted data
      - Version failure
  - Protobuf message parsing
    - Message integrity (HMAC)
  
## Functional kinetic device simulator tests

Functional simulator tests are located in the `tests/functional` directory.

### Architecture

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
    - HMAC compute
    - Buffer sent format
  - Parse
    - Decode the received buffer
    - Check Version
    - HmacIntegrity 
      (compute an HMAC from the protobuf message and compare it to the one sent)
