import assert from 'assert';
import { listMultipartUploads, ListParams } from
    '../../../lib/s3middleware/convertToXml';

function makeUpload(key: string, uploadId: string, overrides?: {
    ChecksumAlgorithm?: string;
    ChecksumType?: string;
    ChecksumIsDefault?: boolean;
}) {
    return {
        key,
        value: {
            UploadId: uploadId,
            Initiator: { ID: 'initiator1', DisplayName: 'Initiator 1' },
            Owner: { ID: 'owner1', DisplayName: 'Owner 1' },
            StorageClass: 'STANDARD',
            Initiated: '2026-01-01T00:00:00.000Z',
            ...overrides,
        },
    };
}

function makeParams(uploads: ListParams['list']['Uploads']): ListParams {
    return {
        list: {
            MaxKeys: '1000',
            IsTruncated: 'false',
            CommonPrefixes: [],
            Uploads: uploads,
        },
        encoding: 'url',
        bucketName: 'test-bucket',
        keyMarker: '',
        uploadIdMarker: '',
    };
}

describe('convertToXml listMultipartUploads', () => {
    it('should uppercase ChecksumAlgorithm in XML output', () => {
        const params = makeParams([
            makeUpload('key1', 'id1', {
                ChecksumAlgorithm: 'crc32',
                ChecksumType: 'FULL_OBJECT',
                ChecksumIsDefault: false,
            }),
        ]);
        const xml = listMultipartUploads(params);
        assert(xml.includes(
            '<ChecksumAlgorithm>CRC32</ChecksumAlgorithm>'));
        assert(xml.includes(
            '<ChecksumType>FULL_OBJECT</ChecksumType>'));
    });

    it('should not include checksum fields when ChecksumIsDefault is true',
        () => {
            const params = makeParams([
                makeUpload('key1', 'id1', {
                    ChecksumAlgorithm: 'sha256',
                    ChecksumType: 'COMPOSITE',
                    ChecksumIsDefault: true,
                }),
            ]);
            const xml = listMultipartUploads(params);
            assert(!xml.includes('<ChecksumAlgorithm>'));
            assert(!xml.includes('<ChecksumType>'));
        });

    it('should not include checksum fields when absent', () => {
        const params = makeParams([
            makeUpload('key1', 'id1'),
        ]);
        const xml = listMultipartUploads(params);
        assert(!xml.includes('<ChecksumAlgorithm>'));
        assert(!xml.includes('<ChecksumType>'));
    });

    it('should place ChecksumAlgorithm after Key and before UploadId', () => {
        const params = makeParams([
            makeUpload('key1', 'id1', {
                ChecksumAlgorithm: 'sha256',
                ChecksumType: 'COMPOSITE',
                ChecksumIsDefault: false,
            }),
        ]);
        const xml = listMultipartUploads(params);
        const keyIdx = xml.indexOf('<Key>');
        const checksumAlgoIdx = xml.indexOf('<ChecksumAlgorithm>');
        const checksumTypeIdx = xml.indexOf('<ChecksumType>');
        const uploadIdIdx = xml.indexOf('<UploadId>');
        assert(keyIdx < checksumAlgoIdx,
            'ChecksumAlgorithm should come after Key');
        assert(checksumAlgoIdx < checksumTypeIdx,
            'ChecksumType should come after ChecksumAlgorithm');
        assert(checksumTypeIdx < uploadIdIdx,
            'UploadId should come after ChecksumType');
    });

    it('should not include checksum fields when only one is present', () => {
        const params = makeParams([
            makeUpload('key1', 'id1', {
                ChecksumAlgorithm: 'crc32',
                ChecksumIsDefault: false,
            }),
        ]);
        const xml = listMultipartUploads(params);
        assert(!xml.includes('<ChecksumAlgorithm>'));
        assert(!xml.includes('<ChecksumType>'));
    });

    it('should handle mixed uploads with and without checksum fields', () => {
        const params = makeParams([
            makeUpload('key1', 'id1', {
                ChecksumAlgorithm: 'crc32c',
                ChecksumType: 'FULL_OBJECT',
                ChecksumIsDefault: false,
            }),
            makeUpload('key2', 'id2'),
            makeUpload('key3', 'id3', {
                ChecksumAlgorithm: 'sha256',
                ChecksumType: 'COMPOSITE',
                ChecksumIsDefault: true,
            }),
        ]);
        const xml = listMultipartUploads(params);
        assert(xml.includes(
            '<ChecksumAlgorithm>CRC32C</ChecksumAlgorithm>'));
        // Only the first upload should emit checksum elements
        const algoMatches = xml.match(/<ChecksumAlgorithm>/g);
        assert.strictEqual(algoMatches?.length, 1);
        const typeMatches = xml.match(/<ChecksumType>/g);
        assert.strictEqual(typeMatches?.length, 1);
    });
});
