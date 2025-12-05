const { PutObjectCommand } = require('@aws-sdk/client-s3');

const { getPutTagsMetadata, getHeaderCaseInsensitive } = require('../GcpUtils');

function putObject(params, callback) {
    const putParams = { ...params };
    putParams.Metadata = getPutTagsMetadata(putParams.Metadata, params.Tagging);
    delete putParams.Tagging;

    const command = new PutObjectCommand(putParams);

    let objectGeneration;
    command.middlewareStack.add(
        next => async args => {
            const result = await next(args);
            const generationHeader = getHeaderCaseInsensitive(
                result.response?.headers,
                'x-goog-generation'
            );
            if (generationHeader !== undefined) {
                objectGeneration = generationHeader;
            }
            return result;
        },
        {
            step: 'deserialize',
            name: 'captureGcpHeaders',
        }
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
