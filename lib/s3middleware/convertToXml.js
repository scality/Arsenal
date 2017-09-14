const querystring = require('querystring');
const escapeForXml = require('./escapeForXml');

const convertMethods = {};

convertMethods.completeMultipartUpload = xmlParams => {
    const escapedBucketName = escapeForXml(xmlParams.bucketName);
    return '<?xml version="1.0" encoding="UTF-8"?>' +
    '<CompleteMultipartUploadResult ' +
        'xmlns="http://s3.amazonaws.com/doc/2006-03-01/">' +
    `<Location>http://${escapedBucketName}.` +
        `${escapeForXml(xmlParams.hostname)}/` +
        `${escapeForXml(xmlParams.objectKey)}</Location>` +
    `<Bucket>${escapedBucketName}</Bucket>` +
    `<Key>${escapeForXml(xmlParams.objectKey)}</Key>` +
    `<ETag>${escapeForXml(xmlParams.eTag)}</ETag>` +
    '</CompleteMultipartUploadResult>';
};

convertMethods.initiateMultipartUpload = xmlParams =>
    '<?xml version="1.0" encoding="UTF-8"?>' +
     '<InitiateMultipartUploadResult ' +
        'xmlns="http://s3.amazonaws.com/doc/2006-03-01/">' +
     `<Bucket>${escapeForXml(xmlParams.bucketName)}</Bucket>` +
     `<Key>${escapeForXml(xmlParams.objectKey)}</Key>` +
     `<UploadId>${escapeForXml(xmlParams.uploadId)}</UploadId>` +
     '</InitiateMultipartUploadResult>';

convertMethods.listMultipartUploads = xmlParams => {
    const xml = [];
    const l = xmlParams.list;

    xml.push('<?xml version="1.0" encoding="UTF-8"?>',
             '<ListMultipartUploadsResult ' +
                'xmlns="http://s3.amazonaws.com/doc/2006-03-01/">',
             `<Bucket>${escapeForXml(xmlParams.bucketName)}</Bucket>`
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
            xml.push(`<${param.tag}>${escapeForXml(param.value)}` +
                `</${param.tag}>`);
        } else if (!param.optional) {
            xml.push(`<${param.tag} />`);
        }
    });

    xml.push(`<MaxUploads>${escapeForXml(l.MaxKeys)}</MaxUploads>`,
             `<IsTruncated>${escapeForXml(l.IsTruncated)}</IsTruncated>`
    );

    l.Uploads.forEach(upload => {
        const val = upload.value;
        let key = upload.key;
        if (xmlParams.encoding === 'url') {
            key = querystring.escape(key);
        }

        xml.push('<Upload>',
                 `<Key>${escapeForXml(key)}</Key>`,
                 `<UploadId>${escapeForXml(val.UploadId)}</UploadId>`,
                 '<Initiator>',
                 `<ID>${escapeForXml(val.Initiator.ID)}</ID>`,
                 `<DisplayName>${escapeForXml(val.Initiator.DisplayName)}` +
                    '</DisplayName>',
                 '</Initiator>',
                 '<Owner>',
                 `<ID>${escapeForXml(val.Owner.ID)}</ID>`,
                 `<DisplayName>${escapeForXml(val.Owner.DisplayName)}` +
                    '</DisplayName>',
                 '</Owner>',
                 `<StorageClass>${escapeForXml(val.StorageClass)}` +
                    '</StorageClass>',
                 `<Initiated>${escapeForXml(val.Initiated)}</Initiated>`,
                 '</Upload>'
        );
    });

    l.CommonPrefixes.forEach(prefix => {
        xml.push('<CommonPrefixes>',
                 `<Prefix>${escapeForXml(prefix)}</Prefix>`,
                 '</CommonPrefixes>'
        );
    });

    xml.push('</ListMultipartUploadsResult>');

    return xml.join('');
};

function convertToXml(method, xmlParams) {
    return convertMethods[method](xmlParams);
}

module.exports = convertToXml;
