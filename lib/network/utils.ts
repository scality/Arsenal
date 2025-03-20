import { errorInstances } from '../errors';

/**
 * Normalize errors according to arsenal definitions with a custom prefix
 * @param err - an Error instance or a message string
 * @param messagePrefix - prefix for the error message
 * @returns - arsenal error
 */
function _normalizeArsenalError(err: string | Error, messagePrefix: string) {
    if (typeof err === 'string') {
        return errorInstances.InternalError
            .customizeDescription(`${messagePrefix} ${err}`);
    } else if (
        err instanceof Error ||
        // INFO: The second part is here only for Jest, to remove when we'll be
        //   fully migrated to TS
        // @ts-expect-error
        (err && typeof err.message === 'string')
    ) {
        return errorInstances.InternalError
            .customizeDescription(`${messagePrefix} ${err.message}`);
    }
    return errorInstances.InternalError
        .customizeDescription(`${messagePrefix} Unspecified error`);
}

export function arsenalErrorKMIP(err: string | Error) {
    return _normalizeArsenalError(err, 'KMIP:');
}

export function arsenalErrorAWSKMS(err: string | Error) {
    return _normalizeArsenalError(err, 'AWS_KMS:');
}
