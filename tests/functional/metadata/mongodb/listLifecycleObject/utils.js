const async = require('async');
const BucketInfo = require('../../../../../lib/models/BucketInfo').default;
const assert = require('assert');

/**
    * Puts multpile versions of an object
    * @param {Object} metadata - metadata client
    * @param {String} bucketName - bucket name
    * @param {String} objName - object key
    * @param {Object} objVal - object metadata
    * @param {Object} params - versioning parameters
    * @param {number} versionNb - number of versions to put
    * @param {number} timestamp - used for last-modified
    * @param {Object} logger - a Logger instance
    * @param {Function} cb - callback
    * @returns {undefined}
*/
function putBulkObjectVersions(metadata, bucketName, objName, objVal, params, versionNb, timestamp, logger, cb) {
    let count = 0;
    return async.whilst(
        () => count < versionNb,
        cbIterator => {
            count++;
            const lastModified = new Date(timestamp + count).toISOString();
            const finalObjectVal = Object.assign(objVal, { 'last-modified': lastModified });
            return metadata.putObjectMD(bucketName, objName, finalObjectVal, params,
                logger, cbIterator);
        }, cb);
}

function makeBucketMD(bucketName) {
    return BucketInfo.fromObj({
        _name: bucketName,
        _owner: 'testowner',
        _ownerDisplayName: 'testdisplayname',
        _creationDate: new Date().toJSON(),
        _acl: {
            Canned: 'private',
            FULL_CONTROL: [],
            WRITE: [],
            WRITE_ACP: [],
            READ: [],
            READ_ACP: [],
        },
        _mdBucketModelVersion: 10,
        _transient: false,
        _deleted: false,
        _serverSideEncryption: null,
        _versioningConfiguration: null,
        _locationConstraint: 'us-east-1',
        _readLocationConstraint: null,
        _cors: null,
        _replicationConfiguration: null,
        _lifecycleConfiguration: null,
        _uid: '',
        _isNFS: null,
        ingestion: null,
    });
}

function assertContents(contents, expected) {
    contents.forEach((c, i) => {
        assert.strictEqual(c.key, expected[i].key);
        assert.strictEqual(c.value.LastModified, expected[i].LastModified);
        assert.strictEqual(c.value.staleDate, expected[i].staleDate);
    });
}

/**
* Sets the "deleted" property to true
* @param {Object} collection - collection to be updated
* @param {string} key - object name
* @param {Function} cb - callback
* @return {undefined}
*/
function flagObjectForDeletion(collection, key, cb) {
    collection.updateMany(
        { 'value.key': key },
        { $set: { 'value.deleted': true } },
        { upsert: false }, cb);
}

module.exports = {
    putBulkObjectVersions,
    makeBucketMD,
    assertContents,
    flagObjectForDeletion,
};
