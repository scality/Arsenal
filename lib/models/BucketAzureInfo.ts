/**
 * Helper class to ease access to the Azure specific information for
 * storage accounts mapped to buckets.
 */
export default class BucketAzureInfo {
    _data
    
    /**
     * @constructor
     * @param {object} obj - Raw structure for the Azure info on storage account
     * @param {string} obj.sku - SKU name of this storage account
     * @param {string} obj.accessTier - Access Tier name of this storage account
     * @param {string} obj.kind - Kind name of this storage account
     * @param {string[]} obj.systemKeys - pair of shared keys for the system
     * @param {string[]} obj.tenantKeys - pair of shared keys for the tenant
     * @param {string} obj.subscriptionId - subscription ID the storage account
     *   belongs to
     * @param {string} obj.resourceGroup - Resource group name the storage
     *   account belongs to
     * @param {object} obj.deleteRetentionPolicy - Delete retention policy
     * @param {boolean} obj.deleteRetentionPolicy.enabled -
     * @param {number} obj.deleteRetentionPolicy.days -
     * @param {object[]} obj.managementPolicies - Management policies for this
     *   storage account
     * @param {boolean} obj.httpsOnly - Server the content of this storage
     *   account through HTTPS only
     * @param {object} obj.tags - Set of tags applied on this storage account
     * @param {object[]} obj.networkACL - Network ACL of this storage account
     * @param {string} obj.cname - CNAME of this storage account
     * @param {boolean} obj.azureFilesAADIntegration - whether or not Azure
     *   Files AAD Integration is enabled for this storage account
     * @param {boolean} obj.hnsEnabled - whether or not a hierarchical namespace
     *   is enabled for this storage account
     * @param {object} obj.logging - service properties: logging
     * @param {object} obj.hourMetrics - service properties: hourMetrics
     * @param {object} obj.minuteMetrics - service properties: minuteMetrics
     * @param {string} obj.serviceVersion - service properties: serviceVersion
     */
    constructor(obj) {
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

    setSku(sku) {
        this._data.sku = sku;
        return this;
    }

    getAccessTier() {
        return this._data.accessTier;
    }

    setAccessTier(accessTier) {
        this._data.accessTier = accessTier;
        return this;
    }

    getKind() {
        return this._data.kind;
    }

    setKind(kind) {
        this._data.kind = kind;
        return this;
    }

    getSystemKeys() {
        return this._data.systemKeys;
    }

    setSystemKeys(systemKeys) {
        this._data.systemKeys = systemKeys;
        return this;
    }

    getTenantKeys() {
        return this._data.tenantKeys;
    }

    setTenantKeys(tenantKeys) {
        this._data.tenantKeys = tenantKeys;
        return this;
    }

    getSubscriptionId() {
        return this._data.subscriptionId;
    }

    setSubscriptionId(subscriptionId) {
        this._data.subscriptionId = subscriptionId;
        return this;
    }

    getResourceGroup() {
        return this._data.resourceGroup;
    }

    setResourceGroup(resourceGroup) {
        this._data.resourceGroup = resourceGroup;
        return this;
    }

    getDeleteRetentionPolicy() {
        return this._data.deleteRetentionPolicy;
    }

    setDeleteRetentionPolicy(deleteRetentionPolicy) {
        this._data.deleteRetentionPolicy = deleteRetentionPolicy;
        return this;
    }

    getManagementPolicies() {
        return this._data.managementPolicies;
    }

    setManagementPolicies(managementPolicies) {
        this._data.managementPolicies = managementPolicies;
        return this;
    }

    getHttpsOnly() {
        return this._data.httpsOnly;
    }

    setHttpsOnly(httpsOnly) {
        this._data.httpsOnly = httpsOnly;
        return this;
    }

    getTags() {
        return this._data.tags;
    }

    setTags(tags) {
        this._data.tags = tags;
        return this;
    }

    getNetworkACL() {
        return this._data.networkACL;
    }

    setNetworkACL(networkACL) {
        this._data.networkACL = networkACL;
        return this;
    }

    getCname() {
        return this._data.cname;
    }

    setCname(cname) {
        this._data.cname = cname;
        return this;
    }

    getAzureFilesAADIntegration() {
        return this._data.azureFilesAADIntegration;
    }

    setAzureFilesAADIntegration(azureFilesAADIntegration) {
        this._data.azureFilesAADIntegration = azureFilesAADIntegration;
        return this;
    }

    getHnsEnabled() {
        return this._data.hnsEnabled;
    }

    setHnsEnabled(hnsEnabled) {
        this._data.hnsEnabled = hnsEnabled;
        return this;
    }

    getLogging() {
        return this._data.logging;
    }

    setLogging(logging) {
        this._data.logging = logging;
        return this;
    }

    getHourMetrics() {
        return this._data.hourMetrics;
    }

    setHourMetrics(hourMetrics) {
        this._data.hourMetrics = hourMetrics;
        return this;
    }

    getMinuteMetrics() {
        return this._data.minuteMetrics;
    }

    setMinuteMetrics(minuteMetrics) {
        this._data.minuteMetrics = minuteMetrics;
        return this;
    }

    getServiceVersion() {
        return this._data.serviceVersion;
    }

    setServiceVersion(serviceVersion) {
        this._data.serviceVersion = serviceVersion;
        return this;
    }

    getValue() {
        return this._data;
    }
}
