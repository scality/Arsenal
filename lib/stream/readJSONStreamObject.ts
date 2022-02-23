import errors from '../errors';

/**
 * read a JSON object from a stream returned as a javascript object,
 * handle errors.
 *
 * @param {stream.Readable} s - Readable stream
 * @param {@hapi/joi} [joiSchema] - optional validation schema for the JSON object
 * @return {Promise} a Promise resolved with the parsed JSON object as a result
 */
export default async function readJSONStreamObject(s, joiSchema) {
    return new Promise((resolve, reject) => {
        const contentsChunks = [];
        s.on('data', chunk => {
            contentsChunks.push(chunk);
        });
        s.on('end', () => {
            const contents = contentsChunks.join('');
            try {
                const parsedContents = JSON.parse(contents);
                if (joiSchema) {
                    const { error, value } = joiSchema.validate(parsedContents);
                    if (error) {
                        throw error;
                    }
                    return resolve(value);
                }
                return resolve(parsedContents);
            } catch (err) {
                return reject(errors.InvalidArgument.customizeDescription(
                    `invalid input: ${err.message}`));
            }
        });
        s.once('error', reject);
    });
}
