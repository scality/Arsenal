export type DeleteRetentionPolicy = {
    enabled: boolean;
    days: number;
};

/**
 * Helper class to ease access to the Azure specific information for
 * storage accounts mapped to buckets.
 */
export default class BucketAzureInfo {
    _data: {
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
    }
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
    constructor(obj: {
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
    }) {
        this._data = {
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
        return this._data.sku;
    }

    setSku(sku: string) {
        this._data.sku = sku;
        return this;
    }

    getAccessTier() {
        return this._data.accessTier;
    }

    setAccessTier(accessTier: string) {
        this._data.accessTier = accessTier;
        return this;
    }

    getKind() {
        return this._data.kind;
    }

    setKind(kind: string) {
        this._data.kind = kind;
        return this;
    }

    getSystemKeys() {
        return this._data.systemKeys;
    }

    setSystemKeys(systemKeys: string[]) {
        this._data.systemKeys = systemKeys;
        return this;
    }

    getTenantKeys() {
        return this._data.tenantKeys;
    }

    setTenantKeys(tenantKeys: string[]) {
        this._data.tenantKeys = tenantKeys;
        return this;
    }

    getSubscriptionId() {
        return this._data.subscriptionId;
    }

    setSubscriptionId(subscriptionId: string) {
        this._data.subscriptionId = subscriptionId;
        return this;
    }

    getResourceGroup() {
        return this._data.resourceGroup;
    }

    setResourceGroup(resourceGroup: string) {
        this._data.resourceGroup = resourceGroup;
        return this;
    }

    getDeleteRetentionPolicy() {
        return this._data.deleteRetentionPolicy;
    }

    setDeleteRetentionPolicy(deleteRetentionPolicy: DeleteRetentionPolicy) {
        this._data.deleteRetentionPolicy = deleteRetentionPolicy;
        return this;
    }

    getManagementPolicies() {
        return this._data.managementPolicies;
    }

    setManagementPolicies(managementPolicies: any[]) {
        this._data.managementPolicies = managementPolicies;
        return this;
    }

    getHttpsOnly() {
        return this._data.httpsOnly;
    }

    setHttpsOnly(httpsOnly: boolean) {
        this._data.httpsOnly = httpsOnly;
        return this;
    }

    getTags() {
        return this._data.tags;
    }

    setTags(tags: any) {
        this._data.tags = tags;
        return this;
    }

    getNetworkACL() {
        return this._data.networkACL;
    }

    setNetworkACL(networkACL: any[]) {
        this._data.networkACL = networkACL;
        return this;
    }

    getCname() {
        return this._data.cname;
    }

    setCname(cname: string) {
        this._data.cname = cname;
        return this;
    }

    getAzureFilesAADIntegration() {
        return this._data.azureFilesAADIntegration;
    }

    setAzureFilesAADIntegration(azureFilesAADIntegration: boolean) {
        this._data.azureFilesAADIntegration = azureFilesAADIntegration;
        return this;
    }

    getHnsEnabled() {
        return this._data.hnsEnabled;
    }

    setHnsEnabled(hnsEnabled: boolean) {
        this._data.hnsEnabled = hnsEnabled;
        return this;
    }

    getLogging() {
        return this._data.logging;
    }

    setLogging(logging: any) {
        this._data.logging = logging;
        return this;
    }

    getHourMetrics() {
        return this._data.hourMetrics;
    }

    setHourMetrics(hourMetrics: any) {
        this._data.hourMetrics = hourMetrics;
        return this;
    }

    getMinuteMetrics() {
        return this._data.minuteMetrics;
    }

    setMinuteMetrics(minuteMetrics: any) {
        this._data.minuteMetrics = minuteMetrics;
        return this;
    }

    getServiceVersion() {
        return this._data.serviceVersion;
    }

    setServiceVersion(serviceVersion: any) {
        this._data.serviceVersion = serviceVersion;
        return this;
    }

    getValue() {
        return this._data;
    }
}
