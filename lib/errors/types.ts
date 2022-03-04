import * as rawErrors from './arsenalErrors';

const entries = Object.keys(rawErrors).map((v) => [v, v]);

/** All possible errors. */
export type Name = keyof typeof rawErrors
/** Object containing all errors. It has the format [Name]: "Name" */
export type Names = { [Name_ in Name]: Name_ };

/** Use types with error.is(types.InternalError) to have nice autocomplete */
export const types: Names = Object.fromEntries(entries);
