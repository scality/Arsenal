/* eslint-disable camelcase */
/* eslint-disable @typescript-eslint/no-require-imports */

import {
    Delimiter,
    FilterState,
    FilterReturnValue,
    DelimiterFilterStateId,
    DelimiterFilterState_NotSkipping,
    DelimiterFilterState_SkippingPrefix,
} from './delimiter';
const Version = require('../../versioning/Version').Version;
const VSConst = require('../../versioning/constants').VersioningConstants;
const { BucketVersioningKeyFormat } = VSConst;
const { FILTER_ACCEPT, FILTER_SKIP, FILTER_END } = require('./tools');

const VID_SEP = VSConst.VersionId.Separator;
const { DbPrefixes } = VSConst;

const enum DelimiterMasterFilterStateId {
    SkippingVersionsV0 = 101,
    WaitVersionAfterPHDV0 = 102,
};

interface DelimiterMasterFilterState_SkippingVersionsV0 extends FilterState {
    id: DelimiterMasterFilterStateId.SkippingVersionsV0,
    masterKey: string,
};

interface DelimiterMasterFilterState_WaitVersionAfterPHDV0 extends FilterState {
    id: DelimiterMasterFilterStateId.WaitVersionAfterPHDV0,
    masterKey: string,
};

/**
 * Handle object listing with parameters. This extends the base class Delimiter
 * to return the raw master versions of existing objects.
 */
export class DelimiterMaster extends Delimiter {

    /**
     * Delimiter listing of master versions.
     * @param {Object}  parameters            - listing parameters
     * @param {String}  parameters.delimiter  - delimiter per amazon format
     * @param {String}  parameters.prefix     - prefix per amazon format
     * @param {String}  parameters.marker     - marker per amazon format
     * @param {Number}  parameters.maxKeys    - number of keys to list
     * @param {Boolean} parameters.v2         - indicates whether v2 format
     * @param {String}  parameters.startAfter - marker per amazon v2 format
     * @param {String}  parameters.continuationToken - obfuscated amazon token
     * @param {RequestLogger} logger          - The logger of the request
     * @param {String} [vFormat]              - versioning key format
     */
    constructor(parameters, logger, vFormat) {
        super(parameters, logger, vFormat);

        Object.assign(this, {
            [BucketVersioningKeyFormat.v0]: {
                skipping: this.skippingV0,
            },
            [BucketVersioningKeyFormat.v1]: {
                skipping: this.skippingV1,
            },
        }[this.vFormat]);

        if (this.vFormat === BucketVersioningKeyFormat.v0) {
            // override Delimiter's implementation of NotSkipping for
            // DelimiterMaster logic (skipping versions and special
            // handling of delete markers and PHDs)
            this.setKeyHandler(
                DelimiterFilterStateId.NotSkipping,
                this.keyHandler_NotSkippingPrefixNorVersionsV0.bind(this));

            // add extra state handlers specific to DelimiterMaster with v0 format
            this.setKeyHandler(
                DelimiterMasterFilterStateId.SkippingVersionsV0,
                this.keyHandler_SkippingVersionsV0.bind(this));

            this.setKeyHandler(
                DelimiterMasterFilterStateId.WaitVersionAfterPHDV0,
                this.keyHandler_WaitVersionAfterPHDV0.bind(this));

            if (this.marker) {
                // distinct initial state to include some special logic
                // before the first master key is found that does not have
                // to be checked afterwards
                this.state = <DelimiterMasterFilterState_SkippingVersionsV0> {
                    id: DelimiterMasterFilterStateId.SkippingVersionsV0,
                    masterKey: this.marker,
                };
            } else {
                this.state = <DelimiterFilterState_NotSkipping> {
                    id: DelimiterFilterStateId.NotSkipping,
                };
            }
        }
        // in v1, we can directly use Delimiter's implementation,
        // which is already set to the proper state
    }

    filter_onNewMasterKeyV0(key: string, value: string): FilterReturnValue {
        // if this master key is a delete marker, accept it without
        // adding the version to the contents
        if (Version.isDeleteMarker(value)) {
            // update the state to start skipping versions of the new master key
            this.setState(<DelimiterMasterFilterState_SkippingVersionsV0> {
                id: DelimiterMasterFilterStateId.SkippingVersionsV0,
                masterKey: key,
            });
            return FILTER_ACCEPT;
        }
        if (Version.isPHD(value)) {
            // master version is a PHD version: wait for the first
            // following version that will be considered as the actual
            // master key
            this.setState(<DelimiterMasterFilterState_WaitVersionAfterPHDV0> {
                id: DelimiterMasterFilterStateId.WaitVersionAfterPHDV0,
                masterKey: key,
            });
            return FILTER_ACCEPT;
        }
        if (key.startsWith(DbPrefixes.Replay)) {
            // skip internal replay prefix entirely
            this.setState(<DelimiterFilterState_SkippingPrefix> {
                id: DelimiterFilterStateId.SkippingPrefix,
                prefix: DbPrefixes.Replay,
            });
            return FILTER_SKIP;
        }
        if (this._reachedMaxKeys()) {
            return FILTER_END;
        }
        const commonPrefix = this.addCommonPrefixOrContents(key, value);
        if (commonPrefix) {
            // transition into SkippingPrefix state to skip all following keys
            // while they start with the same prefix
            this.setState(<DelimiterFilterState_SkippingPrefix> {
                id: DelimiterFilterStateId.SkippingPrefix,
                prefix: commonPrefix,
            });
            return FILTER_ACCEPT;
        }
        // update the state to start skipping versions of the new master key
        this.setState(<DelimiterMasterFilterState_SkippingVersionsV0> {
            id: DelimiterMasterFilterStateId.SkippingVersionsV0,
            masterKey: key,
        });
        return FILTER_ACCEPT;
    }

    keyHandler_NotSkippingPrefixNorVersionsV0(key: string, value: string): FilterReturnValue {
        return this.filter_onNewMasterKeyV0(key, value);
    }

    keyHandler_SkippingVersionsV0(key: string, value: string): FilterReturnValue {
        /* In the SkippingVersionsV0 state, skip all version keys
         * (<key><versionIdSeparator><version>) */
        const versionIdIndex = key.indexOf(VID_SEP);
        if (versionIdIndex !== -1) {
            return FILTER_SKIP;
        }
        return this.filter_onNewMasterKeyV0(key, value);
    }

    keyHandler_WaitVersionAfterPHDV0(key: string, value: string): FilterReturnValue {
        // After a PHD key is encountered, the next version key of the
        // same object if it exists is the new master key, hence
        // consider it as such and call 'onNewMasterKeyV0' (the test
        // 'masterKey == phdKey' is probably redundant when we already
        // know we have a versioned key, since all objects in v0 have
        // a master key, but keeping it in doubt)
        const { masterKey: phdKey } = <DelimiterMasterFilterState_WaitVersionAfterPHDV0> this.state;
        const versionIdIndex = key.indexOf(VID_SEP);
        if (versionIdIndex !== -1) {
            const masterKey = key.slice(0, versionIdIndex);
            if (masterKey === phdKey) {
                return this.filter_onNewMasterKeyV0(masterKey, value);
            }
        }
        return this.filter_onNewMasterKeyV0(key, value);
    }

    skippingBase(): string | undefined {
        switch (this.state.id) {
        case DelimiterMasterFilterStateId.SkippingVersionsV0:
            // eslint-disable-next-line no-case-declarations
            const { masterKey } = <DelimiterMasterFilterState_SkippingVersionsV0> this.state;
            return masterKey + VID_SEP;

        default:
            return super.skippingBase();
        }
    }
}
