import * as rawErrors from '../../lib/errors/arsenalErrors';
import { errors, errorInstances } from '../../index';
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

    it('can be used as an http response', () => {
        // @ts-expect-errors
        errorInstances.NoSuchEntity.writeResponse({
            writeHead(statusCode: number) {
                expect(statusCode).toEqual(404);
                return this;
            },
            end(msg: any) {
                const asStr = errorInstances.NoSuchEntity.toString();
                expect(msg).toEqual(asStr);
                return this;
            },
        });
    });

    it('errors.AccessDenied.is should be the same instance for perf', () => {
        const first = errors.AccessDenied;
        const second = errors.AccessDenied;
        expect(first).not.toBe(second);
        expect(first.is).toBe(second.is);
    })

    it ('errors.ok should return the same instance for perf', () => {
        const first = errors.ok;
        const second = errors.ok;
        expect(first).toBe(second);
        // don't modify instance, the use case is for errors.ok.[code | message]
        Error.captureStackTrace(first);
        // don't use stacktrace of ok error
        expect(first.stack).toEqual(second.stack);
    });

    it ('errorInstances should return the same instance for perf', () => {
        const first = errorInstances.AccessDenied;
        const second = errorInstances.AccessDenied;
        expect(first).toBe(second);
        // don't modify, the use case is for errorInstance.x.[customizeDescription | code | message]
        Error.captureStackTrace(first);
        // don't use errorInstances if you need stacktrace
        expect(first.stack).toEqual(second.stack);
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
