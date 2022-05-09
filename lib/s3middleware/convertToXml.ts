import * as querystring from 'querystring';
import escapeForXml from './escapeForXml';

export type Params = {
    bucketName: string;
    hostname: string;
    objectKey: string;
    eTag: string;
    uploadId: string;
    list: string;
}

export type CompleteParams = { bucketName: string; hostname: string; objectKey: string; eTag: string }
export const completeMultipartUpload = (xmlParams: CompleteParams) => {
    const bucketName = escapeForXml(xmlParams.bucketName);
    const hostname = escapeForXml(xmlParams.hostname);
    const objectKey = escapeForXml(xmlParams.objectKey);
    const location = `http://${bucketName}.${hostname}/${objectKey}`;
    const eTag = escapeForXml(xmlParams.eTag);
    return `
        <?xml version="1.0" encoding="UTF-8"?>
        <CompleteMultipartUploadResult xmlns="http://s3.amazonaws.com/doc/2006-03-01/">
            <Location>${location}</Location>
            <Bucket>${bucketName}</Bucket>
            <Key>${objectKey}</Key>
            <ETag>${eTag}</ETag>
        </CompleteMultipartUploadResult>
    `.trim();
}

export type InitParams = { bucketName: string; objectKey: string; uploadId: string }
export const initiateMultipartUpload = (xmlParams: InitParams) => `
    <?xml version="1.0" encoding="UTF-8"?>
    <InitiateMultipartUploadResult xmlns="http://s3.amazonaws.com/doc/2006-03-01/">
        <Bucket>${escapeForXml(xmlParams.bucketName)}</Bucket>
        <Key>${escapeForXml(xmlParams.objectKey)}</Key>
        <UploadId>${escapeForXml(xmlParams.uploadId)}</UploadId>
    </InitiateMultipartUploadResult>
`.trim();

export type ListParams = {
    list: {
        NextKeyMarker?: string;
        NextUploadIdMarker?: string;
        Delimiter?: string;
        MaxKeys: string;
        IsTruncated: string;
        CommonPrefixes: string[];
        Uploads: Array<{
            key: string;
            value: {
                UploadId: string;
                Initiator: {
                    ID: string;
                    DisplayName: string;
                };
                Owner: {
                    ID: string;
                    DisplayName: string;
                };
                StorageClass: string;
                Initiated: string;
            };
        }>;
    };
    encoding: 'url';
    bucketName: string;
    keyMarker: string;
    uploadIdMarker: string;
    prefix?: string;
}
export const listMultipartUploads = (xmlParams: ListParams) => {
    const xml: string[] = [];
    const l = xmlParams.list;

    xml.push(
        '<?xml version="1.0" encoding="UTF-8"?>',
        '<ListMultipartUploadsResult xmlns="http://s3.amazonaws.com/doc/2006-03-01/">',
        `   <Bucket>${escapeForXml(xmlParams.bucketName)}</Bucket>`,
    );

    // For certain XML elements, if it is `undefined`, AWS returns either an
    // empty tag or does not include it. Hence the `optional` key in the params.
    const params = [
        { tag: 'KeyMarker', value: xmlParams.keyMarker },
        { tag: 'UploadIdMarker', value: xmlParams.uploadIdMarker },
        { tag: 'NextKeyMarker', value: l.NextKeyMarker, optional: true },
        { tag: 'NextUploadIdMarker', value: l.NextUploadIdMarker,
            optional: true },
        { tag: 'Delimiter', value: l.Delimiter, optional: true },
        { tag: 'Prefix', value: xmlParams.prefix, optional: true },
    ];

    params.forEach(param => {
        if (param.value) {
            xml.push(
                `<${param.tag}>
                    ${escapeForXml(param.value)}
                </${param.tag}>`
            );
        } else if (!param.optional) {
            xml.push(`<${param.tag} />`);
        }
    });

    xml.push(
        `<MaxUploads>${escapeForXml(l.MaxKeys)}</MaxUploads>`,
        `<IsTruncated>${escapeForXml(l.IsTruncated)}</IsTruncated>`,
    );

    l.Uploads.forEach(upload => {
        const val = upload.value;
        let key = upload.key;
        if (xmlParams.encoding === 'url') {
            key = querystring.escape(key);
        }

        xml.push(
            '<Upload>',
                `<Key>${escapeForXml(key)}</Key>`,
                `<UploadId>${escapeForXml(val.UploadId)}</UploadId>`,
                '<Initiator>',
                    `<ID>${escapeForXml(val.Initiator.ID)}</ID>`,
                    `<DisplayName>`,
                        escapeForXml(val.Initiator.DisplayName),
                    '</DisplayName>',
                '</Initiator>',
                '<Owner>',
                    `<ID>${escapeForXml(val.Owner.ID)}</ID>`,
                    `<DisplayName>`,
                        escapeForXml(val.Owner.DisplayName),
                    '</DisplayName>',
                '</Owner>',
                `<StorageClass>`,
                    escapeForXml(val.StorageClass),
                '</StorageClass>',
                `<Initiated>${escapeForXml(val.Initiated)}</Initiated>`,
            '</Upload>',
        );
    });

    l.CommonPrefixes.forEach(prefix => {
        xml.push(
            '<CommonPrefixes>',
                `<Prefix>${escapeForXml(prefix)}</Prefix>`,
            '</CommonPrefixes>',
        );
    });

    xml.push('</ListMultipartUploadsResult>');

    return xml.join('');
}

const methods = {
    listMultipartUploads,
    initiateMultipartUpload,
    completeMultipartUpload,
}

export default function convertToXml(method: 'initiateMultipartUpload', params: InitParams): string;
export default function convertToXml(method: 'listMultipartUploads', params: ListParams): string;
export default function convertToXml(method: 'completeMultipartUpload', params: CompleteParams): string;
export default function convertToXml(method: keyof typeof methods, xmlParams: any) {
    return methods[method](xmlParams);
}
