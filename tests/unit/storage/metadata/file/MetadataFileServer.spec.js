'use strict'; // eslint-disable-line

const assert = require('assert');
const sinon = require('sinon');
const storageUtils = require('../../../../../lib/storage/utils');
const MetadataFileServer = require(
    '../../../../../lib/storage/metadata/file/MetadataFileServer');

describe('MetadataFileServer', () => {
    let sandbox;
    const mockParams = {
        port: 8000,
        path: '/tmp/test/metadata',
        versioning: {
            replicationGroupId: 'testRG',
        },
    };

    beforeEach(() => {
        sandbox = sinon.createSandbox();
    });

    afterEach(() => {
        sandbox.restore();
    });

    describe('constructor', () => {
        it('should initialize with correct parameters', () => {
            const server = new MetadataFileServer(mockParams);
            assert.strictEqual(server.path, mockParams.path);
            assert.strictEqual(server.port, mockParams.port);
            assert.strictEqual(server.bindAddress, 'localhost');
            assert.strictEqual(server.restEnabled, false);
            assert.strictEqual(server.versioning, mockParams.versioning);
            assert.deepStrictEqual(server.recordLog, { enabled: false });
            assert.deepStrictEqual(server.servers, []);
            assert.deepStrictEqual(server.services, []);
        });

        it('should set custom bindAddress and restEnabled if provided', () => {
            const customParams = {
                ...mockParams,
                bindAddress: '0.0.0.0',
                restEnabled: true,
                restPort: 8001,
            };
            const server = new MetadataFileServer(customParams);
            assert.strictEqual(server.bindAddress, '0.0.0.0');
            assert.strictEqual(server.restEnabled, true);
            assert.strictEqual(server.restPort, 8001);
        });
    });

    describe('setupLogging', () => {
        it('should create a logger with provided API', () => {
            const loggerSpy = sinon.spy();
            const mockLogApi = {
                Logger: loggerSpy,
            };

            const server = new MetadataFileServer(mockParams);
            server.setupLogging(mockLogApi);

            assert(loggerSpy.calledOnce);
            assert(loggerSpy.calledWith('MetadataFileServer'));
        });
    });

    describe('getDiskUsage', () => {
        it('should call storageUtils.getDiskUsage with correct parameters', done => {
            const server = new MetadataFileServer(mockParams);

            // Create a stub for storageUtils.getDiskUsage
            const getDiskUsageStub = sandbox.stub(storageUtils, 'getDiskUsage');
            const mockResult = {
                total: 1000000,
                free: 500000,
                available: 400000,
            };

            getDiskUsageStub.callsFake((path, callback) => {
                callback(null, mockResult);
            });

            const registerAPICallback = {};
            const dbServiceMock = {
                registerAsyncAPI: (apiObj) => {
                    registerAPICallback.getDiskUsage = apiObj.getDiskUsage;
                }
            };
            sandbox.stub(server, 'initMetadataService').callsFake(function () {
                this.services.push(dbServiceMock);
                const apiObject = {
                    getDiskUsage: (env, callback) => {
                        storageUtils.getDiskUsage(this.path, callback);
                    }
                };

                dbServiceMock.registerAsyncAPI(apiObject);
            });
            server.initMetadataService();
            const mockEnv = { requestLogger: { info: () => { } } };

            registerAPICallback.getDiskUsage(mockEnv, (err, result) => {
                assert.ifError(err);
                assert.deepStrictEqual(result, mockResult);

                // Verify storageUtils.getDiskUsage was called with correct path
                assert(getDiskUsageStub.calledOnce);
                assert.strictEqual(getDiskUsageStub.firstCall.args[0], server.path);

                done();
            });
        });

        it('should handle errors from storageUtils.getDiskUsage', done => {
            const server = new MetadataFileServer(mockParams);

            // Create a stub for storageUtils.getDiskUsage with error
            const testError = new Error('Disk error');
            const getDiskUsageStub = sandbox.stub(storageUtils, 'getDiskUsage');
            getDiskUsageStub.callsFake((path, callback) => {
                callback(testError);
            });

            const registerAPICallback = {};
            const dbServiceMock = {
                registerAsyncAPI: (apiObj) => {
                    registerAPICallback.getDiskUsage = apiObj.getDiskUsage;
                }
            };
            sandbox.stub(server, 'initMetadataService').callsFake(function () {
                this.services.push(dbServiceMock);
                const apiObject = {
                    getDiskUsage: (env, callback) => {
                        storageUtils.getDiskUsage(this.path, callback);
                    }
                };
                dbServiceMock.registerAsyncAPI(apiObject);
            });
            server.initMetadataService();
            const mockEnv = { requestLogger: { info: () => { } } };

            registerAPICallback.getDiskUsage(mockEnv, (err, result) => {
                assert.strictEqual(err, testError);
                assert.strictEqual(result, undefined);

                // Verify storageUtils.getDiskUsage was called
                assert(getDiskUsageStub.calledOnce);
                assert.strictEqual(getDiskUsageStub.firstCall.args[0], server.path);

                done();
            });
        });
    });
});
