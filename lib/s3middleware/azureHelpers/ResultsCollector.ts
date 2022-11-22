import { EventEmitter } from 'events';

/**
 * Class to collect results of streaming subparts.
 * Emits "done" event when streaming is complete and Azure has returned
 * results for putting each of the subparts
 * Emits "error" event if Azure returns an error for putting a subpart and
 * streaming is in-progress
 * @class ResultsCollector
 */
export default class ResultsCollector extends EventEmitter {
    // TODO Add better type.
    _results: any[];
    _queue: number;
    _streamingFinished: boolean;

    constructor() {
        super();
        this._results = [];
        this._queue = 0;
        this._streamingFinished = false;
    }

    /**
     * ResultsCollector.pushResult - register result of putting one subpart
     * and emit "done" or "error" events if appropriate
     * @param err - error returned from Azure after
     *  putting a subpart
     * @param subPartIndex - the index of the subpart
     * @emits ResultCollector#done
     * @emits ResultCollector#error
     */
    pushResult(err: Error | null | undefined, subPartIndex: number) {
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
     */
    pushOp() {
        this._queue++;
    }

    /**
     * ResultsCollector.enableComplete - register streaming has finished,
     * allowing ResultCollector#done event to be emitted when last result
     * has been returned
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
