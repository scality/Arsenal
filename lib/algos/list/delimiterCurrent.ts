const { Delimiter } = require('./delimiter');
import { ResultObject } from './types';

/**
 * Handle object listing with parameters. This extends the base class Delimiter
 * to return the master/current versions.
 */
class DelimiterCurrent extends Delimiter {
    /**
     * Delimiter listing of current versions.
     * @param {Object}  parameters            - listing parameters
     * @param {String}  parameters.beforeDate - limit the response to keys older than beforeDate
     * @param {RequestLogger} logger          - The logger of the request
     * @param {String} [vFormat]              - versioning key format
     */
    constructor(parameters, logger, vFormat) {
        super(parameters, logger, vFormat);

        this.beforeDate = parameters.beforeDate;
    }

    genMDParamsV1() {
        const params = super.genMDParamsV1();
 
        if (this.beforeDate) {
            params.lastModified = {
                lt: this.beforeDate,
            };
        }
        return params;
    }

    result(): ResultObject {
        const result: ResultObject = {
            Contents: this.Contents,
            IsTruncated: this.IsTruncated,
        };

        if (this.IsTruncated) {
            result.NextKeyMarker = this.NextMarker;
        }

        return result;
    }
}
module.exports = { DelimiterCurrent };
