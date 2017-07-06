'use strict';// eslint-disable-line strict

const assert = require('assert');
const crypto = require('crypto');

const stringHash = require('../../index').stringHash;

const ARRAY_LENGTH = 1000;
const STRING_COUNT = 1000000;
const ERROR = 20;


function randomString(length) {
    return crypto.randomBytes(Math.ceil(length / 2))
        .toString('hex')
        .slice(0, length);
}

function check(array) {
    const x = STRING_COUNT / ARRAY_LENGTH;
    const error = x * (ERROR / 100);
    const min = x - error;
    const max = x + error;
    return !array.every(e => e >= min && e <= max);
}

describe('StringHash', () => {
    it('Should compute a string hash', done => {
        const hash1 = stringHash('Hello!');
        const hash2 = stringHash('Hello?');
        assert.notDeepStrictEqual(hash1, hash2);
        done();
    });
    it(`Should distribute uniformly with a maximum of ${ERROR}% of deviation`,
        function f(done) {
            this.timeout(20000);
            const strings = new Array(STRING_COUNT).fill('')
                                .map(() => randomString(10));
            const arr = new Array(ARRAY_LENGTH).fill(0);
            strings.forEach(string => {
                const ind = stringHash(string) % ARRAY_LENGTH;
                ++arr[ind];
            });
            done(check(arr));
        });
});
