import type { ServerResponse } from 'http';
import * as rawErrors from './arsenalErrors';

/** All possible errors names. */
export type Name = keyof typeof rawErrors;
/** Object containing all errors names. It has the format { [Name]: "Name" } */
export type Names = { [Name_ in Name]: Name_ };
/** Mapping used to determine an error type. It has the format { [Name]: boolean } */
export type Is = { [_ in Name]: boolean };
/** Mapping of all possible Errors. It has the format { [Name]: Error } */
export type Errors = { [_ in Name]: ArsenalError };

// This object is reused constantly through createIs, we store it there
// to avoid recomputation.
const isBase = Object.fromEntries(
    Object.keys(rawErrors).map((key) => [key, false])
) as Is;

// This contains some metaprog. Be careful.
// Proxy can be found on MDN.
// https://developer.mozilla.org/en-US/docs/Web/JavaScript/Reference/Global_Objects/Proxy
// While this could seems better to avoid metaprog, this allows us to enforce
// type-checking properly while avoiding all errors that could happen at runtime.
// Even if some errors are made in JavaScript, like using err.is.NonExistingError,
// the Proxy will return false.
const createIs = (type: Name): Is => {
    const get = (is: Is, value: string | symbol) => is[value] ?? false;
    const final = Object.freeze({ ...isBase, [type]: true });
    return new Proxy(final, { get });
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
    /** A map of error metadata (can be extra fields
     * that only show in debug mode) */
    #metadata: Map<string, Object[]>;

    private constructor(type: Name, code: number, description: string,
        metadata?: Map<string, Object[]>) {
        super(type);
        this.#code = code;
        this.#description = description;
        this.#type = type;
        this.#is = createIs(type);
        this.#metadata = metadata ?? new Map<string, Object[]>();
    }

    /** Output the error as a JSON string */
    toString() {
        const errorType = this.message;
        const errorMessage = this.#description;
        return JSON.stringify({ errorType, errorMessage });
    }

    flatten() {
        return {
            is_arsenal_error: true,
            code: this.#code,
            description: this.#description,
            type: this.#type,
            stack: this.stack
        }
    }

    static unflatten(flat_obj) {
        if (!flat_obj.is_arsenal_error) {
            return null;
        }

        const err = new ArsenalError(
            flat_obj.type,
            flat_obj.code,
            flat_obj.description
        )
        err.stack = flat_obj.stack
        return err;
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
        const metadata = new Map(this.#metadata);
        const err = new ArsenalError(type, code, description, metadata);
        err.stack = this.stack;
        return err;
    }

    /** Clone the error with a new metadata field */
    addMetadataEntry(key: string, value: Object[]): ArsenalError {
        const type = this.#type;
        const code = this.#code;
        const description = this.#description;
        const metadata = new Map(this.#metadata);
        metadata.set(key, value);
        const err = new ArsenalError(type, code, description, metadata);
        err.stack = this.stack;
        return err;
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

    /** A map of error metadata */
    get metadata() {
        return this.#metadata;
    }

    /** Generate all possible errors. An instance is created by default. */
    static errors() {
        const errors = {};
        Object.entries(rawErrors).forEach((value) => {
            const name = value[0] as Name;
            const error = value[1];
            const { code, description } = error;
            const get = () => new ArsenalError(name, code, description);
            Object.defineProperty(errors, name, { get });
        });
        return errors as Errors;
    }
}

/** Mapping of all possible Errors.
 * Use them with errors[error].customizeDescription for any customization. */
export default ArsenalError.errors();
