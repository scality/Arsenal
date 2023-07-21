const { Delimiter } = require('./delimiter');

type ResultObject = {
    Contents: {
        key: string;
        value: string;
    }[];
    IsTruncated: boolean;
    NextMarker ?: string;
};

/**
 * Handle object listing with parameters. This extends the base class Delimiter
 * to return the master/current versions.
 */
class DelimiterCurrent extends Delimiter {
    /**
     * Delimiter listing of current versions.
     * @param {Object}  parameters            - listing parameters
     * @param {String}  parameters.beforeDate - limit the response to keys older than beforeDate
     * @param {String}  parameters.excludedDataStoreName - excluded datatore name
     * @param {RequestLogger} logger          - The logger of the request
     * @param {String} [vFormat]              - versioning key format
     */
    constructor(parameters, logger, vFormat) {
        super(parameters, logger, vFormat);

        this.beforeDate = parameters.beforeDate;
        this.excludedDataStoreName = parameters.excludedDataStoreName;
    }

    genMDParamsV1() {
        const params = super.genMDParamsV1();

        if (this.beforeDate) {
            params.lastModified = {
                lt: this.beforeDate,
            };
        }

        if (this.excludedDataStoreName) {
            params.dataStoreName = {
                ne: this.excludedDataStoreName,
            }
        }
        return params;
    }

    result(): ResultObject {
        const result: ResultObject = {
            Contents: this.Contents,
            IsTruncated: this.IsTruncated,
        };

        if (this.IsTruncated) {
            result.NextMarker = this.NextMarker;
        }

        return result;
    }
}
module.exports = { DelimiterCurrent };
