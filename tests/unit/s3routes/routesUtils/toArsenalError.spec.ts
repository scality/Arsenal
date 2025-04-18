import { ArsenalError, errorInstances } from '../../../../lib/errors';
import { toArsenalError } from '../../../../lib/s3routes/routesUtils';

describe('toArsenalError', () => {
    it('should return the same error if input is already an ArsenalError', () => {
        const originalError = errorInstances.NoSuchBucket;
        const result = toArsenalError(originalError);
        expect(result).toBe(originalError);
    });

    it('should use existing error instance if error message matches known error type', () => {
        const error = new Error('NoSuchBucket');
        const result = toArsenalError(error);
        expect(result).toBe(errorInstances.NoSuchBucket);
    });

    it('should wrap unknown error in InternalError with custom description', () => {
        const error = new Error('Unknown error occurred');
        const result = toArsenalError(error);
        expect(result).toBeInstanceOf(ArsenalError);
        expect(result.message).toBe('InternalError');
        expect(result.description).toBe('Unknown error occurred');
    });
});
