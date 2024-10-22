const { DelimiterMaster } = require('./delimiterMaster');

type ResultObject = {
    Contents: {
        key: string;
        value: string;
    }[];
    IsTruncated: boolean;
    NextMarker ?: string;
};

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
     * @param {Number} parameters.maxScannedLifecycleListingEntries - max number of entries to be scanned
     * @param {RequestLogger} logger          - The logger of the request
     * @param {String} [vFormat]              - versioning key format
     */
    constructor(parameters, logger, vFormat) {
        super(parameters, logger, vFormat);

        this.beforeDate = parameters.beforeDate;
        this.excludedDataStoreName = parameters.excludedDataStoreName;
        this.maxScannedLifecycleListingEntries = parameters.maxScannedLifecycleListingEntries;
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
            };
        }

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

    /**
     * check if the max keys count has been reached and set the
     * final state of the result if it is the case
     *
     * specialized implementation on DelimiterCurrent to also check
     * the number of scanned keys
     *
     * @return {Boolean} - indicates if the iteration has to stop
     */
    _reachedMaxKeys(): boolean {
        if (this.maxScannedLifecycleListingEntries && this.scannedKeys >= this.maxScannedLifecycleListingEntries) {
            this.IsTruncated = true;
            this.logger.info('listing stopped due to reaching the maximum scanned entries limit',
                {
                    maxScannedLifecycleListingEntries: this.maxScannedLifecycleListingEntries,
                    scannedKeys: this.scannedKeys,
                });
            return true;
        }
        return super._reachedMaxKeys();
    }

    addContents(key, value) {
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
                super.addContents(key, value);
            }
            // In the event of a timeout occurring before any content is added,
            // NextMarker is updated even if the object is not eligible.
            // It minimizes the amount of data that the client needs to re-process if the request times out.
            this.nextMarker = key;
        }
    }

    result(): object {
        const result: ResultObject = {
            Contents: this.Contents,
            IsTruncated: this.IsTruncated,
        };

        if (this.IsTruncated) {
            result.NextMarker = this.nextMarker;
        }

        return result;
    }
}
module.exports = { DelimiterCurrent };
