'use strict'; // eslint-disable-line strict

/**
 * Class of an extension doing the sum of listed elements
 */
class Sum {
    /**
     *  Constructor of the Extension
     *  Init somes parameters
     *  @param {Object} parameters - The parameters you sent to DBD
     *  @param {RequestLogger} logger - The logger of the request
     *  @return {undefined}
     */
    constructor(parameters, logger) {
        this.max = parameters.max;
        this.res = 0;
        this.logger = logger;
    }

    /**
     *  Function apply on each element
     *  Continue until it return false
     *  @param {Object} data - The data from the database
     *  @return {Boolean} - False = stop the stream, True = continue the stream
     */
    filter(data) {
        this.res += data.value;
        if (this.res >= this.max) {
            return false;
        }
        return true;
    }

    /**
     *  Function used to get what to return
     *  @return {Object} - The resultat of the sum
     */
    result() {
        return this.res;
    }
}

module.exports = {
    Sum,
};
