'use strict'; // eslint-disable-line strict

/**
* Running tests with multiple configurations using varying parameters
* @constructor
*/
class TestMatrix {
    /**
    * Builds a new testing Matrix
    *
    * @param {Object.<string, string|string[]>} params - Argument of the matrix
    *
    * @returns {TestMatrix} new testing Matrix
    */
    constructor(params) {
        /**
        * Create deep copy for forbidden the user to modify the object outside
        * the class
        **/
        this.params = Object.assign({}, params);
        this.paramsOnString = JSON.stringify(this.params);
        this.callback = null;
        this.elementsToSpecialize = [];
        this.listOfException = [];
    }

    /**
    * Callback used for a generated matrix
    *
    * @callback GenerateMatrixCallback
    * @param {TestMatrix} matrix - The following generate matrix.
    *
    * @return {undefined}
    */

    /**
    * Generate testing matrix, call execute method to run callback
    *
    * @param {string[]} elementsToSpecialize - key element we want to
    *                    specialize on the matrix
    * @param {GenerateMatrixCallback} callback - callback function
    *                    who want to be call on execute method
    *                    for the current generate matrix
    *
    * @returns {TestMatrix} Return current instance of Matrix object
    */
    generate(elementsToSpecialize, callback) {
        this.elementsToSpecialize = elementsToSpecialize;
        this.callback = callback;
        return this;
    }

    /**
    * Method to prevent an exception during the tests.
    *
    * @param {Object.<string, string[]>} exception - The keys of the hash table
    is the element we want to do an exception, the value
    *                      is the value we want to do an exception for the
    *                      specific key.
    *                      All key of the object must be validate with at least
    *                      one value for execute an exception.
    *                      ex: for a hashmap with 'auth' as key and 'v4' as
    *                      value, if we found a matrix with this following
    *                      paramater, it will call the special callback
    * @argument {GenerateMatrixCallback} callbackException - Callback who the
    *                       execute method will call when
    *                       this exception is found.
    *
    * @returns {TestMatrix} Return current instance of Matrix object
    */
    if(exception, callbackException) {
        const pair = {
            key: exception,
            callback: callbackException,
        };
        this.listOfException.push(pair);

        return this;
    }

    /**
    * Return the parameters of the matrix into a Json format
    *
    * @returns {string} JSON format of parameters
    */
    toString() {
        return this.paramsOnString;
    }

    /**
    * Generate the matrix and call all callback enter on @generate and
    * if methods. Must be run as the father matrix for running all the test
    *
    * @returns {undefined}
    */
    execute() {
        /**
        * Check if @generate method has been already called
        */
        if (this.callback) {
            /**
            * Generate matrix element by element, we call the @execute
            * method until that we specialize all element send
            * by generate method
            */
            if (this.elementsToSpecialize.length !== 0) {
                /**
                * Make copy for restore object in the end of recursive function
                */
                const elementToSpecialize = this.elementsToSpecialize[0];
                const copyElement = this.params[elementToSpecialize];

                this.elementsToSpecialize.shift();
                if (!(elementToSpecialize in this.params)) {
                    const errMessage = 'No key of specialization found: ';
                    throw new Error(errMessage + elementToSpecialize);
                } else {
                    copyElement.forEach(currentElement => {
                        this.params[elementToSpecialize] = currentElement;
                        this.execute();
                    });
                }
                this.params[elementToSpecialize] = copyElement;
                this.elementsToSpecialize.push(elementToSpecialize);
            } else {
                /**
                * Create copy for not modify the current instance of the object
                * during the call of the callback function
                */
                const matrixGenerated = new TestMatrix(this.params);
                /**
                * Search if the matrix we generated is an exception
                */

                const callFunction = (matrixFather, matrixChild, callback) => {
                    callback(matrixChild);
                    describe(matrixFather.toString(), () => {
                        if (matrixChild.callback === null) {
                            it(matrixChild.toString(), done => {
                                matrixChild.execute();
                                done();
                            });
                        } else {
                            matrixChild.execute();
                        }
                    });
                };
                let anExceptionWasFound = false;
                this.listOfException.forEach(exception => {
                    const keyExcept = exception.key;
                    const result = Object.keys(keyExcept).every(currentKey => {
                        if (this.params.hasOwnProperty(currentKey) === false) {
                            return false;
                        }
                        const keyParam = this.params[currentKey];
                        return keyExcept[currentKey].indexOf(keyParam) !== -1;
                    });

                    /**
                    * An exception was found, execute the special callback
                    * otherwise, execute the callback send by @generate methode
                    */
                    if (result === true) {
                        callFunction(this, matrixGenerated, exception.callback);
                        anExceptionWasFound = true;
                    }
                });
                if (anExceptionWasFound !== true) {
                    callFunction(this, matrixGenerated, this.callback);
                }
            }
        }
    }
}

module.exports = {
    TestMatrix,
};
