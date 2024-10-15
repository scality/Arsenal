/* eslint-disable @typescript-eslint/no-require-imports */

const assert = require('assert');
const werelogs = require('werelogs');

const AuthLoader = require('../../../../lib/auth/auth').inMemory.AuthLoader;
const ref = require('./sample_authdata.json');

werelogs.configure({
    level: 'info',
    dump: 'error',
});

function getParentField(obj, field) {
    const fields = field.split('.');
    let parent = obj;
    for (let i = 0; i < fields.length - 1; ++i) {
        const cur = fields[i];
        const n = Number(cur, 10);
        if (Number.isNaN(n)) {
            parent = parent[cur];
        } else {
            parent = parent[n];
        }
    }
    return parent;
}

function getFieldName(field) {
    return field.split('.').pop();
}

function shouldFail(obj, done) {
    const authLoader = new AuthLoader(werelogs);
    authLoader.addAccounts(obj);
    const res = authLoader.validate();
    assert.strictEqual(res, false);
    done();
}

function shouldSucceed(obj, done) {
    const authLoader = new AuthLoader(werelogs);
    authLoader.addAccounts(obj);
    const res = authLoader.validate();
    assert.strictEqual(res, true);
    done();
}

const should = {
    _exec: undefined,
    missingField: (obj, field, done) => {
        delete getParentField(obj, field)[getFieldName(field)];
        should._exec(obj, done);
    },
    modifiedField: (obj, field, value, done) => {
        getParentField(obj, field)[getFieldName(field)] = value;
        should._exec(obj, done);
    },
};

describe('AuthLoader class', () => {
    let obj = {};

    beforeEach(done => {
        obj = JSON.parse(JSON.stringify(ref));
        done();
    });

    // Each item will run a test who need to result in a failure
    // format:
    //   - key: field to modify
    //   - value: if undefined, the field is removed
    [
        ['accounts', undefined],
        ['accounts.0.email', undefined],
        ['accounts.0.email', 64],
        ['accounts.0.arn', undefined],
        ['accounts.0.arn', 64],
        ['accounts.0.canonicalID', undefined],
        ['accounts.0.canonicalID', 64],
        ['accounts.0.keys', 'not an Array'],
        ['accounts.0.keys', undefined],
    ].forEach(test => {
        if (test[1] === undefined) {
            // Check a failure when deleting required fields
            it(`should fail when missing field ${test[0]}`, done => {
                should._exec = shouldFail;
                should.missingField(obj, test[0], done);
            });
        } else {
            // Check a failure when the type of field is different than
            // expected
            it(`should fail when modified field ${test[0]} ${test[1]}`,
                done => {
                    should._exec = shouldFail;
                    should.modifiedField(obj, test[0], test[1], done);
                });
        }
    });

    // Each item will run a test who need to result in a success when missing
    // optionals fields
    // format:
    //   - key: field to modify
    [
        'accounts.0.keys',
        'accounts.0.users',
    ].forEach(test => {
        // Check a success when deleting optional fields
        it(`should return success when missing field ${test}`, done => {
            should._exec = shouldSucceed;
            should.missingField(obj, test[0], done);
        });
    });

    it('Should return error on two same canonicalID', done => {
        obj.accounts[0].canonicalID = obj.accounts[1].canonicalID;
        shouldFail(obj, done);
    });

    it('Should return error on two same emails', done => {
        obj.accounts[0].email = obj.accounts[1].email;
        shouldFail(obj, done);
    });

    it('Should return error on two same arn', done => {
        obj.accounts[0].arn = obj.accounts[1].arn;
        shouldFail(obj, done);
    });

    it('Should return error on two same access key', done => {
        obj.accounts[0].keys[0].access = obj.accounts[1].keys[0].access;
        shouldFail(obj, done);
    });
});

module.exports = {
    should,
};
