const assert = require('assert');
const {
    SCAL_KMS_ARN,
    KmsType,
    KmsProtocol,
    makeScalityArnPrefix,
    makeBackend,
    isScalityKmsArn,
    getKeyIdFromArn,
    isValidType,
    isValidProtocol,
    isValidProvider,
    validateKeyDetail,
    extractDetailFromArn,
} = require('../../../lib/network/KMSInterface');

const awsArn = 'arn:aws:kms:us-west-2:111122223333:key/1234abcd-12ab-34cd-56ef-1234567890ab';

describe('KMSInterface', () => {
    const backends = [
        { type: KmsType.internal, protocol: KmsProtocol.mem, provider: 'mtests' },
        { type: KmsType.internal, protocol: KmsProtocol.file, provider: 'ftests' },
        { type: KmsType.external, protocol: KmsProtocol.scality, provider: 'safenet' },
        { type: KmsType.external, protocol: KmsProtocol.kmip, provider: 'ktests' },
        { type: KmsType.external, protocol: KmsProtocol.aws_kms, provider: 'atests' },
        { type: KmsType.external, protocol: KmsProtocol.aws_kms, provider: 'aws', key: awsArn },
    ];

    describe('makeScalityArnPrefix', () => {
        backends.forEach(({ type, protocol, provider }) => it(
            `should succeed for ${type}:${protocol}:${provider}`, () => {
                const res = makeScalityArnPrefix(type, protocol, provider);
                assert.strictEqual(res, `${SCAL_KMS_ARN}${type}:${protocol}:${provider}:key/`);
            }));
    });

    describe('makeBackend', () => {
        backends.forEach(({ type, protocol, provider }) => it(
            `should succeed for ${type}:${protocol}:${provider}`, () => {
                const res = makeBackend(type, protocol, provider);
                assert.strictEqual(res.type, type);
                assert.strictEqual(res.protocol, protocol);
                assert.strictEqual(res.provider, provider);
                assert.strictEqual(res.arnPrefix, `${SCAL_KMS_ARN}${type}:${protocol}:${provider}:key/`);
            }));
    });

    describe('isScalityKmsArn', () => {
        backends.forEach(({ type, protocol, provider, key }) => it(
            `should return true for ${type}:${protocol}:${provider}`, () => {
                const arn = `${makeScalityArnPrefix(type, protocol, provider)}${key || '12345'}`;
                const res = isScalityKmsArn(arn);
                assert.strictEqual(res, true);
            }));

        it('should return false for non arn', () => {
            assert.strictEqual(isScalityKmsArn('12345'), false);
        });
        it('should return false for aws arn', () => {
            assert.strictEqual(isScalityKmsArn(awsArn), false);
        });
    });

    describe('getKeyIdFromArn', () => {
        backends.forEach(({ type, protocol, provider, key }) => it(
            `should return KeyId for ${type}:${protocol}:${provider}`, () => {
                const arn = `${makeScalityArnPrefix(type, protocol, provider)}${key || '12345'}`;
                const res = getKeyIdFromArn(arn);
                assert.strictEqual(res, key || '12345');
            }));

        it('should return KeyId for non arn', () => {
            assert.strictEqual(getKeyIdFromArn('12345'), '12345');
        });
        it('should return aws arn', () => {
            assert.strictEqual(getKeyIdFromArn(awsArn), awsArn);
        });
    });

    describe('isValidType', () => {
        it('should return true for internal', () => assert.strictEqual(isValidType(KmsType.internal), true));
        it('should return true for external', () => assert.strictEqual(isValidType(KmsType.external), true));
        it('should return false for anything', () => assert.strictEqual(isValidType('nope'), false));
    });

    describe('isValidProtocol', () => {
        backends.forEach(({ type, protocol, provider }) => it(
            `should return true for ${type}:${protocol}:${provider}`, () => {
                assert.strictEqual(isValidProtocol(type, protocol), true);
            }));

        it('should return false for mismatching type and protocol', () => {
            assert.strictEqual(isValidProtocol(KmsType.internal, KmsProtocol.kmip), false);
        });
        it('should return false for bad protocol', () => {
            assert.strictEqual(isValidProtocol(KmsType.internal, 'bad protocol'), false);
        });
        it('should return false for bad type', () => {
            assert.strictEqual(isValidProtocol('bad type', KmsProtocol.file), false);
        });
    });

    describe('isValidProvider', () => {
        it('should return true for lowercase alphanumeric', () => {
            assert.strictEqual(isValidProvider('scality01'), true);
        });
        it('should return false not lowercase alphanumeric', () => {
            assert.strictEqual(isValidProvider('A BAD PROVIDER !!!'), false);
        });
    });

    describe('extractDetailFromArn', () => {
        backends.forEach(({ type, protocol, provider, key }) => it(
            `should return detail for ${type}:${protocol}:${provider}`, () => {
                const arn = `${makeScalityArnPrefix(type, protocol, provider)}${key || '12345'}`;
                const detail = extractDetailFromArn(arn);

                assert.strictEqual(detail.type, type);
                assert.strictEqual(detail.protocol, protocol);
                assert.strictEqual(detail.provider, provider);
                assert.strictEqual(detail.arnType, 'key');
                assert.strictEqual(detail.id, key || '12345');
            }));

        it('should return only id for non arn', () => {
            const detail = extractDetailFromArn('12345');

            assert.strictEqual(detail.type, undefined);
            assert.strictEqual(detail.protocol, undefined);
            assert.strictEqual(detail.provider, undefined);
            assert.strictEqual(detail.arnType, undefined);
            assert.strictEqual(detail.id, '12345');
        });

        it('should return only id (aws arn) for aws arn', () => {
            const detail = extractDetailFromArn(awsArn);

            assert.strictEqual(detail.type, undefined);
            assert.strictEqual(detail.protocol, undefined);
            assert.strictEqual(detail.provider, undefined);
            assert.strictEqual(detail.arnType, undefined);
            assert.strictEqual(detail.id, awsArn);
        });
    });

    describe('validateKeyDetail', () => {
        backends.forEach(({ type, protocol, provider, key }) => it(
            `should return no error ${type}:${protocol}:${provider}`, () => {
                const arn = `${makeScalityArnPrefix(type, protocol, provider)}${key || '12345'}`;
                const detail = extractDetailFromArn(arn);
                const backend = makeBackend(type, protocol, provider);

                assert.strictEqual(validateKeyDetail(detail, [backend]), null);
            }));

        it('should return an error for non arn key', () => {
            const b1 = backends[1];
            const detail = extractDetailFromArn('12345');
            const backend = makeBackend(b1.type, b1.protocol, b1.provider);

            const err = validateKeyDetail(detail, [backend]);
            assert.notStrictEqual(err, null);
            assert.strictEqual(err.InvalidArgument, true);
            assert.strictEqual(err.description,
                `KMS Scality KeyArn doesn\'t match any configured providers. Possible arn are: \"${
                    backend.arnPrefix}\"`,
            );
        });

        it('should return an error for aws arn', () => {
            const b1 = backends[1];
            const detail = extractDetailFromArn(awsArn);
            const backend = makeBackend(b1.type, b1.protocol, b1.provider);

            const err = validateKeyDetail(detail, [backend]);
            assert.notStrictEqual(err, null);
            assert.strictEqual(err.InvalidArgument, true);
            assert.strictEqual(err.description,
                `KMS Scality KeyArn doesn\'t match any configured providers. Possible arn are: \"${
                    backend.arnPrefix}\"`,
            );
        });

        it('should return an error for mismatching key and provider', () => {
            const b0 = backends[0];
            const b1 = backends[1];
            const arn = `${makeScalityArnPrefix(b0.type, b0.protocol, b0.provider)}12345`;
            const detail = extractDetailFromArn(arn);
            const backend = makeBackend(b1.type, b1.protocol, b1.provider);

            const err = validateKeyDetail(detail, [backend]);
            assert.notStrictEqual(err, null);
            assert.strictEqual(err.InvalidArgument, true);
            assert.strictEqual(err.description,
                `KMS Scality KeyArn doesn\'t match any configured providers. Possible arn are: \"${
                    backend.arnPrefix}\"`,
            );
        });

        it('should return an error for invalid arnType', () => {
            const b0 = backends[0];
            const arn = `${SCAL_KMS_ARN}${b0.type}:${b0.protocol}:${b0.provider}:wrongResourceType/1234`;
            const detail = extractDetailFromArn(arn);
            const backend = makeBackend(b0.type, b0.protocol, b0.provider);

            const err = validateKeyDetail(detail, [backend]);
            assert.notStrictEqual(err, null);
            assert.strictEqual(err.InvalidArgument, true);
            assert.strictEqual(err.description,
                'Invalid KMS Scality KeyArn, expected "key" instead of "wrongResourceType"');
        });

        it('should return an error for missing KeyId after arnPrefix', () => {
            const b0 = backends[0];
            const arn = `${SCAL_KMS_ARN}${b0.type}:${b0.protocol}:${b0.provider}:key/`;
            const detail = extractDetailFromArn(arn);
            const backend = makeBackend(b0.type, b0.protocol, b0.provider);

            const err = validateKeyDetail(detail, [backend]);
            assert.notStrictEqual(err, null);
            assert.strictEqual(err.InvalidArgument, true);
            assert.strictEqual(err.description, 'Invalid KMS Scality KeyArn, missing KeyId');
        });
    });
});
