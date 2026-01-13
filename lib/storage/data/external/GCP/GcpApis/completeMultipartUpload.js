const async = require('async');
const errors = require('../../../../../errors').default;
const errorInstances = require('../../../../../errors').errorInstances;
const MpuHelper = require('./mpuHelper');
const { createMpuKey, logger } = require('../GcpUtils');
const { logHelper } = require('../../utils');
/**
 * completeMPU - merges a list of parts into a single object
 * @param {object} params - completeMPU params
 * @param {string} params.Bucket - bucket name
 * @param {string} params.MPU - mpu bucket name
 * @param {string} params.Key - object key
 * @param {number} params.UploadId - MPU upload id
 * @param {Object} params.MultipartUpload - MPU upload object
 * @param {Object[]} param.MultipartUpload.Parts - a list of parts to merge
 * @param {function} callback - callback function to call with MPU result
 * @return {undefined}
 */
function completeMultipartUpload(params, callback) {
    if (!params || !params.MultipartUpload ||
        !params.MultipartUpload.Parts || !params.UploadId ||
        !params.Bucket || !params.Key) {
        const error = errorInstances.InvalidRequest
            .customizeDescription('Missing required parameter');
        logHelper(logger, 'error', 'error in completeMultipartUpload', error);
        return callback(error);
    }
    const partList = params.MultipartUpload.Parts;
    if (partList.length === 0) {
        const error = errorInstances.InvalidRequest
            .customizeDescription('You must specify at least one part');
        logHelper(logger, 'error', 'error in completeMultipartUpload', error);
        return callback(error);
    }
    for (let ind = 1; ind < partList.length; ++ind) {
        if (partList[ind - 1].PartNumber >= partList[ind].PartNumber) {
        logHelper(logger, 'error', 'error in completeMultipartUpload',
            errors.InvalidPartOrder);
        return callback(errors.InvalidPartOrder);
        }
    }
    const mpuHelper = new MpuHelper(this);
    return async.waterfall([
        next => mpuHelper.splitMerge(params, partList, 'compose', next),
        (numParts, next) => {
            // eslint-disable-next-line no-console
            console.log('Number of parts to compose:', numParts);
            mpuHelper.composeFinal(numParts, params, next);
        },
        (result, next) => {
            // eslint-disable-next-line no-console
            console.log('Generating MPU result', result);
            mpuHelper.generateMpuResult(result, partList, next);
        },
        (result, aggregateETag, next) => {
            // eslint-disable-next-line no-console
            console.log('Copying to main object', result);
            mpuHelper.copyToMain(result, aggregateETag, params, next);
        },
        (mpuResult, next) => {
            // eslint-disable-next-line no-console
            console.log('Removing parts', mpuResult);
            const delParams = {
                Bucket: params.Bucket,
                MPU: params.MPU,
                Prefix: createMpuKey(params.Key, params.UploadId),
            };
            mpuHelper.removeParts(delParams, err => {
                // eslint-disable-next-line no-console
                console.log('Removing parts complete', err);
                next(err, mpuResult);
            });
        },
    ], (err, result) => {
        callback(err, result);
    });
}

module.exports = completeMultipartUpload;
