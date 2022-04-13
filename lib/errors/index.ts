import type { ServerResponse } from 'http';
import * as rawErrors from './arsenalErrors';

/** All possible errors names. */
export type Name = keyof typeof rawErrors
/** Object containing all errors names. It has the format { [Name]: "Name" } */
export type Names = { [Name_ in Name]: Name_ };
/** Mapping used to determine an error type. It has the format { [Name]: boolean } */
export type Is = { [_ in Name]: boolean };
/** Mapping of all possible Errors. It has the format { [Name]: Error } */
export type Errors = { [_ in Name]: ArsenalError };

// This contains some metaprog. Be careful.
// Proxy can be found on MDN.
// https://developer.mozilla.org/en-US/docs/Web/JavaScript/Reference/Global_Objects/Proxy
// While this could seems better to avoid metaprog, this allows us to enforce
// type-checking properly while avoiding all errors that could happen at runtime.
const createIs = (type: Name) => {
    const get = (_: {}, value: string | symbol) => type === value;
    return new Proxy({}, { get }) as Is;
};

export class ArsenalError extends Error {
    /** HTTP status code. Example: 401, 403, 500, ... */
    #code: number;
    /** Text description of the error. */
    #description: string;
    /** Type of the error. */
    #type: Name;
    /** Object used to determine the error type.
     * Example: error.is.InternalError */
    #is: Is;

    private constructor(type: Name, code: number, description: string) {
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

    /** Used to determine the error type. Example: error.is.InternalError */
    get is() {
        return this.#is;
    }

    /** HTTP status code. Example: 401, 403, 500, ... */
    get code() {
        return this.#code;
    }

    /** Text description of the error. */
    get description() {
        return this.#description;
    }

    /**
     * Type of the error, belonging to Name. is should be prefered instead of
     * type in a daily-basis, but type remains accessible for future use. */
    get type() {
        return this.#type;
    }

    /** Generate all possible errors. An instance is created by default. */
    static errors() {
        const errors = {}
        Object.entries(rawErrors).forEach((value) => {
            const name = value[0] as Name;
            const error = value[1];
            const { code, description } = error;
            const get = () => new ArsenalError(name, code, description);
            Object.defineProperty(errors, name, { get });
        });
        return errors as Errors
    }
}

/** Mapping of all possible Errors.
 * Use them with errors[error].customizeDescription for any customization. */
export default ArsenalError.errors();
