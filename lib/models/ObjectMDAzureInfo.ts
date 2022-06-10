/**
 * Helper class to ease access to the Azure specific information for
 * Blob and Container objects.
 */
export default class ObjectMDAzureInfo {
    _data: {
        containerPublicAccess: string;
        containerStoredAccessPolicies: any[];
        containerImmutabilityPolicy: any;
        containerLegalHoldStatus: boolean;
        containerDeletionInProgress: boolean;
        blobType: string;
        blobContentMD5: string;
        blobIssuedETag: string;
        blobCopyInfo: any;
        blobSequenceNumber: number;
        blobAccessTierChangeTime: Date;
        blobUncommitted: boolean;
    };

    /**
     * @constructor
     * @param obj - Raw structure for the Azure info on Blob/Container
     * @param obj.containerPublicAccess - Public access authorization
     *   type
     * @param obj.containerStoredAccessPolicies - Access policies
     *   for Shared Access Signature bearer
     * @param obj.containerImmutabilityPolicy - data immutability
     *   policy for this container
     * @param obj.containerLegalHoldStatus - legal hold status for
     *   this container
     * @param obj.containerDeletionInProgress - deletion in progress
     *   indicator for this container
     * @param obj.blobType - defines the type of blob for this object
     * @param obj.blobContentMD5 - whole object MD5 sum set by the
     *   client through the Azure API
     * @param obj.blobIssuedETag - backup of the issued ETag on MD only
     *   operations like Set Blob Properties and Set Blob Metadata
     * @param obj.blobCopyInfo - information pertaining to past and
     *   pending copy operation targeting this object
     * @param obj.blobSequenceNumber - sequence number for a PageBlob
     * @param obj.blobAccessTierChangeTime - date of change of tier
     * @param obj.blobUncommitted - A block has been put for a
     *   nonexistent blob which is about to be created
     */
    constructor(obj: {
        containerPublicAccess: string;
        containerStoredAccessPolicies: any[];
        containerImmutabilityPolicy: any;
        containerLegalHoldStatus: boolean;
        containerDeletionInProgress: boolean;
        blobType: string;
        blobContentMD5: string;
        blobIssuedETag: string;
        blobCopyInfo: any;
        blobSequenceNumber: number;
        blobAccessTierChangeTime: Date;
        blobUncommitted: boolean;
    }) {
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

    setContainerPublicAccess(containerPublicAccess: string) {
        this._data.containerPublicAccess = containerPublicAccess;
        return this;
    }

    getContainerStoredAccessPolicies() {
        return this._data.containerStoredAccessPolicies;
    }

    setContainerStoredAccessPolicies(containerStoredAccessPolicies: any[]) {
        this._data.containerStoredAccessPolicies =
            containerStoredAccessPolicies;
        return this;
    }

    getContainerImmutabilityPolicy() {
        return this._data.containerImmutabilityPolicy;
    }

    setContainerImmutabilityPolicy(containerImmutabilityPolicy: any) {
        this._data.containerImmutabilityPolicy = containerImmutabilityPolicy;
        return this;
    }

    getContainerLegalHoldStatus() {
        return this._data.containerLegalHoldStatus;
    }

    setContainerLegalHoldStatus(containerLegalHoldStatus: boolean) {
        this._data.containerLegalHoldStatus = containerLegalHoldStatus;
        return this;
    }

    getContainerDeletionInProgress() {
        return this._data.containerDeletionInProgress;
    }

    setContainerDeletionInProgress(containerDeletionInProgress: boolean) {
        this._data.containerDeletionInProgress = containerDeletionInProgress;
        return this;
    }

    getBlobType() {
        return this._data.blobType;
    }

    setBlobType(blobType: string) {
        this._data.blobType = blobType;
        return this;
    }

    getBlobContentMD5() {
        return this._data.blobContentMD5;
    }

    setBlobContentMD5(blobContentMD5: string) {
        this._data.blobContentMD5 = blobContentMD5;
        return this;
    }

    getBlobIssuedETag() {
        return this._data.blobIssuedETag;
    }

    setBlobIssuedETag(blobIssuedETag: string) {
        this._data.blobIssuedETag = blobIssuedETag;
        return this;
    }

    getBlobCopyInfo() {
        return this._data.blobCopyInfo;
    }

    setBlobCopyInfo(blobCopyInfo: any) {
        this._data.blobCopyInfo = blobCopyInfo;
        return this;
    }

    getBlobSequenceNumber() {
        return this._data.blobSequenceNumber;
    }

    setBlobSequenceNumber(blobSequenceNumber: number) {
        this._data.blobSequenceNumber = blobSequenceNumber;
        return this;
    }

    getBlobAccessTierChangeTime() {
        return this._data.blobAccessTierChangeTime;
    }

    setBlobAccessTierChangeTime(blobAccessTierChangeTime: Date) {
        this._data.blobAccessTierChangeTime = blobAccessTierChangeTime;
        return this;
    }

    getBlobUncommitted() {
        return this._data.blobUncommitted;
    }

    setBlobUncommitted(blobUncommitted: boolean) {
        this._data.blobUncommitted = blobUncommitted;
        return this;
    }

    getValue() {
        return this._data;
    }
}
