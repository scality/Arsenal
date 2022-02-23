/**
 * Helper class to ease access to the Azure specific information for
 * Blob and Container objects.
 */
export default class ObjectMDAzureInfo {
    /**
     * @constructor
     * @param {object} obj - Raw structure for the Azure info on Blob/Container
     * @param {string} obj.containerPublicAccess - Public access authorization
     *   type
     * @param {object[]} obj.containerStoredAccessPolicies - Access policies
     *   for Shared Access Signature bearer
     * @param {object} obj.containerImmutabilityPolicy - data immutability
     *   policy for this container
     * @param {boolean} obj.containerLegalHoldStatus - legal hold status for
     *   this container
     * @param {boolean} obj.containerDeletionInProgress - deletion in progress
     *   indicator for this container
     * @param {string} obj.blobType - defines the type of blob for this object
     * @param {string} obj.blobContentMD5 - whole object MD5 sum set by the
     *   client through the Azure API
     * @param {string} obj.blobIssuedETag - backup of the issued ETag on MD only
     *   operations like Set Blob Properties and Set Blob Metadata
     * @param {object} obj.blobCopyInfo - information pertaining to past and
     *   pending copy operation targeting this object
     * @param {number} obj.blobSequenceNumber - sequence number for a PageBlob
     * @param {Date} obj.blobAccessTierChangeTime - date of change of tier
     * @param {boolean} obj.blobUncommitted - A block has been put for a
     *   nonexistent blob which is about to be created
     */
    constructor(obj) {
        this._data = {
            containerPublicAccess: obj.containerPublicAccess,
            containerStoredAccessPolicies: obj.containerStoredAccessPolicies,
            containerImmutabilityPolicy: obj.containerImmutabilityPolicy,
            containerLegalHoldStatus: obj.containerLegalHoldStatus,
            containerDeletionInProgress: obj.containerDeletionInProgress,
            blobType: obj.blobType,
            blobContentMD5: obj.blobContentMD5,
            blobIssuedETag: obj.blobIssuedETag,
            blobCopyInfo: obj.blobCopyInfo,
            blobSequenceNumber: obj.blobSequenceNumber,
            blobAccessTierChangeTime: obj.blobAccessTierChangeTime,
            blobUncommitted: obj.blobUncommitted,
        };
    }

    getContainerPublicAccess() {
        return this._data.containerPublicAccess;
    }

    setContainerPublicAccess(containerPublicAccess) {
        this._data.containerPublicAccess = containerPublicAccess;
        return this;
    }

    getContainerStoredAccessPolicies() {
        return this._data.containerStoredAccessPolicies;
    }

    setContainerStoredAccessPolicies(containerStoredAccessPolicies) {
        this._data.containerStoredAccessPolicies =
            containerStoredAccessPolicies;
        return this;
    }

    getContainerImmutabilityPolicy() {
        return this._data.containerImmutabilityPolicy;
    }

    setContainerImmutabilityPolicy(containerImmutabilityPolicy) {
        this._data.containerImmutabilityPolicy = containerImmutabilityPolicy;
        return this;
    }

    getContainerLegalHoldStatus() {
        return this._data.containerLegalHoldStatus;
    }

    setContainerLegalHoldStatus(containerLegalHoldStatus) {
        this._data.containerLegalHoldStatus = containerLegalHoldStatus;
        return this;
    }

    getContainerDeletionInProgress() {
        return this._data.containerDeletionInProgress;
    }

    setContainerDeletionInProgress(containerDeletionInProgress) {
        this._data.containerDeletionInProgress = containerDeletionInProgress;
        return this;
    }

    getBlobType() {
        return this._data.blobType;
    }

    setBlobType(blobType) {
        this._data.blobType = blobType;
        return this;
    }

    getBlobContentMD5() {
        return this._data.blobContentMD5;
    }

    setBlobContentMD5(blobContentMD5) {
        this._data.blobContentMD5 = blobContentMD5;
        return this;
    }

    getBlobIssuedETag() {
        return this._data.blobIssuedETag;
    }

    setBlobIssuedETag(blobIssuedETag) {
        this._data.blobIssuedETag = blobIssuedETag;
        return this;
    }

    getBlobCopyInfo() {
        return this._data.blobCopyInfo;
    }

    setBlobCopyInfo(blobCopyInfo) {
        this._data.blobCopyInfo = blobCopyInfo;
        return this;
    }

    getBlobSequenceNumber() {
        return this._data.blobSequenceNumber;
    }

    setBlobSequenceNumber(blobSequenceNumber) {
        this._data.blobSequenceNumber = blobSequenceNumber;
        return this;
    }

    getBlobAccessTierChangeTime() {
        return this._data.blobAccessTierChangeTime;
    }

    setBlobAccessTierChangeTime(blobAccessTierChangeTime) {
        this._data.blobAccessTierChangeTime = blobAccessTierChangeTime;
        return this;
    }

    getBlobUncommitted() {
        return this._data.blobUncommitted;
    }

    setBlobUncommitted(blobUncommitted) {
        this._data.blobUncommitted = blobUncommitted;
        return this;
    }

    getValue() {
        return this._data;
    }
}
