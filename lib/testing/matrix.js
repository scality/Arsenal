'use strict'; // eslint-disable-line strict

/**
* Run tests with multiple configurations using varying parameters
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
        * Create a deep copy to prevent the user from modifying the object
        * from outside the class
        **/
        this.params = Object.assign({}, params);
        this.callback = null;
        this.elementsToSpecialize = [];
        this.description = '';
        this.listOfSpecialCase = [];
    }

    /**
    * Callback used by mocha to signal end of test
    * Must be called at the end of the test
    * @callback Done
    *
    * @return {undefined}
    */
    /**
    * Callback to be used by a generated test matrix
    * Used by @generate and @testSpecialCase methods
    *
    * @callback GenerateMatrixCallback
    * @param {TestMatrix} matrix - the generated matrix.
    * @param {Done} done - callback used by the test to signal mocha the end of
    * the test. This callback will be empty if not all elements are
    * specialize
    *
    * @return {undefined}
    */

    /**
    * Save paramaters for generate test matrix
    * call execute method must be call for generate the matrix
    * @param {string[]} elementsToSpecialize - key element we want to
    *                    specialize on the matrix
    * @param {GenerateMatrixCallback} callback - callback function
    *                    who want to be call on execute method
    *                    for the current generate matrix
    * @param {string=} description - description of the test
    *
    * @returns {TestMatrix} Return current instance of Matrix object
    */
    generate(elementsToSpecialize, callback, description) {
        this.elementsToSpecialize = elementsToSpecialize;
        this.callback = callback;
        this.description = typeof description === 'undefined'
        ? ''
        : description;
        return this;
    }

    /**
    * Method to prevent a special case during the tests.
    *
    * @param {Object.<string, string[]>} specialCase - The keys of
    *                      the hash table is the element we want to do a
    *                      special case, the value is the value we
    *                      want to do a special case for the specific key.
    *                      All key of the object must be validate with at least
    *                      one value for execute a special case.
    *                      ex: for a hashmap with 'auth' as key and 'v4' as
    *                      value, if we found a matrix with this following
    *                      paramater, it will call the special callback
    * @param {GenerateMatrixCallback} callbackSpecialCase - Callback who the
    *                       execute method will call when
    *                       this special case is found.
    * @param {string=} description - the test's description
    *
    * @returns {TestMatrix} Return current instance of Matrix object
    */
    testSpecialCase(specialCase, callbackSpecialCase, description) {
        const pair = {
            key: specialCase,
            callback: callbackSpecialCase,
            description: typeof description === 'undefined' ? '' : description,
        };
        this.listOfSpecialCase.push(pair);

        return this;
    }

    /**
    * Return the parameters of the matrix into a Json format
    * This method will call automatically the describe function from
    * mocha
    *
    * @returns {string} JSON format of parameters
    */
    serialize() {
        return JSON.stringify(this.params);
    }

    /**
    * Generate the matrix and call all callback enter on @generate and
    * on methods. Must be run as the father matrix for running all the test
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
                const originalValues = this.params[elementToSpecialize];

                this.elementsToSpecialize.shift();
                if (!(elementToSpecialize in this.params)) {
                    const errMessage = 'No key of specialization found: ';
                    throw new Error(errMessage + elementToSpecialize);
                } else if (Object.prototype.toString.call(this.
                    params[elementToSpecialize]).indexOf('Array') === -1) {
                    const errMessage = 'Element already specialized: ';
                    throw new Error(errMessage + elementToSpecialize);
                } else {
                    originalValues.forEach(currentElement => {
                        this.params[elementToSpecialize] = currentElement;
                        this.execute();
                    });
                }
                this.params[elementToSpecialize] = originalValues;
                this.elementsToSpecialize.unshift(elementToSpecialize);
            } else {
                /**
                * Create copy for not modify the current instance of the object
                * during the call of the callback function
                */
                const matrixGenerated = new TestMatrix(this.params);
                /**
                * Search if the matrix we generated is a specialCase
                */

                const callFunction = (matrixFather, matrixChild, callback,
                    description) => {
                    const result = Object.keys(matrixChild.params)
                    .every(currentKey =>
                           Object.prototype.toString.call(
                               matrixChild.params[currentKey]
                            ).indexOf('Array') === -1);

                    if (result === true) {
                        describe(matrixChild.serialize(), () => {
                            it(description,
                               done => callback(matrixChild, done));
                        });
                    } else {
                        describe(matrixChild.serialize(), () => {
                            callback(matrixChild, () => {});
                            matrixChild.execute();
                        });
                    }
                };
                let aSpecialCaseWasFound = false;
                this.listOfSpecialCase.forEach(specialCase => {
                    const keyCase = specialCase.key;
                    const result = Object.keys(keyCase).every(currentKey => {
                        // eslint-disable-next-line no-prototype-builtins
                        if (this.params.hasOwnProperty(currentKey) === false) {
                            return false;
                        }
                        const keyParam = this.params[currentKey];
                        return keyCase[currentKey].indexOf(keyParam) !== -1;
                    });

                    /**
                    * A special case was found, execute the special callback
                    * otherwise, execute the callback send by @generate methode
                    */
                    if (result === true) {
                        callFunction(this, matrixGenerated,
                            specialCase.callback, specialCase.description);
                        aSpecialCaseWasFound = true;
                    }
                });
                if (aSpecialCaseWasFound !== true) {
                    callFunction(this, matrixGenerated, this.callback,
                        this.description);
                }
            }
        }
    }
}

module.exports = {
    TestMatrix,
};
