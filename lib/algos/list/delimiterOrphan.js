'use strict'; // eslint-disable-line strict
const Delimiter = require('./delimiter').Delimiter;
const VSConst = require('../../versioning/constants').VersioningConstants;
const { inc, FILTER_ACCEPT, FILTER_END, SKIP_NONE } = require('./tools');
const VID_SEP = VSConst.VersionId.Separator;
const { DbPrefixes } = VSConst;

const DELIMITER_TIMEOUT_MS = 10 * 1000; // 10s

/**
 * Handle object listing with parameters. This extends the base class Delimiter
 * to return the orphan delete markers. Orphan delete markers are also
 * refered as expired object delete marker.
 * They are delete marker with zero noncurrent versions.
 */
class DelimiterOrphan extends Delimiter {
    /**
     * Delimiter listing of non-current versions.
     * @param {Object}  parameters            - listing parameters
     * @param {String}  parameters.beforeDate - limit the response to keys older than beforeDate
     * @param {String}  parameters.keyMarker  - key marker
     * @param {RequestLogger} logger          - The logger of the request
     * @param {String} [vFormat]              - versioning key format
     */
    constructor(parameters, logger, vFormat) {
        super(parameters, logger, vFormat);

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

    _reachedMaxKeys() {
        if (this.keys >= this.maxKeys) {
            return true;
        }
        return false;
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
            delete params.gte;
            params.gt = DbPrefixes.Version
                    + inc(this.keyMarker + VID_SEP);
        }

        this.start = Date.now();

        return params;
    }

    _addOrphan() {
        if (this.value) {
            let lastModified;
            let isDeleteMarker = false;
            try {
                const v = JSON.parse(this.value);

                lastModified = v['last-modified'];
                isDeleteMarker = v.isDeleteMarker;
            } catch (e) {
                this.logger.warn('could not parse Object Metadata while listing',
                    {
                        method: 'getLastModified',
                        err: e.toString(),
                    });
            }
            // We then check if the orphan version is a delete marker and if it is older than the "beforeDate"
            if ((!this.beforeDate || (lastModified && lastModified < this.beforeDate)) && isDeleteMarker) {
                this.Contents.push({ key: this.keyName, value: this.trimMetadata(this.value) });
                this.NextKeyMarker = this.keyName;
                ++this.keys;
            }
        }
    }

    /**
     * NOTE: Each version of a specific key is sorted from the youngest to the oldest
     * thanks to the way version ids are generated.
     * DESCRIPTION: For a given key, the youngest version is kept in memory since it is the current version.
     * If the following version reference a new key, it means that the previous one was an orphan version.
     * We then check if the orphan version is a delete marker and if it is older than the "beforeDate"
     * The process stops and returns the available results if either:
     * - no more metadata key is left to be processed
     * - the listing reaches the maximum number of key to be returned
     * - the internal timeout is reached
     * NOTE: we cannot leverage MongoDB to list keys older than "beforeDate"
     * because then we will not be able to assess its orphanage.
     *  @param {String} keyVersionSuffix   - The key with version id as a suffix.
     *  @param {String} value              - The value of the key
     *  @return {number}                   - indicates if iteration should continue
     */
    addContents(keyVersionSuffix, value) {
        if (this._reachedMaxKeys()) {
            return FILTER_END;
        }

        if (this.start && Date.now() - this.start > DELIMITER_TIMEOUT_MS) {
            this.IsTruncated = true;
            this.NextKeyMarker = this.keyName;

            this.logger.info('listing stopped after expected internal timeout',
                {
                    timeoutMs: DELIMITER_TIMEOUT_MS,
                    evaluatedKeys: this.evaluatedKeys,
                });
            return FILTER_END;
        }
        ++this.evaluatedKeys;

        const versionIdIndex = keyVersionSuffix.indexOf(VID_SEP);
        // key without version suffix
        const key = keyVersionSuffix.slice(0, versionIdIndex);


        // For a given key, the youngest version is kept in memory since it represents the current version.
        if (key !== this.keyName) {
            // If the following version reference a new key,
            // it means that the previous one (this.value) was an orphan version.
            this._addOrphan();
            this.keyName = key;
            this.value = value;

            return FILTER_ACCEPT;
        }

        this.keyName = key;
        this.value = null;

        return FILTER_ACCEPT;
    }

    result() {
        // The following check makes sure the last orphan delete marker is not forgotten.
        if (this.keys < this.maxKeys) {
            this._addOrphan();
        // The following make sure that if makeKeys is reached, isTruncated is set to true.
        // We moved the "isTruncated" from _reachedMaxKeys to make sure we take into account the last entity
        // if listing is truncated right before the last entity and the last entity is a orphan delete marker.
        } else {
            this.IsTruncated = this.maxKeys > 0;
        }

        const result = {
            Contents: this.Contents,
            IsTruncated: this.IsTruncated,
        };

        if (this.IsTruncated) {
            result.NextKeyMarker = this.NextKeyMarker;
        }

        return result;
    }
}
module.exports = { DelimiterOrphan };
