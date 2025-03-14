const DummyRequestLogger = require('../helpers').DummyRequestLogger;
const fakeTimers = require('@sinonjs/fake-timers');
const { server: authServer, setHandler, doAuth } = require('../../../lib/auth/auth');
const AuthInfo = require('../../../lib/auth/AuthInfo').default;
const Vault = require('../../../lib/auth/Vault').default;
const assert = require('assert');
const sinon = require('sinon');

describe('auth.doAuth', () => {
    let request;
    let log;
    let cb;
    let vault;
    let mockClient;
    let sandbox;

    const method = 'PUT';
    const path = '/mybucket';
    const xAMZcontentSha256 = '771df8abbecb2265e9724e5dc4510dcc160' +
        '60c0513ae669baf35b255d465b63f';
    const host = 'localhost:8000';
    const xAmzDate = '2027-02-08T20:14:05Z';
    const authorization = 'AWS4-HMAC-SHA256 Credential=accessKey1/20270208' +
        '/us-east-1/s3/aws4_request, SignedHeaders=host;x-amz-content-sha256;' +
        'x-amz-date, Signature=abed924c06abf8772c670064d22eacd6ccb85c06befa15f' +
        '4a789b0bae19307bc';
    const headers = {
        host,
        authorization,
        'x-amz-date': '20270208T201405Z',
        'x-amz-content-sha256': xAMZcontentSha256,
    };

    beforeEach(() => {
        sandbox = sinon.createSandbox();
        log = new DummyRequestLogger();
        cb = sandbox.spy();
        mockClient = {
            verifySignatureV4: sandbox.stub(),
            verifySignatureV2: sandbox.stub(),
        };
        vault = new Vault(mockClient, 'mockImpl');
        setHandler(vault);
    });

    afterEach(() => {
        sandbox.restore();
    });

    it('should return AccessDenied error for invalid authorization header', () => {
        const request = {
            headers: {
                authorization: 'Invalid Auth Header'
            },
            query: {}
        };
        const log = { trace: sinon.spy() };
        
        const cb = sinon.spy();
        authServer.doAuth(request, log, cb, 'service', null);
        
        sinon.assert.calledOnce(cb);
        sinon.assert.calledWith(cb, sinon.match.instanceOf(Error));
        const error = cb.firstCall.args[0];
        assert.strictEqual(error.code, 403);
    });

    it('should return public user info for requests without auth info', () => {
        const request = {
            headers: {},
            query: {},
            _headers: {},
            setHeader: function(name, value) {
                this._headers[name] = value;
                this.headers[name] = value;
            }
        };
        authServer.doAuth(request, log, cb, 's3', null);
        
        sinon.assert.calledWith(cb, null, sinon.match.instanceOf(AuthInfo));
    });
    

    it('should call authenticateV4Request for version 4 auth', () => {
        const request = {
            method,
            path,
            headers,
            query: {},
        };
        // Mock the v4 authentication method
        const clock = fakeTimers.install({ now: new Date(xAmzDate).getTime() });

        
        const authenticateV4RequestStub = sandbox.stub(vault, 'authenticateV4Request');
        authenticateV4RequestStub.callsFake((params, requestContexts, options, callback) => {
            callback(null, new AuthInfo({ canonicalID: 'testCanonicalID' }));
        });

        const requestContext = {
            setAuthType: sandbox.stub(),
            setSignatureVersion: sandbox.stub(),
            setSecurityToken: sandbox.stub(),
            setSignatureAge: sandbox.stub()
        };

        authServer.doAuth(request, log, cb, 's3', [requestContext]);

        sinon.assert.calledOnce(authenticateV4RequestStub);
        sinon.assert.calledWith(cb, null, sinon.match.instanceOf(AuthInfo));
        sinon.assert.calledWith(requestContext.setAuthType, 'REST-HEADER');
        sinon.assert.calledWith(requestContext.setSignatureVersion, 'AWS4-HMAC-SHA256');
        sinon.assert.calledWith(requestContext.setSignatureAge, 0);
        clock.uninstall();
    });

    it('should handle options parameter in authenticateV4Request', () => {
        const request = {
            method,
            path,
            headers,
            query: {},
        };
        // Mock the v4 authentication method
        const clock = fakeTimers.install({ now: new Date(xAmzDate).getTime() });
        mockOptions = { get: true };
                
        const authenticateV4RequestStub = sandbox.stub(vault, 'authenticateV4Request');
        authenticateV4RequestStub.callsFake((params, requestContexts, options, callback) => {
            sinon.assert.match(options, mockOptions);
            callback(null, new AuthInfo({ canonicalID: 'testCanonicalID' }));
        });

        authServer.doAuth(request, log, cb, 's3', [{ 
            setAuthType: sandbox.stub(),
            setSignatureVersion: sandbox.stub(),
            setSecurityToken: sandbox.stub(),
            setSignatureAge: sandbox.stub()
        }], mockOptions);

        sinon.assert.calledOnce(authenticateV4RequestStub);
        sinon.assert.calledWith(cb, null, sinon.match.instanceOf(AuthInfo));
        clock.uninstall();
    });
});
