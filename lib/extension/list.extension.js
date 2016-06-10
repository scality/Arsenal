'use strict'; // eslint-disable-line strict
/**
 *  Class of an extension doing the simple listing
 */
class List {
    /**
     *  Constructor
     *  Set the logger and the res
     *  @param {Object} parameters - The parameters you sent to DBD
     *  @param {RequestLogger} logger - The logger of the request
     *  @return {undefined}
     */
    constructor(parameters, logger) {
        this.logger = logger;
        this.res = [];
    }

    /**
     *  Function apply on each element
     *  Just add it to the array
     *  @param {Object} elem - The data from the database
     *  @return {Boolean} - True = continue the stream
     */
    filter(elem) {
        this.res.push(elem);
        return true;
    }

    /**
     *  Function returning the result
     *  @return {Array} - The listed elements
     */
    result() {
        return this.res;
    }
}

module.exports = {
    List,
};
