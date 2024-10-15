/* eslint-disable @typescript-eslint/no-require-imports */

const async = require('async');
const Backoff = require('backo');
const { eachSlice, createMpuKey, createMpuList, logger } =
    require('../GcpUtils');
const { logHelper } = require('../../utils');
const { createAggregateETag } =
    require('../../../../../s3middleware/processMpuParts');

const BACKOFF_PARAMS = { min: 1000, max: 300000, jitter: 0.1, factor: 1.5 };

class MpuHelper {
    constructor(service, options = {}) {
        this.service = service;
        this.backoffParams = {
            min: options.min || BACKOFF_PARAMS.min,
            max: options.max || BACKOFF_PARAMS.max,
            jitter: options.jitter || BACKOFF_PARAMS.jitter,
            factor: options.factor || BACKOFF_PARAMS.factor,
        };
    }

    _retry(fnName, params, callback) {
        const backoff = new Backoff(this.backoffParams);
        const handleFunc = (fnName, params, retry, callback) => {
            const timeout = backoff.duration();
            return setTimeout((params, cb) =>
                this.service[fnName](params, cb), timeout, params,
            (err, res) => {
                if (err) {
                    if (err.statusCode === 429 || err.code === 429) {
                        if (fnName === 'composeObject') {
                            logger.trace('composeObject: slow down request',
                                { retryCount: retry, timeout });
                        } else if (fnName === 'copyObject') {
                            logger.trace('copyObject: slow down request',
                                { retryCount: retry, timeout });
                        }
                        return handleFunc(
                            fnName, params, retry + 1, callback);
                    }
                    logHelper(logger, 'error', `${fnName} failed`, err);
                    return callback(err);
                }
                backoff.reset();
                return callback(null, res);
            });
        };
        handleFunc(fnName, params, 0, callback);
    }

    /**
     * retryCompose - exponential backoff retry implementation for the compose
     * operation
     * @param {object} params - compose object params
     * @param {function} callback - callback function to call with the result
     * of the compose operation
     * @return {undefined}
     */
    retryCompose(params, callback) {
        this._retry('composeObject', params, callback);
    }


    /**
     * retryCopy - exponential backoff retry implementation for the copy
     * operation
     * @param {object} params - copy object params
     * @param {function} callback - callback function to call with the result
     * of the copy operation
     * @return {undefined}
     */
    retryCopy(params, callback) {
        this._retry('copyObject', params, callback);
    }

    /**
     * splitMerge - breaks down the MPU list of parts to be compose on GCP;
     * splits partList into chunks of 32 objects, the limit of each compose
     * operation.
     * @param {object} params - complete MPU params
     * @param {string} params.Bucket - bucket name
     * @param {string} params.MPU - mpu bucket name
     * @param {string} params.Key - object key
     * @param {string} params.UploadId - MPU upload id
     * @param {object[]} partList - list of parts for complete multipart upload
     * @param {string} level - the phase name of the MPU process
     * @param {function} callback - the callback function to call
     * @return {undefined}
     */
    splitMerge(params, partList, level, callback) {
        // create composition of slices from the partList array
        return async.mapLimit(eachSlice.call(partList, 32),
            this.service._maxConcurrent,
            (infoParts, cb) => {
                const mpuPartList = infoParts.Parts.map(item =>
                    ({ PartName: item.PartName }));
                const partNumber = infoParts.PartNumber;
                const tmpKey =
                createMpuKey(params.Key, params.UploadId, partNumber, level);
                const mergedObject = { PartName: tmpKey };
                if (mpuPartList.length < 2) {
                    logger.trace(
                        'splitMerge: parts are fewer than 2, copy instead');
                    // else just perform a copy
                    const copyParams = {
                        Bucket: params.MPU,
                        Key: tmpKey,
                        CopySource: `${params.MPU}/${mpuPartList[0].PartName}`,
                    };
                    return this.service.copyObject(copyParams, (err, res) => {
                        if (err) {
                            logHelper(logger, 'error',
                                'error in splitMerge - copyObject', err);
                            return cb(err);
                        }
                        mergedObject.VersionId = res.VersionId;
                        mergedObject.ETag = res.ETag;
                        return cb(null, mergedObject);
                    });
                }
                const composeParams = {
                    Bucket: params.MPU,
                    Key: tmpKey,
                    MultipartUpload: { Parts: mpuPartList },
                };
                return this.retryCompose(composeParams, (err, res) => {
                    if (err) {
                        return cb(err);
                    }
                    mergedObject.VersionId = res.VersionId;
                    mergedObject.ETag = res.ETag;
                    return cb(null, mergedObject);
                });
            }, (err, res) => {
                if (err) {
                    return callback(err);
                }
                return callback(null, res.length);
            });
    }

    /**
     * removeParts - remove all objects created to perform a multipart upload
     * @param {object} params - remove parts params
     * @param {string} params.Bucket - bucket name
     * @param {string} params.MPU - mpu bucket name
     * @param {string} params.Key - object key
     * @param {string} params.UploadId - MPU upload id
     * @param {function} callback - callback function to call
     * @return {undefined}
     */
    removeParts(params, callback) {
        const _getObjectVersions = callback => {
            logger.trace('remove all parts from mpu bucket');
            let partsList = [];
            let isTruncated = true;
            let nextMarker;
            return async.whilst(() => isTruncated, next => {
                const listParams = {
                    Bucket: params.MPU,
                    Prefix: params.Prefix,
                    Marker: nextMarker,
                };
                return this.service.listVersions(listParams, (err, res) => {
                    if (err) {
                        logHelper(logger, 'error', 'error in ' +
                            'removeParts - listVersions', err);
                        return next(err);
                    }
                    nextMarker = res.NextMarker;
                    isTruncated = res.IsTruncated;
                    partsList = partsList.concat(res.Versions);
                    return next();
                });
            }, err => callback(err, partsList));
        };

        const _deleteObjects = (partsList, callback) => {
            logger.trace('successfully listed mpu parts', {
                objectCount: partsList.length,
            });
            return async.eachLimit(partsList, 10, (obj, next) => {
                const delParams = {
                    Bucket: params.MPU,
                    Key: obj.Key,
                    VersionId: obj.VersionId,
                };
                this.service.deleteObject(delParams, err => {
                    if (err) {
                        logHelper(logger, 'error',
                            'error deleting object', err);
                        return next(err);
                    }
                    return next();
                });
            }, err => callback(err));
        };

        return async.waterfall([
            _getObjectVersions,
            _deleteObjects,
        ], err => callback(err));
    }

    composeFinal(numParts, params, callback) {
        // final compose:
        // number of parts to compose <= 10
        // perform final compose in mpu bucket
        logger.trace('completeMultipartUpload: final compose');
        const parts = createMpuList(params, 'compose', numParts);
        const partList = parts.map(item => (
            { PartName: item.PartName }));
        if (partList.length < 2) {
            logger.trace(
                'fewer than 2 parts, skip to copy phase');
            return callback(null, partList[0].PartName);
        }
        const composeParams = {
            Bucket: params.MPU,
            Key: createMpuKey(params.Key, params.UploadId, 'final'),
            MultipartUpload: { Parts: partList },
        };
        return this.retryCompose(composeParams, err => {
            if (err) {
                return callback(err);
            }
            return callback(null, null);
        });
    }

    /*
     * Create MPU Aggregate ETag
     */
    generateMpuResult(res, partList, callback) {
        const partETags = partList.map(
            part => part.ETag.substring(1, part.ETag.length - 1));
        const aggregateETag = createAggregateETag(partETags);
        return callback(null, res, aggregateETag);
    }

    copyToMain(res, aggregateETag, params, callback) {
        // move object from mpu bucket into the main bucket
        // retrieve initial metadata then compose the object
        const copySource = res ||
            createMpuKey(params.Key, params.UploadId, 'final');
        return async.waterfall([
            next => {
                // retrieve metadata from init object in mpu bucket
                const headParams = {
                    Bucket: params.MPU,
                    Key: createMpuKey(params.Key, params.UploadId,
                        'init'),
                };
                logger.trace('retrieving object metadata');
                return this.service.headObject(headParams, (err, res) => {
                    if (err) {
                        logHelper(logger, 'error',
                            'error in createMultipartUpload - headObject',
                            err);
                        return next(err);
                    }
                    return next(null, res);
                });
            },
            (res, next) => {
                const metadata = res.Metadata;
                // copy the final object into the main bucket
                const copyMetadata = Object.assign({}, metadata);
                copyMetadata['scal-etag'] = aggregateETag;
                const copyParams = {
                    Bucket: params.Bucket,
                    Key: params.Key,
                    Metadata: copyMetadata,
                    MetadataDirective: 'REPLACE',
                    CopySource: `${params.MPU}/${copySource}`,
                    ContentType: res.ContentType,
                    CacheControl: res.CacheControl,
                    ContentEncoding: res.ContentEncoding,
                    ContentDisposition: res.ContentDisposition,
                    ContentLanguage: res.ContentLanguage,
                };
                logger.trace('copyParams', { copyParams });
                this.retryCopy(copyParams, (err, res) => {
                    if (err) {
                        logHelper(logger, 'error', 'error in ' +
                            'createMultipartUpload - final copyObject',
                        err);
                        return next(err);
                    }
                    const mpuResult = {
                        Bucket: params.Bucket,
                        Key: params.Key,
                        VersionId: res.VersionId,
                        ETag: `"${aggregateETag}"`,
                    };
                    return this.service.headObject({
                        Bucket: params.Bucket,
                        Key: params.Key,
                        VersionId: res.VersionId,
                    }, (err, res) => {
                        if (err) {
                            logHelper(logger, 'error', 'error in ' +
                                'createMultipartUpload - final head object',
                            err);
                            return next(err);
                        }
                        mpuResult.ContentLength = res.ContentLength;
                        return next(null, mpuResult);
                    });
                });
            },
        ], callback);
    }
}

module.exports = MpuHelper;
