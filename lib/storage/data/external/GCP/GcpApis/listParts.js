const errorInstances = require('../../../../../errors').errorInstances;
const { createMpuKey, logger } = require('../GcpUtils');
const { logHelper } = require('../../utils');
const { ListObjectsCommand } = require('@aws-sdk/client-s3');

/**
 * listParts - list uploaded MPU parts
 * @param {object} params - listParts param
 * @param {string} params.Bucket - bucket name
 * @param {string} params.Key - object key
 * @param {string} params.UploadId - MPU upload id
 * @param {function} callback - callback function to call with the list of parts
 * @return {undefined}
 */
function listParts(params, callback) {
    if (!params || !params.UploadId || !params.Bucket || !params.Key) {
        const error = errorInstances.InvalidRequest
            .customizeDescription('Missing required parameter');
        logHelper(logger, 'error', 'error in listParts', error);
        return callback(error);
    }
    if (params.PartNumberMarker && params.PartNumberMarker < 0) {
        return callback(errorInstances.InvalidArgument
            .customizeDescription('The request specified an invalid marker'));
    }
    const mpuParams = {
        Bucket: params.Bucket,
        Prefix: createMpuKey(params.Key, params.UploadId, 'parts'),
        Marker: createMpuKey(params.Key, params.UploadId,
            params.PartNumberMarker, 'parts'),
        MaxKeys: params.MaxParts,
    };
    const command = new ListObjectsCommand(mpuParams);
    return this.send(command)
        .then(res => callback(null, res))
        .catch(err => {
            logHelper(logger, 'error',
                'error in listParts - send(ListObjectsCommand)', err);
            callback(err);
        });
}

module.exports = listParts;
