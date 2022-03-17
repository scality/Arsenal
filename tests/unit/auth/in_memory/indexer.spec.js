const assert = require('assert');

const Indexer = require('../../../../lib/auth/in_memory/Indexer');
const ref = require('./sample_authdata.json');
const { should } = require('./AuthLoader.spec');

describe('S3 AuthData Indexer', () => {
    let obj = {};
    let index = undefined;

    beforeEach(done => {
        obj = JSON.parse(JSON.stringify(ref));
        index = new Indexer(obj);
        done();
    });

    it('Should return account from canonicalID', done => {
        const res = index.getEntityByCanId(obj.accounts[0].canonicalID);
        assert.strictEqual(typeof res, 'object');
        assert.strictEqual(res.arn, obj.accounts[0].arn);
        done();
    });

    it('Should return account from email', done => {
        const res = index.getEntityByEmail(obj.accounts[1].email);
        assert.strictEqual(typeof res, 'object');
        assert.strictEqual(res.canonicalID, obj.accounts[1].canonicalID);
        done();
    });

    it('Should return account from key', done => {
        const res = index.getEntityByKey(obj.accounts[0].keys[0].access);
        assert.strictEqual(typeof res, 'object');
        assert.strictEqual(res.arn, obj.accounts[0].arn);
        done();
    });

    it('should index account without keys', done => {
        should._exec = () => {
            index = new Indexer(obj);
            const res = index.getEntityByEmail(obj.accounts[0].email);
            assert.strictEqual(typeof res, 'object');
            assert.strictEqual(res.arn, obj.accounts[0].arn);
            done();
        };
        should.missingField(obj, 'accounts.0.keys');
    });

    it('should index account without users', done => {
        should._exec = () => {
            index = new Indexer(obj);
            const res = index.getEntityByEmail(obj.accounts[0].email);
            assert.strictEqual(typeof res, 'object');
            assert.strictEqual(res.arn, obj.accounts[0].arn);
            done();
        };
        should.missingField(obj, 'accounts.0.users');
    });
});
