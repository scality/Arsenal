const assert = require('assert');
const ObjectMDAmzRestore = require('../../../lib/models/ObjectMDAmzRestore');

const amzRestore = new ObjectMDAmzRestore(false, new Date());

describe('ObjectMDAmzRestore value', () => {
    it('should return the correct value', () => {
        const amzRestoreObj = amzRestore.getValue();
        assert.deepStrictEqual(amzRestoreObj, amzRestore);
    });
});

describe('ObjectMDAmzRestore setters/getters', () => {
    it('should control the ongoing-request attribute', () => {
        const ongoing = true;
        amzRestore.setOngoingRequest(ongoing);
        assert.deepStrictEqual(amzRestore.getOngoingRequest(),
            ongoing);
    });
    it('should control the expiry-date attribute', () => {
        const expiry = new Date(100);
        amzRestore.setExpiryDate(expiry);
        assert.deepStrictEqual(amzRestore.getExpiryDate(),
            expiry);
    });
});
