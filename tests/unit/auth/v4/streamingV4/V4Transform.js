const assert = require('assert');
const { Readable } = require('stream');

const V4Transform =
    require('../../../../../lib/auth/v4/streamingV4/V4Transform');
const Backend = require('../../../../../lib/auth/in_memory/Backend').s3;
const Vault = require('../../../../../lib/auth/Vault');
const { DummyRequestLogger } = require('../../../helpers');

const log = new DummyRequestLogger();
const streamingV4Params = {
    accessKey: 'accessKey1',
    signatureFromRequest: '2b8637632a997e06ee7b6c85d7' +
        '147d2025e8f04d4374f4d7d7320de1618c7509',
    region: 'us-east-1',
    scopeDate: '20170516',
    timestamp: '20170516T204738Z',
    credentialScope: '20170516/us-east-1/s3/aws4_request',
};
const dummyAuthData = {
    accounts:
    [{ name: 'Bart',
        email: 'sampleaccount1@sampling.com',
        arn: 'arn:aws:iam::123456789012:root',
        canonicalID:
            '79a59df900b949e55d96a1e698fbacedf' +
            'd6e09d98eacf8f8d5218e7cd47ef2be',
        shortid: '123456789012',
        keys: [{ access: 'accessKey1', secret: 'verySecretKey1' }] },
    { name: 'Lisa',
        email: 'sampleaccount2@sampling.com',
        arn: 'arn:aws:iam::123456789013:root',
        canonicalID:
            '79a59df900b949e55d96a1e698fbacedf' +
            'd6e09d98eacf8f8d5218e7cd47ef2bf',
        shortid: '123456789013',
        keys: [{ access: 'accessKey2', secret: 'verySecretKey2' }] },
    ],
};
const vault = new Vault(new Backend(dummyAuthData), 'vaultMem');

class AuthMe extends Readable {
    constructor(chunks) {
        super();
        this._parts = chunks;
        this._index = 0;
    }

    _read() {
        this.push(this._parts[this._index]);
        this._index++;
    }
}

describe('V4Transform class', () => {
    it('should authenticate successfully', done => {
        const v4Transform = new V4Transform(streamingV4Params,
        vault, log, err => {
            assert.strictEqual(err, null);
        });
        const filler1 = '8;chunk-signature=51d2511f7c6887907dff20474d8db6' +
        '7d557e5f515a6fa6a8466bb12f8833bcca\r\ncontents\r\n';
        const filler2 = '0;chunk-signature=c0eac24b7ce72141ec077df9753db' +
        '4cc8b7991491806689da0395c8bd0231e48\r\n';
        const chunks = [
            Buffer.from(filler1),
            Buffer.from(filler2),
            null,
        ];
        const authMe = new AuthMe(chunks);
        authMe.pipe(v4Transform);
        v4Transform.on('finish', () => {
            done();
        });
    });

    it('should ignore data sent after final chunk', done => {
        const v4Transform = new V4Transform(streamingV4Params,
        vault, log, err => {
            assert.strictEqual(err, null);
            done();
        });
        const filler1 = '8;chunk-signature=51d2511f7c6887907dff20474d8db6' +
        '7d557e5f515a6fa6a8466bb12f8833bcca\r\ncontents\r\n';
        const filler2 = '0;chunk-signature=c0eac24b7ce72141ec077df9753db' +
        '4cc8b7991491806689da0395c8bd0231e48\r\n';
        const filler3 = '\r\n';
        const chunks = [
            Buffer.from(filler1),
            Buffer.from(filler2),
            Buffer.from(filler3),
            null,
        ];
        const authMe = new AuthMe(chunks);
        authMe.pipe(v4Transform);
        v4Transform.on('finish', () => {
            done();
        });
    });
});
