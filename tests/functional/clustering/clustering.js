'use strict'; // eslint-disable-line

const spawn = require('child_process').spawn;

let currentSpawn = undefined;

function runTest(name, done) {
    const test = spawn('node', [`${__dirname}/utils/${name}.js`]);
    currentSpawn = test;
    test.stdout.pipe(process.stdout);
    test.stderr.pipe(process.stderr);
    test.on('close', code => {
        currentSpawn = undefined;
        if (!code) {
            return done();
        }
        return done(new Error(`test '${name}' failed with code ${code}`));
    });
}

describe('Clustering', () => {
    afterEach(done => {
        if (currentSpawn) {
            const safeTimeout = setTimeout(() => {
                currentSpawn.kill('SIGKILL');
                done();
            }, 5000);
            currentSpawn.removeAllListeners();
            currentSpawn.on('close', () => {
                clearTimeout(safeTimeout);
                done();
            });
            return currentSpawn.kill('SIGTERM');
        }
        return done();
    });

    it('Should create and stop workers properly', done => {
        runTest('simple', done);
    });

    it('Should restart workers until clustering stopped', done => {
        runTest('watchdog', done);
    });

    it('Should shutdown cluster if master killed', done => {
        runTest('killed', done);
    });

    it('Should timeout shutdown of workers if not exiting properly', done => {
        runTest('shutdownTimeout', done);
    });
});
