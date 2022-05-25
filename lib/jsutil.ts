import * as util from 'util';
const debug = util.debuglog('jsutil');

// JavaScript utility functions

/**
 * force <tt>func</tt> to be called only once, even if actually called
 * multiple times. The cached result of the first call is then
 * returned (if any).
 *
 * @note underscore.js provides this functionality but not worth
 * adding a new dependency for such a small use case.
 *
 * @param func function to call at most once

 * @return a callable wrapper mirroring <tt>func</tt> but
 * only calls <tt>func</tt> at first invocation.
 */
export function once<T>(func: (...args: any[]) => T): (...args: any[]) => T {
    type State = { called: boolean; res: any };
    const state: State = { called: false, res: undefined };
    return function wrapper(...args: any[]) {
        if (!state.called) {
            state.called = true;
            state.res = func.apply(func, args);
        } else {
            const m1 = 'function already called:';
            const m2 = 'returning cached result:';
            debug(m1, func, m2, state.res);
        }
        return state.res;
    };
}
