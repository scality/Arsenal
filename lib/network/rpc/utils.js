'use strict'; // eslint-disable-line

/**
 * @brief turn all <tt>err</tt> own and prototype attributes into own attributes
 *
 * This is done so that JSON.stringify() can properly serialize those
 * attributes (e.g. err.notFound)
 *
 * @param {Error} err error object
 * @return {Object} flattened object containing <tt>err</tt> attributes
 */
module.exports.flattenError = function flattenError(err) {
    if (!err) {
        return err;
    }
    const flattenedErr = {};

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
 * @param {Object} err flattened error object
 * @return {Error} a reconstructed Error object inheriting <tt>err</tt>
 *   attributes
 */
module.exports.reconstructError = function reconstructError(err) {
    if (!err) {
        return err;
    }
    const reconstructedErr = new Error(err.message);

    Object.keys(err).forEach(k => {
        reconstructedErr[k] = err[k];
    });
    return reconstructedErr;
};
