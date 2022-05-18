import errors from '../errors';
import * as stream from 'stream';
import joi from 'joi';

/**
 * read a JSON object from a stream returned as a javascript object,
 * handle errors.
 *
 * @param s - Readable stream
 * @param [joiSchema] - optional validation schema for the JSON object
 * @return a Promise resolved with the parsed JSON object as a result
 */
export default async function readJSONStreamObject<Data = any>(
    s: stream.Readable,
    joiSchema?: joi.Schema<Data>
): Promise<Data> {
    return new Promise((resolve, reject) => {
        const contentsChunks: any = [];
        s.on('data', (chunk) => contentsChunks.push(chunk));
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
            } catch (err: any) {
                return reject(
                    errors.InvalidArgument.customizeDescription(
                        `invalid input: ${err.message}`
                    )
                );
            }
        });
        s.once('error', reject);
    });
}
