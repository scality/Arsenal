const EventEmitter = require('events');

/**
 * Class to collect results of streaming subparts.
 * Emits "done" event when streaming is complete and Azure has returned
 * results for putting each of the subparts
 * Emits "error" event if Azure returns an error for putting a subpart and
 * streaming is in-progress
 * @class ResultsCollector
 */
class ResultsCollector extends EventEmitter {
    /**
     * @constructor
     */
    constructor() {
        super();
        this._results = [];
        this._queue = 0;
        this._streamingFinished = false;
    }

    /**
     * ResultsCollector.pushResult - register result of putting one subpart
     * and emit "done" or "error" events if appropriate
     * @param {(Error|undefined)} err - error returned from Azure after
     *  putting a subpart
     * @param {number} subPartIndex - the index of the subpart
     * @emits ResultCollector#done
     * @emits ResultCollector#error
     * @return {undefined}
     */
    pushResult(err, subPartIndex) {
        this._results.push({
            error: err,
            subPartIndex,
        });
        this._queue--;
        if (this._resultsComplete()) {
            this.emit('done', err, this._results);
        } else if (err) {
            this.emit('error', err, subPartIndex);
        }
    }

    /**
     * ResultsCollector.pushOp - register operation to put another subpart
     * @return {undefined};
     */
    pushOp() {
        this._queue++;
    }

    /**
     * ResultsCollector.enableComplete - register streaming has finished,
     * allowing ResultCollector#done event to be emitted when last result
     * has been returned
     * @return {undefined};
     */
    enableComplete() {
        this._streamingFinished = true;
    }

    _resultsComplete() {
        return (this._queue === 0 && this._streamingFinished);
    }
}

/**
 * "done" event
 * @event ResultCollector#done
 * @type {(Error|undefined)} err - error returned by Azure putting last subpart
 * @type {object[]} results - result for putting each of the subparts
 * @property {Error} [results[].error] - error returned by Azure putting subpart
 * @property {number} results[].subPartIndex - index of the subpart
 */
 /**
  * "error" event
  * @event ResultCollector#error
  * @type {(Error|undefined)} error - error returned by Azure last subpart
  * @type {number} subPartIndex - index of the subpart
  */

module.exports = ResultsCollector;
