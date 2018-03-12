const assert = require('assert');
const ObjectMD = require('../../../lib/models/ObjectMD');
const constants = require('../../../lib/constants');

describe('ObjectMD class setters/getters', () => {
    let md = null;

    beforeEach(() => {
        md = new ObjectMD();
    });

    [
        // In order: data property, value to set/get, default value
        ['OwnerDisplayName', null, ''],
        ['OwnerDisplayName', 'owner-display-name'],
        ['OwnerId', null, ''],
        ['OwnerId', 'owner-id'],
        ['CacheControl', null, ''],
        ['CacheControl', 'cache-control'],
        ['ContentDisposition', null, ''],
        ['ContentDisposition', 'content-disposition'],
        ['ContentEncoding', null, ''],
        ['ContentEncoding', 'content-encoding'],
        ['Expires', null, ''],
        ['Expires', 'expire-date'],
        ['ContentLength', null, 0],
        ['ContentLength', 15000],
        ['ContentType', null, ''],
        ['ContentType', 'content-type'],
        ['LastModified', new Date().toJSON()],
        ['ContentMd5', null, ''],
        ['ContentMd5', 'content-md5'],
        ['AmzVersionId', null, 'null'],
        ['AmzVersionId', 'version-id'],
        ['AmzServerVersionId', null, ''],
        ['AmzServerVersionId', 'server-version-id'],
        ['AmzStorageClass', null, 'STANDARD'],
        ['AmzStorageClass', 'storage-class'],
        ['AmzServerSideEncryption', null, ''],
        ['AmzServerSideEncryption', 'server-side-encryption'],
        ['AmzEncryptionKeyId', null, ''],
        ['AmzEncryptionKeyId', 'encryption-key-id'],
        ['AmzEncryptionCustomerAlgorithm', null, ''],
        ['AmzEncryptionCustomerAlgorithm', 'customer-algorithm'],
        ['Acl', null, {
            Canned: 'private',
            FULL_CONTROL: [],
            WRITE_ACP: [],
            READ: [],
            READ_ACP: [],
        }],
        ['Acl', {
            Canned: 'public',
            FULL_CONTROL: ['id'],
            WRITE_ACP: ['id'],
            READ: ['id'],
            READ_ACP: ['id'],
        }],
        ['Key', null, ''],
        ['Key', 'key'],
        ['Location', null, []],
        ['Location', ['location1']],
        ['IsNull', null, ''],
        ['IsNull', true],
        ['NullVersionId', null, ''],
        ['NullVersionId', '111111'],
        ['IsDeleteMarker', null, ''],
        ['IsDeleteMarker', true],
        ['VersionId', null, undefined],
        ['VersionId', '111111'],
        ['Tags', null, {}],
        ['Tags', {
            key: 'value',
        }],
        ['Tags', null, {}],
        ['ReplicationInfo', null, {
            status: '',
            backends: [],
            content: [],
            destination: '',
            storageClass: '',
            role: '',
            storageType: '',
            dataStoreVersionId: '',
        }],
        ['ReplicationInfo', {
            status: 'PENDING',
            backends: [{
                site: 'zenko',
                status: 'PENDING',
                dataStoreVersionId: 'a',
            }],
            content: ['DATA', 'METADATA'],
            destination: 'destination-bucket',
            storageClass: 'STANDARD',
            role: 'arn:aws:iam::account-id:role/src-resource,' +
                'arn:aws:iam::account-id:role/dest-resource',
            storageType: 'aws_s3',
            dataStoreVersionId: '',
        }],
        ['DataStoreName', null, ''],
    ].forEach(test => {
        const property = test[0];
        const testValue = test[1];
        const defaultValue = test[2];
        const testName = testValue === null ? 'get default' : 'get/set';
        it(`${testName}: ${property}`, () => {
            if (testValue !== null) {
                md[`set${property}`](testValue);
            }
            const value = md[`get${property}`]();
            if ((testValue !== null && typeof testValue === 'object') ||
                typeof defaultValue === 'object') {
                assert.deepStrictEqual(value, testValue || defaultValue);
            } else if (testValue !== null) {
                assert.strictEqual(value, testValue);
            } else {
                assert.strictEqual(value, defaultValue);
            }
        });
    });

    it('ObjectMD::setReplicationSiteStatus', () => {
        md.setReplicationInfo({
            backends: [{
                site: 'zenko',
                status: 'PENDING',
                dataStoreVersionId: 'a',
            }],
        });
        md.setReplicationSiteStatus('zenko', 'COMPLETED');
        assert.deepStrictEqual(md.getReplicationInfo().backends, [{
            site: 'zenko',
            status: 'COMPLETED',
            dataStoreVersionId: 'a',
        }]);
    });

    it('ObjectMD::getReplicationSiteStatus', () => {
        md.setReplicationInfo({
            backends: [{
                site: 'zenko',
                status: 'PENDING',
                dataStoreVersionId: 'a',
            }],
        });
        assert.strictEqual(md.getReplicationSiteStatus('zenko'), 'PENDING');
    });

    it('ObjectMD::setReplicationSiteDataStoreVersionId', () => {
        md.setReplicationInfo({
            backends: [{
                site: 'zenko',
                status: 'PENDING',
                dataStoreVersionId: 'a',
            }],
        });
        md.setReplicationSiteDataStoreVersionId('zenko', 'b');
        assert.deepStrictEqual(md.getReplicationInfo().backends, [{
            site: 'zenko',
            status: 'PENDING',
            dataStoreVersionId: 'b',
        }]);
    });

    it('ObjectMD::getReplicationSiteDataStoreVersionId', () => {
        md.setReplicationInfo({
            backends: [{
                site: 'zenko',
                status: 'PENDING',
                dataStoreVersionId: 'a',
            }],
        });
        assert.strictEqual(
            md.getReplicationSiteDataStoreVersionId('zenko'), 'a');
    });
});

describe('ObjectMD import from stored blob', () => {
    it('should export and import correctly the latest model version', () => {
        const md = new ObjectMD();
        const jsonMd = md.getSerialized();
        const importedRes = ObjectMD.createFromBlob(jsonMd);
        assert.ifError(importedRes.error);
        const importedMd = importedRes.result;
        assert.deepStrictEqual(md, importedMd);
    });

    it('should convert old location to new location', () => {
        const md = new ObjectMD();
        const value = md.getValue();
        value['md-model-version'] = 1;
        value.location = 'stringLocation';
        const jsonMd = JSON.stringify(value);
        const importedRes = ObjectMD.createFromBlob(jsonMd);
        assert.strictEqual(importedRes.error, undefined);
        const importedMd = importedRes.result;
        const valueImported = importedMd.getValue();
        assert.strictEqual(valueImported['md-model-version'],
                           constants.mdModelVersion);
        assert.deepStrictEqual(valueImported.location,
                               [{ key: 'stringLocation' }]);
    });

    it('should keep null location as is', () => {
        const md = new ObjectMD();
        const value = md.getValue();
        value.location = null;
        const jsonMd = JSON.stringify(value);
        const importedRes = ObjectMD.createFromBlob(jsonMd);
        assert.strictEqual(importedRes.error, undefined);
        const importedMd = importedRes.result;
        const valueImported = importedMd.getValue();
        assert.deepStrictEqual(valueImported.location, null);
        importedMd.setLocation([]);
        assert.deepStrictEqual(importedMd.getValue().location, null);
    });

    it('should add dataStoreName attribute if missing', () => {
        const md = new ObjectMD();
        const value = md.getValue();
        value['md-model-version'] = 2;
        delete value.dataStoreName;
        const jsonMd = JSON.stringify(value);
        const importedRes = ObjectMD.createFromBlob(jsonMd);
        assert.strictEqual(importedRes.error, undefined);
        const importedMd = importedRes.result;
        const valueImported = importedMd.getValue();
        assert.strictEqual(valueImported['md-model-version'],
                           constants.mdModelVersion);
        assert.notStrictEqual(valueImported.dataStoreName, undefined);
    });

    it('should return undefined for dataStoreVersionId if no object location',
    () => {
        const md = new ObjectMD();
        const value = md.getValue();
        const jsonMd = JSON.stringify(value);
        const importedRes = ObjectMD.createFromBlob(jsonMd);
        assert.strictEqual(importedRes.error, undefined);
        const importedMd = importedRes.result;
        assert.strictEqual(importedMd.getDataStoreVersionId(), undefined);
    });

    it('should get dataStoreVersionId if saved in object location', () => {
        const md = new ObjectMD();
        const dummyLocation = {
            dataStoreVersionId: 'data-store-version-id',
        };
        md.setLocation([dummyLocation]);
        const value = md.getValue();
        const jsonMd = JSON.stringify(value);
        const importedRes = ObjectMD.createFromBlob(jsonMd);
        assert.strictEqual(importedRes.error, undefined);
        const importedMd = importedRes.result;
        assert.strictEqual(importedMd.getDataStoreVersionId(),
            dummyLocation.dataStoreVersionId);
    });

    it('should return an error if blob is malformed JSON', () => {
        const importedRes = ObjectMD.createFromBlob('{BAD JSON}');
        assert.notStrictEqual(importedRes.error, undefined);
        assert.strictEqual(importedRes.result, undefined);
    });
});

describe('getAttributes static method', () => {
    it('should return object metadata attributes', () => {
        const attributes = ObjectMD.getAttributes();
        const expectedResult = {
            'owner-display-name': true,
            'owner-id': true,
            'cache-control': true,
            'content-disposition': true,
            'content-encoding': true,
            'expires': true,
            'content-length': true,
            'content-type': true,
            'content-md5': true,
            'x-amz-version-id': true,
            'x-amz-server-version-id': true,
            'x-amz-storage-class': true,
            'x-amz-server-side-encryption': true,
            'x-amz-server-side-encryption-aws-kms-key-id': true,
            'x-amz-server-side-encryption-customer-algorithm': true,
            'x-amz-website-redirect-location': true,
            'acl': true,
            'key': true,
            'location': true,
            'isNull': true,
            'nullVersionId': true,
            'isDeleteMarker': true,
            'versionId': true,
            'tags': true,
            'replicationInfo': true,
            'dataStoreName': true,
            'last-modified': true,
            'md-model-version': true };
        assert.deepStrictEqual(attributes, expectedResult);
    });
});
