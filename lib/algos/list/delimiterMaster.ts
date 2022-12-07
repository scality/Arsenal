const Delimiter = require('./delimiter').Delimiter;
const Version = require('../../versioning/Version').Version;
const VSConst = require('../../versioning/constants').VersioningConstants;
const { BucketVersioningKeyFormat } = VSConst;
const { FILTER_ACCEPT, FILTER_SKIP, FILTER_END, SKIP_NONE } = require('./tools');

const VID_SEP = VSConst.VersionId.Separator;
const { DbPrefixes } = VSConst;

const enum FilterStateId {
    WaitFirstMasterV0,
    SkippingVersionsV0,
    SkippingPrefix,
    WaitVersionAfterPHDV0,
    AcceptingMasterKeysV1,
};

type FilterState_WaitFirstMasterV0 = {
    id: FilterStateId.WaitFirstMasterV0,
};

type FilterState_SkippingVersionsV0 = {
    id: FilterStateId.SkippingVersionsV0,
    masterKey: string,
};

type FilterState_SkippingPrefix = {
    id: FilterStateId.SkippingPrefix,
    prefix: string,
};

type FilterState_WaitVersionAfterPHDV0 = {
    id: FilterStateId.WaitVersionAfterPHDV0,
    masterKey: string,
};

type FilterState_AcceptingMasterKeysV1 = {
    id: FilterStateId.AcceptingMasterKeysV1,
};

type FilterState =
    FilterState_WaitFirstMasterV0 |
    FilterState_SkippingVersionsV0 |
    FilterState_SkippingPrefix |
    FilterState_WaitVersionAfterPHDV0 |
    FilterState_AcceptingMasterKeysV1;

/**
 * Handle object listing with parameters. This extends the base class Delimiter
 * to return the raw master versions of existing objects.
 */
export class DelimiterMaster extends Delimiter {

    state: FilterState;

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

        if (vFormat === BucketVersioningKeyFormat.v0) {
            this.state = { id: FilterStateId.WaitFirstMasterV0 };
        } else {
            this.state = { id: FilterStateId.AcceptingMasterKeysV1 };
        }
    }

    /**
     *  Filter to apply on each iteration based on:
     *  - prefix
     *  - delimiter
     *  - maxKeys
     *  The marker is being handled directly by levelDB
     *  @param {Object} obj       - The key and value of the element
     *  @param {String} obj.key   - The key of the element
     *  @param {String} obj.value - The value of the element
     *  @return {number}          - indicates if iteration should continue
     */
    filter(obj) {
        const key = this.getObjectKey(obj);
        const value = obj.value;

        this[this.nextContinueMarker] = key;

        switch (this.state.id) {
        case FilterStateId.WaitFirstMasterV0:
            return this.stateHandler_WaitFirstMasterV0(key, value);

        case FilterStateId.SkippingVersionsV0:
            return this.stateHandler_SkippingVersionsV0(key, value);

        case FilterStateId.SkippingPrefix:
            return this.stateHandler_SkippingPrefix(key, value);

        case FilterStateId.WaitVersionAfterPHDV0:
            return this.stateHandler_WaitVersionAfterPHDV0(key, value);

        case FilterStateId.AcceptingMasterKeysV1:
            return this.stateHandler_AcceptingMasterKeysV1(key, value);
        };
    }

    setState(state: FilterState) {
        this.state = state;
    }

    filter_onNewMasterKeyV0(key, value) {
        // update the state with the new master key
        this.setState({ id: FilterStateId.SkippingVersionsV0, masterKey: key });
        /* if this master key is a delete marker, accept it without
         * adding the version to the contents */
        if (Version.isDeleteMarker(value)) {
            return FILTER_ACCEPT;
        }
        if (Version.isPHD(value)) {
            /* master version is a PHD version, we want to wait for
             * the first following version */
            this.setState({ id: FilterStateId.WaitVersionAfterPHDV0, masterKey: key });
            return FILTER_ACCEPT;
        }
        if (key.startsWith(DbPrefixes.Replay)) {
            this.setState({ id: FilterStateId.SkippingPrefix, prefix: DbPrefixes.Replay });
            return FILTER_SKIP;
        }
        return this.filter_onAcceptedMasterKey(key, value);
    }

    filter_onAcceptedMasterKey(key, value) {
        if (this.delimiter) {
            // check if the key has the delimiter
            const baseIndex = this.prefix ? this.prefix.length : 0;
            const delimiterIndex = key.indexOf(this.delimiter, baseIndex);
            if (delimiterIndex >= 0) {
                // add the new prefix to the list
                const commonPrefix = key.substring(0, delimiterIndex + this.delimiter.length);
                this.CommonPrefixes.push(commonPrefix);
                ++this.keys;
                if (this._reachedMaxKeys()) {
                    return FILTER_END;
                }
                // transition into SkippingPrefix state to skip all following keys
                // while they start with the same prefix
                this.setState({ id: FilterStateId.SkippingPrefix, prefix: commonPrefix });
                return FILTER_ACCEPT;
            }
        }
        this.Contents.push({ key, value: this.trimMetadata(value) });
        ++this.keys;
        if (this._reachedMaxKeys()) {
            return FILTER_END;
        }
        return FILTER_ACCEPT;
    }

    stateHandler_WaitFirstMasterV0(key, value) {
        const versionIdIndex = key.indexOf(VID_SEP);
        if (versionIdIndex !== -1) {
            const masterKey = key.slice(0, versionIdIndex);
            this.setState({ id: FilterStateId.SkippingVersionsV0, masterKey });
            return FILTER_SKIP;
        }
        return this.filter_onNewMasterKeyV0(key, value);
    }

    stateHandler_SkippingVersionsV0(key, value) {
        /* In the SkippingVersionsV0 state, skip all version keys
         * (<key><versionIdSeparator><version>) */
        const versionIdIndex = key.indexOf(VID_SEP);
        if (versionIdIndex !== -1) {
            return FILTER_SKIP;
        }
        return this.filter_onNewMasterKeyV0(key, value);
    }

    stateHandler_SkippingPrefix(key, value) {
        const { prefix } = <FilterState_SkippingPrefix> this.state;
        if (key.startsWith(prefix)) {
            return FILTER_SKIP;
        }
        // since the prefix changes, the key changes so it must be a
        // master key (or replay key)
        if (this.vFormat === BucketVersioningKeyFormat.v0) {
            return this.filter_onNewMasterKeyV0(key, value);
        }
        this.setState({ id: FilterStateId.AcceptingMasterKeysV1 });
        return this.filter_onAcceptedMasterKey(key, value);
    }

    stateHandler_WaitVersionAfterPHDV0(key, value) {
        // After a PHD key is encountered, the next version key of the
        // same object if it exists is the new master key, hence
        // consider it as such and call 'onNewMasterKeyV0' (the test
        // 'masterKey == phdKey' is probably redundant when we already
        // know we have a versioned key, since all objects in v0 have
        // a master key, but keeping it in doubt)
        const { masterKey: phdKey } = <FilterState_WaitVersionAfterPHDV0> this.state;
        const versionIdIndex = key.indexOf(VID_SEP);
        if (versionIdIndex !== -1) {
            const masterKey = key.slice(0, versionIdIndex);
            if (masterKey === phdKey) {
                return this.filter_onNewMasterKeyV0(masterKey, value);
            }
        }
        return this.filter_onNewMasterKeyV0(key, value);
    }

    stateHandler_AcceptingMasterKeysV1(key, value) {
        return this.filter_onAcceptedMasterKey(key, value);
    }

    skippingBase(): string | undefined {
        switch (this.state.id) {
        case FilterStateId.SkippingPrefix:
            const { prefix } = <FilterState_SkippingPrefix> this.state;
            return prefix;

        case FilterStateId.SkippingVersionsV0:
            const { masterKey } = <FilterState_SkippingVersionsV0> this.state;
            return masterKey + VID_SEP;

        default:
            return SKIP_NONE;
        }
    }

    skippingV0() {
        return this.skippingBase();
    }

    skippingV1() {
        const skipTo = this.skippingBase();
        if (skipTo === SKIP_NONE) {
            return SKIP_NONE;
        }
        return DbPrefixes.Master + skipTo;
    }
}
