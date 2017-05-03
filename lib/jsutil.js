'use strict'; // eslint-disable-line

const debug = require('util').debuglog('jsutil');

// JavaScript utility functions

/**
 * force <tt>func</tt> to be called only once, even if actually called
 * multiple times. The cached result of the first call is then
 * returned (if any).
 *
 * @note underscore.js provides this functionality but not worth
 * adding a new dependency for such a small use case.
 *
 * @param {function} func function to call at most once

 * @return {function} a callable wrapper mirroring <tt>func</tt> but
 * only calls <tt>func</tt> at first invocation.
 */
module.exports.once = function once(func) {
    const state = { called: false, res: undefined };
    return function wrapper(...args) {
        if (!state.called) {
            state.called = true;
            state.res = func.apply(func, args);
        } else {
            debug('function already called:', func,
                  'returning cached result:', state.res);
        }
        return state.res;
    };
};
