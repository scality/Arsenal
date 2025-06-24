/**
 * List of AWS KMS errors that are specific to KMS and where the error
 * can be returned to the user as is with a specific status code.
 *
 * Avoid any error that might leak sensitive information such as hostnames
 * or IP addresses from network related errors.
 * KeyId is not considered sensitive.
 * 
 * Reference: https://docs.aws.amazon.com/kms/latest/APIReference/CommonErrors.html
 * See specific actions like CreateKey, Encrypt, Decrypt, etc. for more details.
 * 
 * Other errors not listed will return only the same error code but HTTP status 500,
 * and message will be generic and details will be in logs only.
 */
export const allowedKmsErrors = {
    AccessDeniedException: {
        code: 400,
        description: 'You do not have sufficient access to perform this action.',
    },
    AlreadyExistsException: {
        code: 400,
        description: 'The request was rejected because it attempted to create a resource that already exists.',
    },
    DisabledException: {
        code: 400,
        description: 'The request was rejected because the specified KMS key is not enabled.',
    },
    IncorrectKeyException: {
        code: 400,
        description: 'The request was rejected because the specified KMS key cannot decrypt the data',
    },
    InvalidAliasNameException: {
        code: 400,
        description: 'The request was rejected because the specified alias name is not valid.',
    },
    InvalidArnException: {
        code: 400,
        description: 'The request was rejected because a specified ARN, or an ARN in a key policy, is not valid.',
    },
    InvalidCiphertextException: {
        code: 400,
        description: 'The request was rejected because the specified ciphertext, or additional authenticated data, ' +
            'is corrupted, missing, or otherwise invalid.',
    },
    InvalidGrantTokenException: {
        code: 400,
        description: 'The request was rejected because the specified grant token is not valid.',
    },
    InvalidKeyUsageException: {
        code: 400,
        description: 'The KeyUsage or algorithm  is incompatible with the API operation.',
    },
    KMSInternalException: {
        code: 500,
        description: 'The request was rejected because an internal exception occurred. The request can be retried.',
    },
    KMSInvalidStateException: {
        code: 400,
        description:
            'The request was rejected because the state of the specified resource is not valid for this request.',
    },
    KeyUnavailableException: {
        code: 500,
        description: 'The request was rejected because the specified KMS key was not available. ' +
            'You can retry the request.',
    },
    LimitExceededException: {
        code: 400,
        description: 'The request was rejected because a length constraint or quota was exceeded.',
    },
    MalformedPolicyDocumentException: {
        code: 400,
        description:
            'The request was rejected because the specified policy is not syntactically or semantically correct.',
    },
    /** Not 404 because it's the KMS (Encrypt/Decrypt) that fails, not the object API */
    NotFoundException: {
        code: 400,
        description: 'The request was rejected because the specified entity or resource could not be found.',
    },
    TagException: {
        code: 400,
        description: 'The request was rejected because one or more tags are not valid.',
    },
    UnsupportedOperationException: {
        code: 400,
        description: 'The request was rejected because a specified parameter is not supported or a specified ' +
            'resource is not valid for this operation.',
    },
} as const;
