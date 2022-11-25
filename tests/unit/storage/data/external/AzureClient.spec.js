const assert = require('assert');

const AzureClient = require('../../../../../lib/storage/data/external/AzureClient');
const { StorageSharedKeyCredential, AnonymousCredential } = require('@azure/storage-blob');
const { ClientSecretCredential } = require('@azure/identity');

describe('AzureClient', () => {
    it('should support shared-key auth', () => {
        const client = new AzureClient({
            azureStorageEndpoint: 'http://localhost:37425/',
            azureStorageCredentials: {
                authMethod: 'shared-key',
                storageAccountName: 'scality',
                storageAccessKey: 'Zm9vCg==',
            },
            azureContainerName: 'azureTestBucketName',
            dataStoreName: 'azureDataStore',
            type: 'azure',
        });
        assert(client._azureStorageEndpoint === 'http://localhost:37425/');
        assert(client._client.credential instanceof StorageSharedKeyCredential);
    });
    it('should support shared-access-signature token auth', () => {
        const client = new AzureClient({
            azureStorageEndpoint: 'http://localhost:37425/',
            azureStorageCredentials: {
                authMethod: 'shared-access-signature',
                sasToken: '?sp=blalg&sv=bal',
            },
            azureContainerName: 'azureTestBucketName',
            dataStoreName: 'azureDataStore',
            type: 'azure',
        });
        assert(client._azureStorageEndpoint === 'http://localhost:37425/?sp=blalg&sv=bal');
        assert(client._client.credential instanceof AnonymousCredential);
    });

    it('should support client-secret auth', () => {
        const client = new AzureClient({
            azureStorageEndpoint: 'http://localhost:37425/',
            azureStorageCredentials: {
                authMethod: 'client-secret',
                tenantId: 'myOrganization',
                clientId: 'myself',
                clientKey: 'mySecretKey',
            },
            azureContainerName: 'azureTestBucketName',
            dataStoreName: 'azureDataStore',
            type: 'azure',
        });
        assert(client._azureStorageEndpoint === 'http://localhost:37425/');
        assert(client._client.credential instanceof ClientSecretCredential);
    });

    it('should use shared-key by default', () => {
        const client = new AzureClient({
            azureStorageEndpoint: 'http://localhost:37425/',
            azureStorageCredentials: {
                storageAccountName: 'scality',
                storageAccessKey: 'Zm9vCg==',
            },
            azureContainerName: 'azureTestBucketName',
            dataStoreName: 'azureDataStore',
            type: 'azure',
        });
        assert(client._azureStorageEndpoint === 'http://localhost:37425/');
        assert(client._client.credential instanceof StorageSharedKeyCredential);
    });

    describe('addQueryParams()', () => {
        it('should append query parameters', () => {
            let url = AzureClient.addQueryParams('https://foo.blob.windows.com', '?sp=blalg&sv=bal');
            assert(url === 'https://foo.blob.windows.com/?sp=blalg&sv=bal');

            url = AzureClient.addQueryParams('http://localhost:37425/', '?sp=blalg&sv=bal');
            assert(url === 'http://localhost:37425/?sp=blalg&sv=bal');

            url = AzureClient.addQueryParams('http://localhost/fooo', '?sp=blalg&sv=bal');
            assert(url === 'http://localhost/fooo?sp=blalg&sv=bal');
        });

        it('should add missing ? in query parameters', () => {
            const url = AzureClient.addQueryParams('http://localhost:37425/', 'sp=blalg&sv=bal');
            assert(url === 'http://localhost:37425/?sp=blalg&sv=bal');
        });

        it('should support query parameters in url', () => {
            let url = AzureClient.addQueryParams('http://localhost:37425/?foo=bar', '?sp=blalg&sv=bal');
            assert(url === 'http://localhost:37425/?foo=bar&sp=blalg&sv=bal');

            url = AzureClient.addQueryParams('http://localhost:37425/?foo=bar', 'sp=blalg&sv=bal');
            assert(url === 'http://localhost:37425/?foo=bar&sp=blalg&sv=bal');
        });
    });
});
