import * as http from 'http';
import * as rawErrors from './arsenal-errors';
import * as types from './types';

export * from './types';

export class ArsenalError extends Error {
    code: number;
    description: string;
    type: types.Name;

    constructor(type: types.Name, code: number, description: string) {
        super(type);
        this.code = code;
        this.description = description;
        this.type = type;
    }

    /** Output the error as a JSON string */
    toString() {
        const { message, description } = this;
        return JSON.stringify({
            errorType: message,
            errorMessage: description,
        });
    }

    /** Write the error in an HTTP response */
    writeResponse(res: http.ServerResponse) {
        res.writeHead(this.code);
        const asStr = this.toString();
        res.end(asStr);
    }

    /** Clone the error with a new description.*/
    customizeDescription(description: string): ArsenalError {
        const { type, code } = this;
        return new ArsenalError(type, code, description);
    }

    is(type: types.Name) {
        return this.type === type;
    }
}

/** Mapping of all possible Errors */
export type Errors = { [Property in keyof types.Names]: ArsenalError };

/** Mapping of all possible Errors.
 * Use them with errors[error].customizeDescription for any customization. */
const errors = Object.entries(rawErrors).reduce((acc, value) => {
    const name = value[0] as types.Name;
    const error = value[1];
    const { code, description } = error;
    return { ...acc, [name]: new ArsenalError(name, code, description) };
}, {} as Errors);

export default errors;
