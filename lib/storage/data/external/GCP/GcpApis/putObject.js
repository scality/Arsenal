const { PutObjectCommand } = require('@aws-sdk/client-s3');

const { getPutTagsMetadata, attachHeaderCaptureMiddleware } = require('../GcpUtils');

function putObject(params, callback) {
    const putParams = { ...params };
    putParams.Metadata = getPutTagsMetadata(putParams.Metadata, params.Tagging);
    delete putParams.Tagging;

    const command = new PutObjectCommand(putParams);

    let objectGeneration;
    attachHeaderCaptureMiddleware(
        command,
        'x-goog-generation',
        value => {
            if (value !== undefined) {
                objectGeneration = value;
            }
        },
        { middlewareName: 'captureGcpPutGeneration' }
    );

    return this.send(command)
        .then(data => {
            const result = { ...data };
            if (objectGeneration) {
                result.VersionId = objectGeneration;
            }
            if (callback) {
                return callback(null, result);
            }
            return result;
        })
        .catch(err => {
            if (callback) {
                return callback(err);
            }
            throw err;
        });
}

module.exports = putObject;
