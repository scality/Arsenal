const assert = require('assert');
const ObjectMDAzureInfo = require('../../../lib/models/ObjectMDAzureInfo');

const testAzureInfoObj = {
    containerPublicAccess: 'container',
    containerStoredAccessPolicies: [],
    containerImmutabilityPolicy: {},
    containerLegalHoldStatus: false,
    containerDeletionInProgress: false,
    blobType: 'BlockBlob',
    blobContentMD5: 'ABCDEF==',
    blobCopyInfo: {},
    blobSequenceNumber: 42,
    blobAccessTierChangeTime: 'abcdef',
    blobUncommitted: false,
};

const azureInfo = new ObjectMDAzureInfo(testAzureInfoObj);

describe('ObjectMDAzureInfo value', () => {
    it('should return the correct value', () => {
        const azureInfoObj = azureInfo.getValue();
        assert.deepStrictEqual(azureInfoObj, testAzureInfoObj);
    });
});

describe('ObjectMDAzureInfo setters/getters', () => {
    it('should control the containerPublicAccess attribute', () => {
        const containerPublicAccess = 'new public access value';
        azureInfo.setContainerPublicAccess(containerPublicAccess);
        assert.deepStrictEqual(azureInfo.getContainerPublicAccess(),
                               containerPublicAccess);
    });
    it('should control the containerStoredAccessPolicies attribute', () => {
        const containerStoredAccessPolicies = [{}];
        azureInfo.setContainerStoredAccessPolicies(
            containerStoredAccessPolicies);
        assert.deepStrictEqual(azureInfo.getContainerStoredAccessPolicies(),
                               containerStoredAccessPolicies);
    });
    it('should control the containerImmutabilityPolicy attribute', () => {
        const containerImmutabilityPolicy = { foo: 1 };
        azureInfo.setContainerImmutabilityPolicy(containerImmutabilityPolicy);
        assert.deepStrictEqual(azureInfo.getContainerImmutabilityPolicy(),
                               containerImmutabilityPolicy);
    });
    it('should control the containerLegalHoldStatus attribute', () => {
        const containerLegalHoldStatus = true;
        azureInfo.setContainerLegalHoldStatus(containerLegalHoldStatus);
        assert.deepStrictEqual(azureInfo.getContainerLegalHoldStatus(),
                               containerLegalHoldStatus);
    });
    it('should control the containerDeletionInProgress attribute', () => {
        const containerDeletionInProgress = true;
        azureInfo.setContainerDeletionInProgress(containerDeletionInProgress);
        assert.deepStrictEqual(azureInfo.getContainerDeletionInProgress(),
                               containerDeletionInProgress);
    });
    it('should control the blobType attribute', () => {
        const blobType = 'PlopBlob';
        azureInfo.setBlobType(blobType);
        assert.deepStrictEqual(azureInfo.getBlobType(),
                               blobType);
    });
    it('should control the blobContentMD5 attribute', () => {
        const blobContentMD5 = 'ABC';
        azureInfo.setBlobContentMD5(blobContentMD5);
        assert.deepStrictEqual(azureInfo.getBlobContentMD5(),
                               blobContentMD5);
    });
    it('should control the blobCopyInfo attribute', () => {
        const blobCopyInfo = { meh: 46 };
        azureInfo.setBlobCopyInfo(blobCopyInfo);
        assert.deepStrictEqual(azureInfo.getBlobCopyInfo(),
                               blobCopyInfo);
    });
    it('should control the blobSequenceNumber attribute', () => {
        const blobSequenceNumber = 8888;
        azureInfo.setBlobSequenceNumber(blobSequenceNumber);
        assert.deepStrictEqual(azureInfo.getBlobSequenceNumber(),
                               blobSequenceNumber);
    });
    it('should control the blobAccessTierChangeTime attribute', () => {
        const blobAccessTierChangeTime = 'MMXIX';
        azureInfo.setBlobAccessTierChangeTime(blobAccessTierChangeTime);
        assert.deepStrictEqual(azureInfo.getBlobAccessTierChangeTime(),
                               blobAccessTierChangeTime);
    });
    it('should control the blobUncommitted attribute', () => {
        const blobUncommitted = true;
        azureInfo.setBlobUncommitted(blobUncommitted);
        assert.deepStrictEqual(azureInfo.getBlobUncommitted(),
                               blobUncommitted);
    });
});
