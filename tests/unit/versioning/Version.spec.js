/* eslint-disable @typescript-eslint/no-require-imports */
const { Version } = require('../../../lib/versioning/Version');

describe('Version', () => {
    describe('_jsonAppend', () => {
        it('should append key-value pair to an empty object', () => {
            const result = Version._jsonAppend('{}', 'versionId', '123');
            expect(result).toBe('{"versionId":"123"}');
        });

        it('should append key-value pair to an object with existing properties', () => {
            const result = Version._jsonAppend('{"existingKey":"existingValue"}', 'versionId', '123');
            expect(result).toBe('{"existingKey":"existingValue","versionId":"123"}');
        });

        it('should append key-value pair to an object with existing key', () => {
            const result = Version._jsonAppend('{"versionId":"0"}', 'versionId', '123');
            expect(result).toBe('{"versionId":"0","versionId":"123"}');
        });
    });

    describe('appendVersionId', () => {
        it('should append versionId to an empty object', () => {
            const emptyObject = '{}';
            const versionId = '123';
            const expected = '{"versionId":"123"}';
            const result = Version.appendVersionId(emptyObject, versionId);
            expect(result).toEqual(expected);
        });

        it('should append versionId to an object with existing properties', () => {
            const existingObject = '{"key":"value"}';
            const versionId = '456';
            const expected = '{"key":"value","versionId":"456"}';
            const result = Version.appendVersionId(existingObject, versionId);
            expect(result).toEqual(expected);
        });

        it('should append versionId to an object with existing versionId', () => {
            const objectWithVersionId = '{"key":"value","versionId":"old"}';
            const versionId = 'new';
            const expected = '{"key":"value","versionId":"old","versionId":"new"}';
            const result = Version.appendVersionId(objectWithVersionId, versionId);
            expect(result).toEqual(expected);
        });
    });

    describe('updateOrAppendNullVersionId', () => {
        it('should append nullVersionId when it does not exist', () => {
            const initialValue = '{"key":"value"}';
            const nullVersionId = '12345';
            const expectedValue = '{"key":"value","nullVersionId":"12345"}';
            const result = Version.updateOrAppendNullVersionId(initialValue, nullVersionId);
            expect(result).toEqual(expectedValue);
        });

        it('should update nullVersionId when it exists', () => {
            const initialValue = '{"key":"value","nullVersionId":"initial"}';
            const nullVersionId = 'updated12345';
            const expectedValue = '{"key":"value","nullVersionId":"updated12345"}';
            const result = Version.updateOrAppendNullVersionId(initialValue, nullVersionId);
            expect(result).toEqual(expectedValue);
        });

        it('should handle empty string by appending nullVersionId', () => {
            const initialValue = '{}';
            const nullVersionId = 'emptyCase12345';
            const expectedValue = '{"nullVersionId":"emptyCase12345"}';
            const result = Version.updateOrAppendNullVersionId(initialValue, nullVersionId);
            expect(result).toEqual(expectedValue);
        });
    });
});
