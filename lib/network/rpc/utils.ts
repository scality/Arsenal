import { ArsenalError, allowUnsafeErrComp } from '../../errors';

 // eslint-disable-line

/**
 * @brief turn all <tt>err</tt> own and prototype attributes into own attributes
 *
 * This is done so that JSON.stringify() can properly serialize those
 * attributes (e.g. err.notFound)
 *
 * @param err error object
 * @return flattened object containing <tt>err</tt> attributes
 */
export function flattenError(err: Error) {
    if (!err) {
        return err;
    }

    if (err instanceof ArsenalError) {
        return err.flatten();
    }

    const flattenedErr = {};

    // TODO fix this
    // @ts-expect-errors
    flattenedErr.message = err.message;
    for (const k in err) {
        if (!(k in flattenedErr)) {
            flattenedErr[k] = err[k];
        }
    }
    return flattenedErr;
};

/**
 * @brief recreate a proper Error object from its flattened
 * representation created with flattenError().
 *
 * @note Its internals may differ from the original Error object but
 * its attributes should be the same.
 *
 * @param err flattened error object
 * @return a reconstructed Error object inheriting <tt>err</tt>
 *   attributes
 */
export function reconstructError(err: Error) {
    if (!err) {
        return err;
    }

    const arsenalFlat = ArsenalError.unflatten(err);
    if (arsenalFlat !== null) {
        return arsenalFlat;
    }

    const reconstructedErr = new Error(err.message);
    // This restores the old behavior of errors. This should be removed as soon
    // as all dependent codebases have been migrated to `is` accessors (ARSN-176).
    reconstructedErr[err.message] = true;
    if (allowUnsafeErrComp){
        // @ts-expect-error
        reconstructedErr.is = { [err.message]: true };
    }
    Object.keys(err).forEach(k => {
        reconstructedErr[k] = err[k];
    });
    return reconstructedErr;
};
