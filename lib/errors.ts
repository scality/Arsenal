'use strict'; // eslint-disable-line strict

import * as http from 'http';
import errorsObj from '../errors/arsenalErrors.json';

/**
 * ArsenalError
 *
 * @extends {Error}
 */

type Errors = Record<string, ArsenalError>;

class ArsenalError extends Error {

    code: number;
    description: string;
    private static _errorMap: Errors;

    /**
     * constructor.
     *
     * @param {string} type - Type of error or message
     * @param {number} code - HTTP status code
     * @param {string} desc - Verbose description of error
     */
    constructor(type: string, code: number, desc: string) {
        super(type);

        /**
         * HTTP status code of error
         * @type {number}
         */
        this.code = code;

        /**
         * Description of error
         * @type {string}
         */
        this.description = desc;

        (this as any)[type] = true;
    }

    public static get errorMap () {
        if (this._errorMap !== undefined) {
            return this._errorMap;
        }

        const errors: Errors = {};
        type ErrorDefinition = { code: number, description: string };
        type ErrorDefinitions = Record<string, ErrorDefinition | string>;

        Object.keys(errorsObj)
            .filter(index => index !== '_comment')
            .forEach(index => {
                errors[index] = new ArsenalError(
                    index,
                    ((errorsObj as ErrorDefinitions)[index] as ErrorDefinition).code,
                    ((errorsObj as ErrorDefinitions)[index] as ErrorDefinition).description
                );
            });
        this._errorMap = errors;
        return this._errorMap;
    }

    /**
     * Output the error as a JSON string
     * @returns {string} Error as JSON string
     */
    toString(): string {
        return JSON.stringify({
            errorType: this.message,
            errorMessage: this.description,
        });
    }

    /**
     * Write the error in an HTTP response
     *
     * @param { http.ServerResponse } res - Response we are responding to
     * @returns {undefined}
     */
    writeResponse(res: http.ServerResponse): void {
        res.writeHead(this.code);
        res.end(this.toString());
    }

    /**
     * customizeDescription returns a new ArsenalError with a new description
     * with the same HTTP code and message.
     *
     * @param {string} description - New error description
     * @returns {ArsenalError} New error
     */
    customizeDescription(description: string): ArsenalError {
        return new ArsenalError(this.message, this.code, description);
    }
}

const errors = ArsenalError.errorMap

export default {
    ...errors
};
