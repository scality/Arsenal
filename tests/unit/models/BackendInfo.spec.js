const assert = require('assert');
const BackendInfo = require('../../../lib/models/BackendInfo');
const { DummyRequestLogger } = require('../helpers');
const DummyConfig = require('../../utils/DummyConfig');

const log = new DummyRequestLogger();
const data = 'mem';

const memLocation = 'scality-internal-mem';
const fileLocation = 'scality-internal-file';
const legacyLocation = 'legacy';

const dummyConfig = new DummyConfig();
const dummyBackendInfo = new BackendInfo(dummyConfig, memLocation,
    fileLocation, '127.0.0.1');

const dummyLegacyConfig = new DummyConfig(true);

describe('BackendInfo class', () => {
    describe('controllingBackendParam', () => {
        beforeEach(() => {
            dummyConfig.backends.data = data;
            dummyLegacyConfig.backends.data = data;
        });
        it('should return object with applicable error if ' +
        'objectLocationConstraint is invalid', () => {
            const res = BackendInfo.controllingBackendParam(dummyConfig,
                'notValid', fileLocation, '127.0.0.1', log);
            assert.equal(res.isValid, false);
            assert((res.description).indexOf('Object Location Error')
            > -1);
        });
        it('should return object with applicable error if ' +
        'bucketLocationConstraint is invalid and no ' +
        'objectLocationConstraint was provided', () => {
            const res = BackendInfo.controllingBackendParam(dummyConfig,
                undefined, 'notValid', '127.0.0.1', log);
            assert.equal(res.isValid, false);
            assert((res.description).indexOf('Bucket ' +
            'Location Error') > -1);
        });
        it('If requestEndpoint is invalid, no objectLocationConstraint or ' +
        'bucketLocationConstraint was provided, data backend is set to ' +
        '"scality" should return "object with applicable error"', () => {
            dummyConfig.backends.data = 'scality';
            const res = BackendInfo.controllingBackendParam(dummyConfig,
                undefined, undefined, 'notValid', log);
            assert.equal(res.isValid, false);
            assert((res.description).indexOf('Endpoint Location Error') > -1);
        });

        it('If requestEndpoint is invalid, no objectLocationConstraint or ' +
        'bucketLocationConstraint was provided, data backend is set to ' +
        '"scality" should return isValid if legacy location constraint', () => {
            dummyLegacyConfig.backends.data = 'scality';
            const res = BackendInfo.controllingBackendParam(dummyLegacyConfig,
                undefined, undefined, 'notValid', log);
            assert.equal(res.isValid, true);
        });

        it('If requestEndpoint is invalid, no objectLocationConstraint or ' +
        'bucketLocationConstraint was provided and data backend is set to ' +
        '"multiple" and legacy location constraint should return ' +
        '"object with applicable error"', () => {
            dummyConfig.backends.data = 'multiple';
            const res = BackendInfo.controllingBackendParam(dummyConfig,
                undefined, undefined, 'notValid', log);
            assert.equal(res.isValid, false);
            assert((res.description).indexOf('Endpoint Location Error') > -1);
        });

        it('If requestEndpoint is invalid, no objectLocationConstraint or ' +
        'bucketLocationConstraint was provided and data backend is set to ' +
        '"multiple" and legacy location constraint should return isValid if ' +
        'legacy location constraint', () => {
            dummyLegacyConfig.backends.data = 'multiple';
            const res = BackendInfo.controllingBackendParam(dummyLegacyConfig,
                undefined, undefined, 'notValid', log);
            assert.equal(res.isValid, true);
        });

        it('should return isValid if requestEndpoint is invalid and ' +
        'data backend is set to "file"', () => {
            dummyConfig.backends.data = 'file';
            const res = BackendInfo.controllingBackendParam(dummyConfig,
                memLocation, fileLocation, 'notValid', log);
            assert.equal(res.isValid, true);
        });

        it('should return isValid if requestEndpoint is invalid and ' +
        'data backend is set to "mem"', () => {
            dummyConfig.backends.data = 'mem';
            const res = BackendInfo.controllingBackendParam(dummyConfig,
                memLocation, fileLocation, 'notValid', log);
            assert.equal(res.isValid, true);
        });

        it('should return isValid if requestEndpoint is invalid but ' +
        'valid objectLocationConstraint was provided', () => {
            dummyConfig.backends.data = 'multiple';
            const res = BackendInfo.controllingBackendParam(dummyConfig,
                memLocation, undefined, 'notValid', log);
            assert.equal(res.isValid, true);
        });

        it('should return isValid if requestEndpoint is invalid but ' +
        'valid bucketLocationConstraint was provided', () => {
            dummyConfig.backends.data = 'multiple';
            const res = BackendInfo.controllingBackendParam(dummyConfig,
                undefined, memLocation, 'notValid', log);
            assert.equal(res.isValid, true);
        });

        it('should return isValid if all backend ' +
        'parameters are valid', () => {
            const res = BackendInfo.controllingBackendParam(dummyConfig,
                memLocation, fileLocation, '127.0.0.1', log);
            assert.equal(res.isValid, true);
        });
    });

    describe('getControllingLocationConstraint', () => {
        it('should return object location constraint', () => {
            const controllingLC =
                dummyBackendInfo.getControllingLocationConstraint();
            assert.strictEqual(controllingLC, memLocation);
        });
    });

    describe('legacy for getControllingLocationConstraint', () => {
        const dummyBackendInfoLegacy = new BackendInfo(dummyLegacyConfig, null,
            null, '127.0.0.1', legacyLocation);
        it('should return legacy location constraint', () => {
            const controllingLC =
                dummyBackendInfoLegacy.getControllingLocationConstraint();
            assert.strictEqual(controllingLC, legacyLocation);
        });
    });

    describe('getters', () => {
        it('should return object location constraint', () => {
            const objectLC =
                dummyBackendInfo.getObjectLocationConstraint();
            assert.strictEqual(objectLC, memLocation);
        });
        it('should return bucket location constraint', () => {
            const bucketLC =
                dummyBackendInfo.getBucketLocationConstraint();
            assert.strictEqual(bucketLC, fileLocation);
        });
        it('should return request endpoint', () => {
            const reqEndpoint =
                dummyBackendInfo.getRequestEndpoint();
            assert.strictEqual(reqEndpoint, '127.0.0.1');
        });
    });
});
