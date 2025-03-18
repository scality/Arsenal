export type DeleteRetentionPolicy = {
    enabled: boolean;
    days: number;
};

export type AzureInfoMetadata = {
    sku: string;
    accessTier: string;
    kind: string;
    systemKeys: string[];
    tenantKeys: string[];
    subscriptionId: string;
    resourceGroup: string;
    deleteRetentionPolicy: DeleteRetentionPolicy;
    managementPolicies: any[];
    httpsOnly: boolean;
    tags: any;
    networkACL: any[];
    cname: string;
    azureFilesAADIntegration: boolean;
    hnsEnabled: boolean;
    logging: any;
    hourMetrics: any;
    minuteMetrics: any;
    serviceVersion: string;
};

/**
 * Helper class to ease access to the Azure specific information for
 * storage accounts mapped to buckets.
 */
export default class BucketAzureInfo {
    private readonly data: AzureInfoMetadata;

    /**
     * @constructor
     * @param obj - Raw structure for the Azure info on storage account
     * @param obj.sku - SKU name of this storage account
     * @param obj.accessTier - Access Tier name of this storage account
     * @param obj.kind - Kind name of this storage account
     * @param obj.systemKeys - pair of shared keys for the system
     * @param obj.tenantKeys - pair of shared keys for the tenant
     * @param obj.subscriptionId - subscription ID the storage account
     *   belongs to
     * @param obj.resourceGroup - Resource group name the storage
     *   account belongs to
     * @param obj.deleteRetentionPolicy - Delete retention policy
     * @param obj.deleteRetentionPolicy.enabled -
     * @param obj.deleteRetentionPolicy.days -
     * @param obj.managementPolicies - Management policies for this
     *   storage account
     * @param obj.httpsOnly - Server the content of this storage
     *   account through HTTPS only
     * @param obj.tags - Set of tags applied on this storage account
     * @param obj.networkACL - Network ACL of this storage account
     * @param obj.cname - CNAME of this storage account
     * @param obj.azureFilesAADIntegration - whether or not Azure
     *   Files AAD Integration is enabled for this storage account
     * @param obj.hnsEnabled - whether or not a hierarchical namespace
     *   is enabled for this storage account
     * @param obj.logging - service properties: logging
     * @param obj.hourMetrics - service properties: hourMetrics
     * @param obj.minuteMetrics - service properties: minuteMetrics
     * @param obj.serviceVersion - service properties: serviceVersion
     */
    constructor(obj: AzureInfoMetadata) {
        this.data = {
            sku: obj.sku,
            accessTier: obj.accessTier,
            kind: obj.kind,
            systemKeys: obj.systemKeys,
            tenantKeys: obj.tenantKeys,
            subscriptionId: obj.subscriptionId,
            resourceGroup: obj.resourceGroup,
            deleteRetentionPolicy: obj.deleteRetentionPolicy,
            managementPolicies: obj.managementPolicies,
            httpsOnly: obj.httpsOnly,
            tags: obj.tags,
            networkACL: obj.networkACL,
            cname: obj.cname,
            azureFilesAADIntegration: obj.azureFilesAADIntegration,
            hnsEnabled: obj.hnsEnabled,
            logging: obj.logging,
            hourMetrics: obj.hourMetrics,
            minuteMetrics: obj.minuteMetrics,
            serviceVersion: obj.serviceVersion,
        };
    }

    getSku() {
        return this.data.sku;
    }

    setSku(sku: string) {
        this.data.sku = sku;
        return this;
    }

    getAccessTier() {
        return this.data.accessTier;
    }

    setAccessTier(accessTier: string) {
        this.data.accessTier = accessTier;
        return this;
    }

    getKind() {
        return this.data.kind;
    }

    setKind(kind: string) {
        this.data.kind = kind;
        return this;
    }

    getSystemKeys() {
        return this.data.systemKeys;
    }

    setSystemKeys(systemKeys: string[]) {
        this.data.systemKeys = systemKeys;
        return this;
    }

    getTenantKeys() {
        return this.data.tenantKeys;
    }

    setTenantKeys(tenantKeys: string[]) {
        this.data.tenantKeys = tenantKeys;
        return this;
    }

    getSubscriptionId() {
        return this.data.subscriptionId;
    }

    setSubscriptionId(subscriptionId: string) {
        this.data.subscriptionId = subscriptionId;
        return this;
    }

    getResourceGroup() {
        return this.data.resourceGroup;
    }

    setResourceGroup(resourceGroup: string) {
        this.data.resourceGroup = resourceGroup;
        return this;
    }

    getDeleteRetentionPolicy() {
        return this.data.deleteRetentionPolicy;
    }

    setDeleteRetentionPolicy(deleteRetentionPolicy: DeleteRetentionPolicy) {
        this.data.deleteRetentionPolicy = deleteRetentionPolicy;
        return this;
    }

    getManagementPolicies() {
        return this.data.managementPolicies;
    }

    setManagementPolicies(managementPolicies: any[]) {
        this.data.managementPolicies = managementPolicies;
        return this;
    }

    getHttpsOnly() {
        return this.data.httpsOnly;
    }

    setHttpsOnly(httpsOnly: boolean) {
        this.data.httpsOnly = httpsOnly;
        return this;
    }

    getTags() {
        return this.data.tags;
    }

    setTags(tags: any) {
        this.data.tags = tags;
        return this;
    }

    getNetworkACL() {
        return this.data.networkACL;
    }

    setNetworkACL(networkACL: any[]) {
        this.data.networkACL = networkACL;
        return this;
    }

    getCname() {
        return this.data.cname;
    }

    setCname(cname: string) {
        this.data.cname = cname;
        return this;
    }

    getAzureFilesAADIntegration() {
        return this.data.azureFilesAADIntegration;
    }

    setAzureFilesAADIntegration(azureFilesAADIntegration: boolean) {
        this.data.azureFilesAADIntegration = azureFilesAADIntegration;
        return this;
    }

    getHnsEnabled() {
        return this.data.hnsEnabled;
    }

    setHnsEnabled(hnsEnabled: boolean) {
        this.data.hnsEnabled = hnsEnabled;
        return this;
    }

    getLogging() {
        return this.data.logging;
    }

    setLogging(logging: any) {
        this.data.logging = logging;
        return this;
    }

    getHourMetrics() {
        return this.data.hourMetrics;
    }

    setHourMetrics(hourMetrics: any) {
        this.data.hourMetrics = hourMetrics;
        return this;
    }

    getMinuteMetrics() {
        return this.data.minuteMetrics;
    }

    setMinuteMetrics(minuteMetrics: any) {
        this.data.minuteMetrics = minuteMetrics;
        return this;
    }

    getServiceVersion() {
        return this.data.serviceVersion;
    }

    setServiceVersion(serviceVersion: any) {
        this.data.serviceVersion = serviceVersion;
        return this;
    }

    getValue() {
        return this.data;
    }
}
