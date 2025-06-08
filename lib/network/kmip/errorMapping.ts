import { errorInstances } from '../../errors';

/**
 * Format to map kmip error response to arsenal kms error
 *
 * ```json
 * {
 *   [resultStatus]: {
 *     [resultReason]: {
 *       [/resultMessage/]: arsenal_kms_error
 *     }
 *   }
 * }
 * ```
 * @see https://docs.oasis-open.org/kmip/spec/v1.4/errata01/os/kmip-spec-v1.4-errata01-os-redlined.html#_Toc490660974
 *
 * KMS has specific error codes, but KMIP resultReason is not enough
 * to map to KMS errors and resultMessage format is not enforced.
 * So for most errors we'll use Access Denied and include
 * the KMIP resultReason and resultMessage in description
 */
export const errorMapping = {
    'Operation Failed': {
        'Item Not Found':  errorInstances['KMS.NotFoundException'],
    }
};

/**
 * Produce a generic error message to return to client for kmip error
 * @param operation kmip operation
 * @param resource keyId or bucketName
 * @returns msg to use in error.customizeDescription
 */
export function kmipMsg(operation: string, resource: string | null | undefined, detail: string) {
    return `KMS (KMIP) error for ${operation}${resource ? ` on ${resource}` : ''}. ${detail || ''}`;
}
