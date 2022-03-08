import type { ServerResponse } from 'http';
import * as rawErrors from './arsenalErrors';
import * as types from './types';

export * from './types';

/** Mapping used to determine an error type. */
export type Is = { [Name in types.Name]: boolean };
/** Mapping of all possible Errors */
export type Errors = { [Property in keyof types.Names]: ArsenalError };


// This contains some metaprog. Be careful.
// Proxy can be found on MDN.
// https://developer.mozilla.org/en-US/docs/Web/JavaScript/Reference/Global_Objects/Proxy
const createIs = (type: types.Name) => {
    const get = (_: {}, value: string | symbol) => type === value;
    return new Proxy({}, { get }) as Is;
};

export class ArsenalError extends Error {
    /** HTTP status code. Example: 401, 403, 500, ... */
    #code: number;
    /** Text description of the error. */
    #description: string;
    /** Type of the error. Belongs to errors.types. */
    #type: types.Name;
    /** Object used to determine the error type.
     * Example: error.is.InternalError */
    #is: Is;

    private constructor(type: types.Name, code: number, description: string) {
        super(type);
        this.#code = code;
        this.#description = description;
        this.#type = type;
        this.#is = createIs(type);
    }

    /** Output the error as a JSON string */
    toString() {
        const errorType = this.message;
        const errorMessage = this.#description;
        return JSON.stringify({ errorType, errorMessage });
    }

    /** Write the error in an HTTP response */
    writeResponse(res: ServerResponse) {
        res.writeHead(this.#code);
        const asStr = this.toString();
        res.end(asStr);
    }

    /** Clone the error with a new description.*/
    customizeDescription(description: string): ArsenalError {
        const type = this.#type;
        const code = this.#code;
        return new ArsenalError(type, code, description);
    }

    get is() {
        return this.#is;
    }

    get code() {
        return this.#code;
    }

    get description() {
        return this.#description;
    }

    get type() {
        return this.#type;
    }

    /** Generate all possible errors. An instance is created by default. */
    static errors() {
        return Object.entries(rawErrors).reduce((acc, value) => {
            const name = value[0] as types.Name;
            const error = value[1];
            const { code, description } = error;
            const err = new ArsenalError(name, code, description);
            return { ...acc, [name]: err };
        }, {} as Errors);
    }
}

/** Mapping of all possible Errors.
 * Use them with errors[error].customizeDescription for any customization. */
const errors = ArsenalError.errors();

export default errors;
