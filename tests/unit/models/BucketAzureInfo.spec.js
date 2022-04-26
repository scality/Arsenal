const assert = require('assert');
const BucketAzureInfo = require('../../../index').models.BucketAzureInfo;


const testAzureInfoObj = {
    sku: 'skuname',
    accessTier: 'accessTierName',
    kind: 'kindName',
    systemKeys: ['key1', 'key2'],
    tenantKeys: ['key3', 'key4'],
    subscriptionId: 'subscriptionIdName',
    resourceGroup: 'resourceGroupName',
    deleteRetentionPolicy: { enabled: true, days: 14 },
    managementPolicies: [],
    httpsOnly: false,
    tags: { foo: 'bar' },
    networkACL: [],
    cname: 'www.example.com',
    azureFilesAADIntegration: false,
    hnsEnabled: false,
    logging: {},
    hourMetrics: {},
    minuteMetrics: {},
    serviceVersion: '2018-03-28',
};

const azureInfo = new BucketAzureInfo(testAzureInfoObj);


describe('BucketAzureInfo value', () => {
    it('should return the correct value', () => {
        const azureInfoObj = azureInfo.getValue();
        assert.deepStrictEqual(azureInfoObj, testAzureInfoObj);
    });
});

describe('BucketAzureInfo setters/getters', () => {
    it('should control the sku attribute', () => {
        const sku = 'new sku value';
        azureInfo.setSku(sku);
        assert.deepStrictEqual(azureInfo.getSku(), sku);
    });
    it('should control the accessTier attribute', () => {
        const accessTier = 'new accessTier value';
        azureInfo.setAccessTier(accessTier);
        assert.deepStrictEqual(azureInfo.getAccessTier(), accessTier);
    });
    it('should control the kind attribute', () => {
        const kind = 'new kind value';
        azureInfo.setKind(kind);
        assert.deepStrictEqual(azureInfo.getKind(), kind);
    });
    it('should control the systemKeys attribute', () => {
        const systemKeys = ['newKey1', 'newKey2'];
        azureInfo.setSystemKeys(systemKeys);
        assert.deepStrictEqual(azureInfo.getSystemKeys(),
            systemKeys);
    });
    it('should control the tenantKeys attribute', () => {
        const tenantKeys = ['newKey3', 'newKey4'];
        azureInfo.setTenantKeys(tenantKeys);
        assert.deepStrictEqual(azureInfo.getTenantKeys(),
            tenantKeys);
    });
    it('should control the subscriptionId attribute', () => {
        const subscriptionId = 'new subscription value';
        azureInfo.setSubscriptionId(subscriptionId);
        assert.deepStrictEqual(azureInfo.getSubscriptionId(),
            subscriptionId);
    });
    it('should control the resourceGroup attribute', () => {
        const resourceGroup = 'new resource group value';
        azureInfo.setResourceGroup(resourceGroup);
        assert.deepStrictEqual(azureInfo.getResourceGroup(),
            resourceGroup);
    });
    it('should control the deleteRetentionPolicy attribute', () => {
        const deleteRetentionPolicy = { enabled: false };
        azureInfo.setDeleteRetentionPolicy(deleteRetentionPolicy);
        assert.deepStrictEqual(azureInfo.getDeleteRetentionPolicy(),
            deleteRetentionPolicy);
    });
    it('should control the managementPolicies attribute', () => {
        const managementPolicies = [{}];
        azureInfo.setManagementPolicies(managementPolicies);
        assert.deepStrictEqual(azureInfo.getManagementPolicies(),
            managementPolicies);
    });
    it('should control the httpsOnly attribute', () => {
        const httpsOnly = true;
        azureInfo.setHttpsOnly(httpsOnly);
        assert.deepStrictEqual(azureInfo.getHttpsOnly(),
            httpsOnly);
    });
    it('should control the tags attribute', () => {
        const tags = { baz: 'baz' };
        azureInfo.setTags(tags);
        assert.deepStrictEqual(azureInfo.getTags(),
            tags);
    });
    it('should control the networkACL attribute', () => {
        const networkACL = [{}];
        azureInfo.setNetworkACL(networkACL);
        assert.deepStrictEqual(azureInfo.getNetworkACL(),
            networkACL);
    });
    it('should control the cname attribute', () => {
        const cname = 'new cname value';
        azureInfo.setCname(cname);
        assert.deepStrictEqual(azureInfo.getCname(),
            cname);
    });
    it('should control the azureFilesAADIntegration attribute', () => {
        const azureFilesAADIntegration = true;
        azureInfo.setAzureFilesAADIntegration(azureFilesAADIntegration);
        assert.deepStrictEqual(azureInfo.getAzureFilesAADIntegration(),
            azureFilesAADIntegration);
    });
    it('should control the hnsEnabled attribute', () => {
        const hnsEnabled = true;
        azureInfo.setHnsEnabled(hnsEnabled);
        assert.deepStrictEqual(azureInfo.getHnsEnabled(),
            hnsEnabled);
    });
    it('should control the logging attribute', () => {
        const logging = {
            version: '1.0',
            delete: false,
            read: false,
            write: false,
            retentionPolicy: {
                enabled: false,
                days: 0,
            },
        };
        azureInfo.setLogging(logging);
        assert.deepStrictEqual(azureInfo.getLogging(), logging);
    });
    it('should control the hourMetrics attribute', () => {
        const hourMetrics = {
            version: '1.0',
            enabled: false,
            includeAPIs: false,
            retentionPolicy: {
                enabled: false,
                days: 0,
            },
        };
        azureInfo.setHourMetrics(hourMetrics);
        assert.deepStrictEqual(azureInfo.getHourMetrics(), hourMetrics);
    });
    it('should control the minuteMetrics attribute', () => {
        const minuteMetrics = {
            version: '1.0',
            enabled: false,
            includeAPIs: false,
            retentionPolicy: {
                enabled: false,
                days: 0,
            },
        };
        azureInfo.setMinuteMetrics(minuteMetrics);
        assert.deepStrictEqual(azureInfo.getMinuteMetrics(), minuteMetrics);
    });
    it('should control the serviceVersion attribute', () => {
        const serviceVersion = '2019-08-01';
        azureInfo.setServiceVersion(serviceVersion);
        assert.deepStrictEqual(azureInfo.getServiceVersion(), serviceVersion);
    });
});
