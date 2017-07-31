const assert = require('assert');

const Backend = require('../../../../lib/auth/auth').inMemory.backend.s3;

const DummyRequestLogger = require('../../helpers').DummyRequestLogger;
const log = new DummyRequestLogger();

const ref = require('./sample_authdata.json');
const ref2 = require('./sample_authdata_refresh.json');
const obj2 = JSON.parse(JSON.stringify(ref2));

const searchEmail = 'sampleaccount1@sampling.com';
const expectCanId =
    '79a59df900b949e55d96a1e698fbacedfd6e09d98eacf8f8d5218e7cd47ef2be';

const searchEmail2 = 'sampleaccount4@sampling.com';
const expectCanId2 = 'newCanId';

describe('S3 in_memory auth backend', () => {
    it('should find an account', done => {
        const backend = new Backend(JSON.parse(JSON.stringify(ref)));
        backend.getCanonicalIds([searchEmail], log, (err, res) => {
            assert.strictEqual(res.message.body[searchEmail],
                expectCanId);
            done();
        });
    });

    it('should clear old account authdata on refresh', done => {
        const backend = new Backend(JSON.parse(JSON.stringify(ref)));
        backend.refreshAuthData(obj2);
        backend.getCanonicalIds([searchEmail], log, (err, res) => {
            assert.strictEqual(res.message.body[searchEmail], 'NotFound');
            done();
        });
    });

    it('should add new account authdata on refresh', done => {
        const backend = new Backend(JSON.parse(JSON.stringify(ref)));
        backend.refreshAuthData(obj2);
        backend.getCanonicalIds([searchEmail2], log, (err, res) => {
            assert.strictEqual(res.message.body[searchEmail2], expectCanId2);
            done();
        });
    });
});
