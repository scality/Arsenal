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
