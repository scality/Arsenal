'use strict'; // eslint-disable-line strict
const Delimiter = require('./delimiter').Delimiter;
const VSConst = require('../../versioning/constants').VersioningConstants;
const { inc, FILTER_ACCEPT, FILTER_END, SKIP_NONE } = require('./tools');
const VID_SEP = VSConst.VersionId.Separator;
const { DbPrefixes } = VSConst;

// TODO: find an acceptable timeout value.
const DELIMITER_TIMEOUT_MS = 10 * 1000; // 10s
const TRIM_METADATA_MIN_BLOB_SIZE = 10000;

/**
 * Handle object listing with parameters. This extends the base class Delimiter
 * to return the raw non-current versions objects.
 */
class DelimiterNonCurrent extends Delimiter {
    /**
     * Delimiter listing of non-current versions.
     * @param {Object}  parameters                  - listing parameters
     * @param {String}  parameters.versionIdMarker  - version id marker
     * @param {String}  parameters.beforeDate       - limit the response to keys with stale date older than beforeDate
     * “stale date” is the date on when a version becomes non-current.
     * @param {String}  parameters.keyMarker        - key marker
     * @param {RequestLogger} logger                - The logger of the request
     * @param {String} [vFormat]                    - versioning key format
     */
    constructor(parameters, logger, vFormat) {
        super(parameters, logger, vFormat);

        this.versionIdMarker = parameters.versionIdMarker;
        this.beforeDate = parameters.beforeDate;
        this.keyMarker = parameters.keyMarker;
        this.NextKeyMarker = null;

        this.skipping = this.skippingV1;
        this.genMDParams = this.genMDParamsV1;

        this.keyName = null;
        this.staleDate = null;

        // used for monitoring
        this.evaluatedKeys = 0;
    }

    skippingV1() {
        return SKIP_NONE;
    }

    genMDParamsV1() {
        const params = {
            gte: DbPrefixes.Version,
            lt: inc(DbPrefixes.Version),
        };

        if (this.prefix) {
            params.gte = `${DbPrefixes.Version}${this.prefix}`;
            params.lt = `${DbPrefixes.Version}${inc(this.prefix)}`;
        }

        if (this.keyMarker && `${DbPrefixes.Version}${this.keyMarker}` >= params.gte) {
            if (this.versionIdMarker) {
                // versionIdMarker should always come with keyMarker but may not be the other way around.
                // NOTE: "gte" (instead of "gt") is used to include the last version of the "previous"
                // truncated listing when a versionId marker is specified.
                // This "previous"/"already evaluated" version will be used to retrieve the stale date and
                // skipped to not evaluate the same key twice in the addContents() method.
                params.gte = DbPrefixes.Version
                    + this.keyMarker
                    + VID_SEP
                    + this.versionIdMarker;
            } else {
                delete params.gte;
                params.gt = DbPrefixes.Version + inc(this.keyMarker + VID_SEP);
            }
        }

        this.start = Date.now();

        return params;
    }

    getLastModified(value) {
        let lastModified;
        try {
            const v = JSON.parse(value);
            lastModified = v['last-modified'];
        } catch (e) {
            this.logger.warn('could not parse Object Metadata while listing',
                {
                    method: 'getLastModified',
                    err: e.toString(),
                });
        }
        return lastModified;
    }

    /**
     * NOTE: Each version of a specific key is sorted from the latest to the oldest
     * thanks to the way version ids are generated.
     * DESCRIPTION: For a given key, the latest version is skipped since it represents the current version or
     * the last version of the previous truncated listing.
     * The current last-modified date is kept in memory and used as a "stale date" for the following version.
     * The following version is pushed only if the "stale date" (picked up from the previous version)
     * is available (JSON.parse has not failed), if the "beforeDate" argument is specified, and
     * the "stale date" is older than the "beforeDate".
     * The in-memory "stale date" is then updated with the version's last-modified date to be used for
     * the following version.
     * The process stops and returns the available results if either:
     * - no more metadata key is left to be processed
     * - the listing reaches the maximum number of key to be returned
     * - the internal timeout is reached
     *  @param {String} keyVersionSuffix   - The key to add
     *  @param {String} value - The value of the key
     *  @return {number}      - indicates if iteration should continue
     */
    addContents(keyVersionSuffix, value) {
        if (this._reachedMaxKeys()) {
            return FILTER_END;
        }

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

        const versionIdIndex = keyVersionSuffix.indexOf(VID_SEP);
        const key = keyVersionSuffix.slice(0, versionIdIndex);
        const versionId = keyVersionSuffix.slice(versionIdIndex + 1);

        this.NextKeyMarker = key;
        this.NextVersionIdMarker = versionId;

        // For a given key, the latest version is skipped since it represents either:
        // - the current version or
        // - the last version of the previous truncated listing
        const isLatestVersion = key !== this.keyName;

        if (isLatestVersion) {
            this.keyName = key;
            // The current last-modified date is kept in memory and used as a "stale date" for the following version.
            this.staleDate = this.getLastModified(value);
            return FILTER_ACCEPT;
        }

        // The following version is pushed only if the "stale date" (picked up from the previous version)
        // is available (JSON.parse has not failed) and, if the "beforeDate" argument is specified,
        // the "stale date" is older than the "beforeDate".
        let lastModified;
        if (this.staleDate && (!this.beforeDate || this.staleDate < this.beforeDate)) {
            const v = this.trimMetadataAddStaleDate(value, this.staleDate);
            lastModified = v.lastModified;
            const { contentValue } = v;
            // check that trimMetadataAddStaleDate succeeds to only push objects with a defined staleDate.
            if (contentValue) {
                this.Contents.push({ key, value: contentValue });
                ++this.keys;
            }
        }

        // The in-memory "stale date" is then updated with the version's last-modified date to be used for
        // the following version.
        this.staleDate = lastModified || this.getLastModified(value);

        return FILTER_ACCEPT;
    }

    trimMetadataAddStaleDate(value, staleDate) {
        let ret = undefined;
        let lastModified = undefined;
        try {
            ret = JSON.parse(value);
            ret.staleDate = staleDate;
            lastModified = ret['last-modified'];
            if (value.length >= TRIM_METADATA_MIN_BLOB_SIZE) {
                delete ret.location;
            }
            ret = JSON.stringify(ret);
        } catch (e) {
            // Prefer returning an unfiltered data rather than
            // stopping the service in case of parsing failure.
            // The risk of this approach is a potential
            // reproduction of MD-692, where too much memory is
            // used by repd.
            this.logger.warn('could not parse Object Metadata while listing',
                {
                    method: 'trimMetadataAddStaleDate',
                    err: e.toString(),
                });
        }
        return { contentValue: ret, lastModified };
    }

    result() {
        const result = {
            Contents: this.Contents,
            IsTruncated: this.IsTruncated,
        };

        if (this.IsTruncated) {
            result.NextKeyMarker = this.NextKeyMarker;
            result.NextVersionIdMarker = this.NextVersionIdMarker;
        }

        return result;
    }
}
module.exports = { DelimiterNonCurrent };
