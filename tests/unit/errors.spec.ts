import * as rawErrors from '../../lib/errors/arsenalErrors';
import { errors } from '../../index';
import { ArsenalError } from '../../lib/errors';

describe('Errors: ', () => {
    Object.entries(errors).forEach(([name, error]) => {
        const raw = rawErrors[name];
        it(`should return an instance of ${name} Error`, () => {
            expect(error).toBeInstanceOf(ArsenalError);
            expect(error).toBeInstanceOf(Error);
            expect(error).toMatchObject(raw);
            expect(error.is[name]).toBeTruthy();
        });
    });

    it('should allow custom error descriptions', () => {
        const error = errors.NoSuchEntity;
        const custom = error.customizeDescription('custom-description');
        const original = error.description;
        expect(errors.NoSuchEntity).toHaveProperty('description', original);
        expect(custom).toHaveProperty('description', 'custom-description');
        expect(custom.is).toHaveProperty('NoSuchEntity', true);
    });

    it('should allow additional metadata fields', () => {
        const error = errors.InvalidArgument;
        const originDescription = error.description;
        const origincode = error.code;
        const origintype = error.type; // InvalidArgument
        const custom = error.addMetadataEntry('fieldName', [{ key: 'value' }]);
        expect(custom.metadata.get('fieldName')).toEqual([{ key: 'value' }]);
        // Other properties should not change
        expect(custom.is[origintype]).toBeTruthy()
        expect(custom.description).toStrictEqual(originDescription);
        expect(custom.code).toStrictEqual(origincode);
        expect(custom.type).toStrictEqual(origintype);
        // The original error should not be modified
        expect(error.metadata.get('fieldName')).toBeUndefined()
    });

    it('can be used as an http response', () => {
        // @ts-expect-errors
        errors.NoSuchEntity.writeResponse({
            writeHead(statusCode: number) {
                expect(statusCode).toEqual(404);
                return this;
            },
            end(msg: any) {
                const asStr = errors.NoSuchEntity.toString();
                expect(msg).toEqual(asStr);
                return this;
            },
        });
    });
});

describe('Backward compatibility flag', () => {

    const env = process.env;

    beforeEach(() => {
        jest.resetModules();
        process.env = { ...env };
    });

    afterEach(() => {
        process.env = { ...env };
    })

    it('should be enabled when no env variable is present', () => {
        const errors = require('../../lib/errors');
        const err = errors.default.InternalError;
        expect(errors.allowUnsafeErrComp).toBe(true);
        expect(err.InternalError).toBe(true);
        expect(err.is.InternalError).toBe(true);
    });

    it('should be enabled when `true` is specified', () => {
        process.env = {
            ALLOW_UNSAFE_ERROR_COMPARISON: 'true',
            ...env
        };
        const errors = require('../../lib/errors');
        const err = errors.default.InternalError;
        expect(errors.allowUnsafeErrComp).toBe(true);
        expect(err.InternalError).toBe(true);
        expect(err.is.InternalError).toBe(true);
    });

    it('should be disabled when `false` is specified', () => {
        process.env = {
            ALLOW_UNSAFE_ERROR_COMPARISON: 'false',
            ...env
        };
        const errors = require('../../lib/errors');
        const err = errors.default.InternalError;
        expect(errors.allowUnsafeErrComp).toBe(false);
        expect(err).not.toHaveProperty(err.type);
        expect(err.is.InternalError).toBe(true);
    });

    it('should be disabled when `foo` is specified', () => {
        process.env = {
            ALLOW_UNSAFE_ERROR_COMPARISON: 'foo',
            ...env
        };
        const errors = require('../../lib/errors');
        const err = errors.default.InternalError;
        expect(errors.allowUnsafeErrComp).toBe(false);
        expect(err).not.toHaveProperty(err.type);
        expect(err.is.InternalError).toBe(true);
    });
});