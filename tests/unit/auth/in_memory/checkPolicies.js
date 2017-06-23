const assert = require('assert');
const Backend = require('../../../../lib/auth/auth').inMemory.backend.s3;
const DummyRequestLogger = require('../../helpers').DummyRequestLogger;
const authData = require('./sample_authdata');

const backend = new Backend(JSON.parse(JSON.stringify(authData)));
const counter = 10;
// eslint-disable-next-line arrow-body-style
const specificResource = [...Array(counter).keys()].map(i => {
    return {
        key: `key${i}`,
    };
});
const generalResource = 'bucketName';

const requestContexts = {
    constantParams: {
        generalResource,
    },
    parameterize: {
        specificResource,
    },
};
const service = 's3';
const userArn = 'aws::iam:123456789012:root';
const log = new DummyRequestLogger();
// eslint-disable-next-line arrow-body-style
const expectedResults = specificResource.map(entry => {
    return {
        isAllowed: true,
        arn: `arn:aws:${service}:::${generalResource}/${entry.key}`,
        versionId: undefined,
    };
});

describe('S3AuthBackend.checkPolicies', () => {
    it(' should mock successful results', done => {
        backend.checkPolicies(requestContexts, userArn, log,
            (err, vaultReturnObject) => {
                assert.strictEqual(err, null, `Unexpected err: ${err}`);
                assert.deepStrictEqual(vaultReturnObject, {
                    message: { body: expectedResults },
                });
                return done();
            });
    });
});
