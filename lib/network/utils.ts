import { ArsenalError, errorInstances } from '../errors';
import { allowedKmsErrors } from '../errors/kmsErrors';
import { S3ServiceException } from '@aws-sdk/client-s3';
import { KMSServiceException } from '@aws-sdk/client-kms';

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

type AwsSdkError = (S3ServiceException | KMSServiceException | (Error & {
    name: string;
    $metadata?: { [key: string]: unknown };
}));

function getAwsErrorCode(err: unknown): string | undefined {
    if (err instanceof S3ServiceException || err instanceof KMSServiceException) {
        return err.name;
    }

    if (err instanceof Error && typeof err.name === 'string') {
        // AWS SDK v3 errors inherit from Error but are not always instances of the
        // exported Exception classes once they cross async boundaries.
        // They still expose metadata markers such as `$metadata` and an error `name`.
        const maybeAwsMetadata = (err as AwsSdkError).$metadata;
        if (maybeAwsMetadata && typeof maybeAwsMetadata === 'object') {
            return err.name;
        }

        if (allowedKmsErrorCodes.includes(err.name as keyof typeof allowedKmsErrors)) {
            return err.name;
        }
    }

    return undefined;
}

export function arsenalErrorAWSKMS(err: string | Error | S3ServiceException) {
    const awsErrorCode = getAwsErrorCode(err);

    if (awsErrorCode) {
        const errorCode = awsErrorCode;
        const errorMessage = err instanceof Error ? err.message : String(err);

        if (allowedKmsErrorCodes.includes(errorCode as keyof typeof allowedKmsErrors)) {
            return errorInstances[`KMS.${errorCode}`].customizeDescription(errorMessage);
        } else {
            // Encapsulate into a generic ArsenalError but keep the aws error code
            return ArsenalError.unflatten({
                is_arsenal_error: true,
                type: `KMS.${errorCode}`, // aws s3 prefix kms errors with KMS.
                code: 500,
                description: `unexpected AWS_KMS error`,
                stack: err instanceof Error ? err.stack : undefined,
            });
        }
    }
    return _normalizeArsenalError(err, 'AWS_KMS:');
}
