import errorsObj from './arsenalErrors';

/**
 * ArsenalError
 *
 * @extends {Error}
 */
class ArsenalError extends Error {
    code: number
    description: string

    /**
     * constructor.
     *
     * @param {string} type - Type of error or message
     * @param {number} code - HTTP status code
     * @param {string} desc - Verbose description of error
     */
    constructor(type, code, desc) {
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

        this[type] = true;
    }

    /**
     * Output the error as a JSON string
     * @returns {string} Error as JSON string
     */
    toString() {
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
    writeResponse(res) {
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
    customizeDescription(description) {
        return new ArsenalError(this.message, this.code, description);
    }
}

/**
 * Generate an Errors instances object.
 *
 * @returns {Object.<string, ArsenalError>} - object field by arsenalError
 *                                            instances
 */
function errorsGen() {
    const errors = {};

    Object.keys(errorsObj)
        .filter(index => index !== '_comment')
        .forEach(index => {
            errors[index] = new ArsenalError(index, errorsObj[index].code,
                errorsObj[index].description);
        });
    return errors;
}

export default errorsGen();
