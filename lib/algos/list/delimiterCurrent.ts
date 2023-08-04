const { DelimiterMaster } = require('./delimiterMaster');
const { FILTER_ACCEPT, FILTER_END } = require('./tools');

type ResultObject = {
    Contents: {
        key: string;
        value: string;
    }[];
    IsTruncated: boolean;
    NextMarker ?: string;
};

const DELIMITER_TIMEOUT_MS = 10 * 1000; // 10s

/**
 * Handle object listing with parameters. This extends the base class DelimiterMaster
 * to return the master/current versions.
 */
class DelimiterCurrent extends DelimiterMaster {
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
        // used for monitoring
        this.start = null;
        this.scannedKeys = 0;
    }

    genMDParamsV0() {
        const params = super.genMDParamsV0();
        // lastModified and dataStoreName parameters are used by metadata that enables built-in filtering, 
        // a feature currently exclusive to MongoDB
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

        // The genMDParamsV1() function calls genMDParamsV0() in the Delimiter class,
        // making sure that this.start is set for both v0 and v1 bucket formats
        this.start = Date.now();

        return params;
    }

    /**
     * Parses the stringified entry's value.
     * @param s - sringified value
     * @return - undefined if parsing fails, otherwise it contains the parsed value.
     */
    _parse(s) {
        let p;
        try {
            p = JSON.parse(s);
        } catch (e: any) {
            this.logger.warn(
                'Could not parse Object Metadata while listing',
                { err: e.toString() });
        }
        return p;
    }

    addContents(key, value) {
        if (this.start && Date.now() - this.start > DELIMITER_TIMEOUT_MS) {
            this.IsTruncated = true;
            this.logger.info('listing stopped after expected internal timeout',
                {
                    timeoutMs: DELIMITER_TIMEOUT_MS,
                    scannedKeys: this.scannedKeys,
                });
            return FILTER_END;
        }
        ++this.scannedKeys;
        const parsedValue = this._parse(value);
        // if parsing fails, skip the key.
        if (parsedValue) {
            const lastModified = parsedValue['last-modified'];
            const dataStoreName = parsedValue.dataStoreName;
            // We then check if the current version is older than the "beforeDate" and
            // "excludedDataStoreName" is not specified or if specified and the data store name is different.
            if ((!this.beforeDate || (lastModified && lastModified < this.beforeDate)) &&
                (!this.excludedDataStoreName || dataStoreName !== this.excludedDataStoreName)) {
                return super.addContents(key, value);
            }
            // In the event of a timeout occurring before any content is added,
            // NextMarker is updated even if the object is not eligible.
            // It minimizes the amount of data that the client needs to re-process if the request times out.
            this.NextMarker = key;
        }

        return FILTER_ACCEPT;
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
