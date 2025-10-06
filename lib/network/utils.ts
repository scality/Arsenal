import { ArsenalError, errorInstances } from '../errors';
import { allowedKmsErrors } from '../errors/kmsErrors';

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

const allowedKmsErrorCodes = Object.keys(allowedKmsErrors) as unknown as (keyof typeof allowedKmsErrors)[];

// Local AWSError type for compatibility with v3 error handling
export type AWSError = Error & {
    name?: string;
    $fault?: 'client' | 'server';
    $metadata?: {
        httpStatusCode?: number;
        requestId?: string;
        attempts?: number;
        totalRetryDelay?: number;
    };
    $retryable?: {
        throttling?: boolean;
    };
    message?: string;
};

function isAWSError(err: string | Error | AWSError): err is AWSError {
    return (err as AWSError).name !== undefined
        && (err as AWSError).$metadata !== undefined;
}

export function arsenalErrorAWSKMS(err: string | Error | AWSError) {
    if (isAWSError(err)) {
        const errorCode = err.name;
        if (allowedKmsErrorCodes.includes(errorCode as keyof typeof allowedKmsErrors)) {
            return errorInstances[`KMS.${errorCode}`].customizeDescription(err.message);
        } else {
            // Encapsulate into a generic ArsenalError but keep the aws error code
            return ArsenalError.unflatten({
                is_arsenal_error: true,
                type: `KMS.${errorCode}`, // aws s3 prefix kms errors with KMS.
                code: 500,
                description: `unexpected AWS_KMS error`,
                stack: err.stack,
            });
        }
    }
    return _normalizeArsenalError(err, 'AWS_KMS:');
}
