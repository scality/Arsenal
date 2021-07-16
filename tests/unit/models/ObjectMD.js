const assert = require('assert');
const ObjectMD = require('../../../lib/models/ObjectMD');
const ObjectMDLocation = require('../../../lib/models/ObjectMDLocation');
const constants = require('../../../lib/constants');

const retainDate = new Date();
retainDate.setDate(retainDate.getDate() + 1);
const laterDate = new Date();
laterDate.setDate(laterDate.getDate() + 5);

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
        ['ContentLanguage', null, ''],
        ['ContentLanguage', 'content-language', ''],
        ['CreationTime', new Date().toJSON()],
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
        ['IsNull', null, false],
        ['IsNull', true],
        ['NullVersionId', null, undefined],
        ['NullVersionId', '111111'],
        ['IsDeleteMarker', null, false],
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
            isNFS: null,
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
            isNFS: null,
        }],
        ['DataStoreName', null, ''],
        ['ReplicationIsNFS', null, null],
        ['ReplicationIsNFS', true],
        ['AzureInfo', {
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
        }],
        ['LegalHold', null, false],
        ['LegalHold', true],
        ['RetentionMode', 'GOVERNANCE'],
        ['RetentionDate', retainDate.toISOString()],
        ['OriginOp', null, ''],
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

    it('ObjectMD::setReplicationBackends', () => {
        md.setReplicationBackends([{
            site: 'a',
            status: 'b',
            dataStoreVersionId: 'c',
        }]);
        assert.deepStrictEqual(md.getReplicationBackends(), [{
            site: 'a',
            status: 'b',
            dataStoreVersionId: 'c',
        }]);
    });

    it('ObjectMD::setReplicationStorageType', () => {
        md.setReplicationStorageType('a');
        assert.strictEqual(md.getReplicationStorageType(), 'a');
    });

    it('ObjectMD::setReplicationStorageClass', () => {
        md.setReplicationStorageClass('a');
        assert.strictEqual(md.getReplicationStorageClass(), 'a');
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

    it('ObjectMd::isMultipartUpload', () => {
        md.setContentMd5('68b329da9893e34099c7d8ad5cb9c940');
        assert.strictEqual(md.isMultipartUpload(), false);
        md.setContentMd5('741e0f4bad5b093044dc54a74d911094-1');
        assert.strictEqual(md.isMultipartUpload(), true);
        md.setContentMd5('bda0c0bed89c8bdb9e409df7ae7073c5-9876');
        assert.strictEqual(md.isMultipartUpload(), true);
    });

    it('ObjectMD::getUserMetadata', () => {
        md.setUserMetadata({
            'x-amz-meta-foo': 'bar',
            'x-amz-meta-baz': 'qux',
            // This one should be filtered out
            'x-amz-storage-class': 'STANDARD_IA',
            // This one should be changed to 'x-amz-meta-foobar'
            'x-ms-meta-foobar': 'bar',
            // ACLs are updated
            'acl': {
                FULL_CONTROL: ['john'],
            },
        });
        assert.deepStrictEqual(JSON.parse(md.getUserMetadata()), {
            'x-amz-meta-foo': 'bar',
            'x-amz-meta-baz': 'qux',
            'x-amz-meta-foobar': 'bar',
        });
        assert.deepStrictEqual(md.getAcl(), {
            FULL_CONTROL: ['john'],
        });
    });

    it('ObjectMD:clearMetadataValues', () => {
        md.setUserMetadata({
            'x-amz-meta-foo': 'bar',
        });
        md.clearMetadataValues();
        assert.strictEqual(md.getUserMetadata(), undefined);
    });

    it('ObjectMD::microVersionId unset', () => {
        assert.strictEqual(md.getMicroVersionId(), null);
    });

    it('ObjectMD::microVersionId set', () => {
        const generatedIds = new Set();
        for (let i = 0; i < 100; ++i) {
            md.updateMicroVersionId();
            generatedIds.add(md.getMicroVersionId());
        }
        // all generated IDs should be different
        assert.strictEqual(generatedIds.size, 100);
        generatedIds.forEach(key => {
            // length is always 16 in hex because leading 0s are
            // also encoded in the 8-byte random buffer.
            assert.strictEqual(key.length, 16);
        });
    });

    it('ObjectMD::set/getRetentionMode', () => {
        md.setRetentionMode('COMPLIANCE');
        assert.deepStrictEqual(md.getRetentionMode(), 'COMPLIANCE');
    });

    it('ObjectMD::set/getRetentionDate', () => {
        md.setRetentionDate(laterDate.toISOString());
        assert.deepStrictEqual(md.getRetentionDate(), laterDate.toISOString());
    });

    it('ObjectMD::set/getOriginOp', () => {
        md.setOriginOp('Copy');
        assert.deepStrictEqual(md.getOriginOp(), 'Copy');
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

describe('ObjectMD.getAttributes static method', () => {
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
            'content-language': true,
            'creation-time': true,
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
            'azureInfo': true,
            'isNull': true,
            'nullVersionId': true,
            'isDeleteMarker': true,
            'versionId': true,
            'tags': true,
            'replicationInfo': true,
            'dataStoreName': true,
            'last-modified': true,
            'md-model-version': true,
            'originOp': true,
        };
        assert.deepStrictEqual(attributes, expectedResult);
    });
});

describe('ObjectMDLocation class', () => {
    let mdLoc;
    beforeEach(() => {
        mdLoc = new ObjectMDLocation({
            key: 'location-key',
            start: 0,
            size: 1000,
            dataStoreName: 'location-name',
            dataStoreETag: '1:location-etag',
        });
    });
    it('should be able to create a location with standard fields', () => {
        assert.strictEqual(mdLoc.getKey(), 'location-key');
        assert.strictEqual(mdLoc.getDataStoreName(), 'location-name');
        assert.strictEqual(mdLoc.getDataStoreETag(), '1:location-etag');
        assert.strictEqual(mdLoc.getPartNumber(), 1);
        assert.strictEqual(mdLoc.getPartETag(), 'location-etag');
        assert.strictEqual(mdLoc.getPartStart(), 0);
        assert.strictEqual(mdLoc.getPartSize(), 1000);
        assert.strictEqual(mdLoc.getCryptoScheme(), undefined);
        assert.strictEqual(mdLoc.getCipheredDataKey(), undefined);
    });

    it('should be able to update a location without encryption info', () => {
        mdLoc.setDataLocation({
            key: 'new-location-key',
            dataStoreName: 'new-location-name',
        });
        assert.strictEqual(mdLoc.getKey(), 'new-location-key');
        assert.strictEqual(mdLoc.getDataStoreName(), 'new-location-name');
        assert.strictEqual(mdLoc.getDataStoreETag(), '1:location-etag');
        assert.strictEqual(mdLoc.getCryptoScheme(), undefined);
        assert.strictEqual(mdLoc.getCipheredDataKey(), undefined);
    });

    it('should be able to update a location with encryption info', () => {
        mdLoc.setDataLocation({
            key: 'new-location-key',
            dataStoreName: 'new-location-name',
            cryptoScheme: 1,
            cipheredDataKey: 'CiPhErEdDaTaKeY',
        });
        assert.strictEqual(mdLoc.getKey(), 'new-location-key');
        assert.strictEqual(mdLoc.getDataStoreName(), 'new-location-name');
        assert.strictEqual(mdLoc.getDataStoreETag(), '1:location-etag');
        assert.strictEqual(mdLoc.getCryptoScheme(), 1);
        assert.strictEqual(mdLoc.getCipheredDataKey(), 'CiPhErEdDaTaKeY');
    });
});
