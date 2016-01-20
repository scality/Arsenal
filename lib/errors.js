import S3ERRORS from './s3Errors.json';

export function errorWithCode(errorTitle, details = undefined) {
    const error = new Error(S3ERRORS[errorTitle].description);
    error[errorTitle] = true;
    error.code = S3ERRORS[errorTitle].httpCode;
    if (details !== undefined)
        error.details = details;
    return error;
}

/**
 * Like Error, but with a property set to true.
 * TODO: this is copied from kineticlib, should consolidate
 *
 * Example: instead of:
 *     const err = new Error("input is not a buffer");
 *     err.badTypeInput = true;
 *     throw err;
 * use:
 *     throw propError("badTypeInput", "input is not a buffer");
 *
 * @param {String} propName - the property name.
 * @param {String} message - the Error message.
 * @returns {Error} the Error object.
 */
export function propError(propName, message) {
    const err = new Error(message);
    err[propName] = true;
    return err;
}
