const { Delimiter } = require('./delimiter');
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
        // used for monitoring
        this.start = null;
        this.evaluatedKeys = 0;
    }

    genMDParamsV1() {
        const params = super.genMDParamsV1();
 
        if (this.beforeDate) {
            params.lastModified = {
                lt: this.beforeDate,
            };
        }

        this.start = Date.now();

        return params;
    }

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

    filter(obj) {
        if (this.start && Date.now() - this.start > DELIMITER_TIMEOUT_MS) {
            this.IsTruncated = true;
            this.logger.info('listing stopped after expected internal timeout',
                {
                    timeoutMs: DELIMITER_TIMEOUT_MS,
                    evaluatedKeys: this.evaluatedKeys,
                });
            return FILTER_END;
        }
        ++this.evaluatedKeys;

        const parsedValue = this._parse(obj.value);
        // if parsing fails, skip the key.
        if (parsedValue) {
            const lastModified = parsedValue['last-modified'];
            // We then check if the current version is older than the "beforeDate"
            if (!this.beforeDate || (lastModified && lastModified < this.beforeDate)) {
                return super.filter(obj);
            }
            // In the event of a timeout occurring before any content is added, make sure to update NextMarker.
            const key = this.getObjectKey(obj);
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
