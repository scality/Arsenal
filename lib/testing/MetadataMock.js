const errors = require('../../errors/arsenalErrors');
const mockRes = require('./mockRes');

const mockLogs = {
    info: { start: 1, cseq: 7, prune: 1 },
    log: [
        { db: 'friday', method: 0, entries: [
            { value: '{\"attributes\":\"{\\\"name\\\":\\\"friday\\\",' +
            '\\\"owner\\\":\\\"94224c921648ada653f584f3caf42654ccf3f1cb' +
            'd2e569a24e88eb460f2f84d8\\\",\\\"ownerDisplayName\\\":' +
            '\\\"test_1518720219\\\",\\\"creationDate\\\":' +
            '\\\"2018-02-16T19:59:31.664Z\\\",\\\"mdBucketModelVersion\\\":5,' +
            '\\\"transient\\\":true,\\\"deleted\\\":false,' +
            '\\\"serverSideEncryption\\\":null,\\\"versioningConfiguration' +
            '\\\":null,\\\"locationConstraint\\\":\\\"us-east-1\\\",\\\"cors' +
            '\\\":null,\\\"replicationConfiguration\\\":null}\"}' },
        ] },
        { db: 'friday', method: 7, entries: [
            { value: '{\"attributes\":\"{\\\"name\\\":\\\"friday\\\",' +
            '\\\"owner\\\":\\\"94224c921648ada653f584f3caf42654ccf3f1cb' +
            'd2e569a24e88eb460f2f84d8\\\",\\\"ownerDisplayName\\\":' +
            '\\\"test_1518720219\\\",\\\"creationDate\\\":' +
            '\\\"2018-02-16T19:59:31.664Z\\\",\\\"mdBucketModelVersion\\\":5,' +
            '\\\"transient\\\":false,\\\"deleted\\\":false,' +
            '\\\"serverSideEncryption\\\":null,\\\"versioningConfiguration' +
            '\\\":null,\\\"locationConstraint\\\":\\\"us-east-1\\\",\\\"cors' +
            '\\\":null,\\\"replicationConfiguration\\\":null}\",' +
            '\"raftSession\":1}' },
        ] },
        { db: 'friday7', method: 0, entries: [
            { value: '{\"attributes\":\"{\\\"name\\\":\\\"friday7\\\",' +
            '\\\"owner\\\":\\\"94224c921648ada653f584f3caf42654ccf3f1cb' +
            'd2e569a24e88eb460f2f84d8\\\",\\\"ownerDisplayName\\\":' +
            '\\\"test_1518720219\\\",\\\"creationDate\\\":' +
            '\\\"2018-02-16T20:41:34.253Z\\\",\\\"mdBucketModelVersion\\\":5,' +
            '\\\"transient\\\":true,\\\"deleted\\\":false,' +
            '\\\"serverSideEncryption\\\":null,\\\"versioningConfiguration' +
            '\\\":null,\\\"locationConstraint\\\":\\\"us-east-1\\\",\\\"cors' +
            '\\\":null,\\\"replicationConfiguration\\\":null}\"}' },
        ] },
        { db: 'friday7', method: 7, entries: [
            { value: '{\"attributes\":\"{\\\"name\\\":\\\"friday7\\\",' +
            '\\\"owner\\\":\\\"94224c921648ada653f584f3caf42654ccf3f1cb' +
            'd2e569a24e88eb460f2f84d8\\\",\\\"ownerDisplayName\\\":' +
            '\\\"test_1518720219\\\",\\\"creationDate\\\":' +
            '\\\"2018-02-16T20:41:34.253Z\\\",\\\"mdBucketModelVersion\\\":5,' +
            '\\\"transient\\\":false,\\\"deleted\\\":false,' +
            '\\\"serverSideEncryption\\\":null,\\\"versioningConfiguration' +
            '\\\":null,\\\"locationConstraint\\\":\\\"us-east-1\\\",\\\"cors' +
            '\\\":null,\\\"replicationConfiguration\\\":null}\",' +
            '\"raftSession\":1}' },
        ] },
        { db: 'xxxfriday10', method: 0, entries: [
            { value: '{\"attributes\":\"{\\\"name\\\":\\\"xxxfriday10\\\",' +
            '\\\"owner\\\":\\\"94224c921648ada653f584f3caf42654ccf3f1cb' +
            'd2e569a24e88eb460f2f84d8\\\",\\\"ownerDisplayName\\\":' +
            '\\\"test_1518720219\\\",\\\"creationDate\\\":' +
            '\\\"2018-02-16T21:55:16.415Z\\\",\\\"mdBucketModelVersion\\\":5,' +
            '\\\"transient\\\":true,\\\"deleted\\\":false,' +
            '\\\"serverSideEncryption\\\":null,\\\"versioningConfiguration' +
            '\\\":null,\\\"locationConstraint\\\":\\\"us-east-1\\\",\\\"cors' +
            '\\\":null,\\\"replicationConfiguration\\\":null}\"}' },
        ] },
        { db: 'xxxfriday10', method: 7, entries: [
            { value: '{\"attributes\":\"{\\\"name\\\":\\\"xxxfriday10\\\",' +
            '\\\"owner\\\":\\\"94224c921648ada653f584f3caf42654ccf3f1cb' +
            'd2e569a24e88eb460f2f84d8\\\",\\\"ownerDisplayName\\\":' +
            '\\\"test_1518720219\\\",\\\"creationDate\\\":' +
            '\\\"2018-02-16T21:55:16.415Z\\\",\\\"mdBucketModelVersion\\\":5,' +
            '\\\"transient\\\":false,\\\"deleted\\\":false,' +
            '\\\"serverSideEncryption\\\":null,\\\"versioningConfiguration' +
            '\\\":null,\\\"locationConstraint\\\":\\\"us-east-1\\\",\\\"cors' +
            '\\\":null,\\\"replicationConfiguration\\\":null}\",' +
            '\"raftSession\":1}' },
        ] },
        { db: 'xxxfriday10', method: 8, entries: [
            {
                key: 'afternoon',
                value: '{\"owner-display-name\":\"test_1518720219\",' +
                    '\"owner-id\":\"94224c921648ada653f584f3caf42654ccf3f1cb' +
                    'd2e569a24e88eb460f2f84d8\",\"content-length\":0,' +
                    '\"content-md5\":\"d41d8cd98f00b204e9800998ecf8427e\",' +
                    '\"x-amz-version-id\":\"null\",' +
                    '\"x-amz-server-version-id\":\"\",\"x-amz-storage-class' +
                    '\":\"STANDARD\",\"x-amz-server-side-encryption\":\"\",' +
                    '\"x-amz-server-side-encryption-aws-kms-key-id\":\"\",' +
                    '\"x-amz-server-side-encryption-customer-algorithm\":' +
                    '\"\",\"x-amz-website-redirect-location\":\"\",\"acl\":' +
                    '{\"Canned\":\"private\",\"FULL_CONTROL\":[],' +
                    '\"WRITE_ACP\":[],\"READ\":[],\"READ_ACP\":[]},\"key\":' +
                    '\"\",\"location\":null,\"isDeleteMarker\":false,\"tags' +
                    '\":{},\"replicationInfo\":{\"status\":\"\",\"backends\":' +
                    '[],\"content\":[],\"destination\":\"\",\"storageClass\":' +
                    '\"\",\"role\":\"\",\"storageType\":\"\",' +
                    '\"dataStoreVersionId\":\"\"},\"dataStoreName\":' +
                    '\"us-east-1\",\"last-modified\":\"2018-02-16T21:56:52.' +
                    '690Z\",\"md-model-version\":3}',
            },
        ] },
    ] };

class MetadataMock {
    onRequest(req, res) {
        // TODO: for PUT/POST, edit the mockRes object
        if (req.method === 'GET') {
            const url = req.url.split('?')[0];
            const resObj = mockRes.GET.responses[url];
            if (!resObj && req.url.startsWith('/default/attributes')) {
                const err = errors.NoSuchBucket;
                res.writeHead(err.code, 'NoSuchBucket');
                res.end();
            } else if (!resObj) {
                res.end(JSON.stringify({}));
            } else if (resObj.resType === 'error') {
                const err = errors[resObj.name];
                res.writeHead(err.code, resObj.name);
                res.end();
            } else {
                const resSend = mockRes[resObj.resType];
                if (resObj['content-type']) {
                    res.writeHead(200, {
                        'Content-Type': resObj['content-type'],
                    });
                }
                res.end(JSON.stringify(resSend[resObj.name]));
            }
        } else if (req.method === 'POST') {
            const resObj = mockRes.POST.responses[req.url];
            if (!resObj) {
                res.end();
            } else if (resObj.resType === 'error') {
                const err = errors[resObj.name];
                res.writeHead(err.code, resObj.name);
                res.end();
            } else {
                mockRes.GET.response[req.url] =
                    mockRes[resObj.resType][resObj.name];
                res.end({});
            }
        }
        res.end({});
    }
}

module.exports = {
    MetadataMock,
    mockLogs,
};
