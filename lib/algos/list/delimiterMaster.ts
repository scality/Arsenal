import {
    Delimiter,
    FilterState,
    FilterReturnValue,
    DelimiterFilterStateId,
    DelimiterFilterState_NotSkipping,
    DelimiterFilterState_SkippingPrefix,
    ResultObject,
} from './delimiter';
const Version = require('../../versioning/Version').Version;
const VSConst = require('../../versioning/constants').VersioningConstants;
const { BucketVersioningKeyFormat } = VSConst;
const { FILTER_ACCEPT, FILTER_SKIP, FILTER_END, SKIP_NONE, inc } = require('./tools');

import { GapSetEntry } from '../cache/GapSet';
import { GapCacheInterface } from '../cache/GapCache';

const VID_SEP = VSConst.VersionId.Separator;
const { DbPrefixes } = VSConst;

export const enum DelimiterMasterFilterStateId {
    SkippingVersionsV0 = 101,
    WaitVersionAfterPHDV0 = 102,
    SkippingGapV0 = 103,
};

interface DelimiterMasterFilterState_SkippingVersionsV0 extends FilterState {
    id: DelimiterMasterFilterStateId.SkippingVersionsV0,
    masterKey: string,
};

interface DelimiterMasterFilterState_WaitVersionAfterPHDV0 extends FilterState {
    id: DelimiterMasterFilterStateId.WaitVersionAfterPHDV0,
    masterKey: string,
};

interface DelimiterMasterFilterState_SkippingGapV0 extends FilterState {
    id: DelimiterMasterFilterStateId.SkippingGapV0,
};

export const enum GapCachingState {
    NoGapCache = 0, // there is no gap cache
    UnknownGap = 1, // waiting for a cache lookup
    GapLookupInProgress = 2, // asynchronous gap lookup in progress
    GapCached = 3, // an upcoming or already skippable gap is cached
    NoMoreGap = 4, // the cache doesn't have any more gaps inside the listed range
};

type GapCachingInfo_NoGapCache = {
    state: GapCachingState.NoGapCache;
};

type GapCachingInfo_NoCachedGap = {
    state: GapCachingState.UnknownGap
        | GapCachingState.GapLookupInProgress
    gapCache: GapCacheInterface;
};

type GapCachingInfo_GapCached = {
    state: GapCachingState.GapCached;
    gapCache: GapCacheInterface;
    gapCached: GapSetEntry;
};

type GapCachingInfo_NoMoreGap = {
    state: GapCachingState.NoMoreGap;
};

type GapCachingInfo = GapCachingInfo_NoGapCache
    | GapCachingInfo_NoCachedGap
    | GapCachingInfo_GapCached
    | GapCachingInfo_NoMoreGap;


export const enum GapBuildingState {
    Disabled = 0, // no gap cache or no gap building needed (e.g. in V1 versioning format)
    NotBuilding = 1, // not currently building a gap (i.e. not listing within a gap)
    Building = 2, // currently building a gap (i.e. listing within a gap)
    Expired = 3, // not allowed to build due to exposure delay timeout
};

type GapBuildingInfo_NothingToBuild = {
    state: GapBuildingState.Disabled | GapBuildingState.Expired;
};

type GapBuildingParams = {
    /**
     * minimum weight for a gap to be created in the cache
     */
    minGapWeight: number;
    /**
     * trigger a cache setGap() call every N skippable keys
     */
    triggerSaveGapWeight: number;
    /**
     * timestamp to assess whether we're still inside the validity period to
     * be allowed to build gaps
     */
    initTimestamp: number;
};

type GapBuildingInfo_NotBuilding = {
    state: GapBuildingState.NotBuilding;
    gapCache: GapCacheInterface;
    params: GapBuildingParams;
};

type GapBuildingInfo_Building = {
    state: GapBuildingState.Building;
    gapCache: GapCacheInterface;
    params: GapBuildingParams;
    /**
     * Gap currently being created
     */
    gap: GapSetEntry;
    /**
     * total current weight of the gap being created
     */
    gapWeight: number;
};

type GapBuildingInfo = GapBuildingInfo_NothingToBuild
    | GapBuildingInfo_NotBuilding
    | GapBuildingInfo_Building;

/**
 * Handle object listing with parameters. This extends the base class Delimiter
 * to return the raw master versions of existing objects.
 */
export class DelimiterMaster extends Delimiter {

    _gapCaching: GapCachingInfo;
    _gapBuilding: GapBuildingInfo;
    _refreshedBuildingParams: GapBuildingParams | null;

    /**
     * Delimiter listing of master versions.
     * @param {Object}  parameters            - listing parameters
     * @param {String}  [parameters.delimiter]  - delimiter per amazon format
     * @param {String}  [parameters.prefix]     - prefix per amazon format
     * @param {String}  [parameters.marker]     - marker per amazon format
     * @param {Number}  [parameters.maxKeys]    - number of keys to list
     * @param {Boolean} [parameters.v2]         - indicates whether v2 format
     * @param {String}  [parameters.startAfter] - marker per amazon v2 format
     * @param {String}  [parameters.continuationToken] - obfuscated amazon token
     * @param {RequestLogger} logger            - The logger of the request
     * @param {String}  [vFormat="v0"]          - versioning key format
     */
    constructor(parameters, logger, vFormat?: string) {
        super(parameters, logger, vFormat);

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

            this.setKeyHandler(
                DelimiterMasterFilterStateId.SkippingGapV0,
                this.keyHandler_SkippingGapV0.bind(this));

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
        } else {
            // save base implementation of the `NotSkipping` state in
            // Delimiter before overriding it with ours, to be able to call it from there
            this.keyHandler_NotSkipping_Delimiter = this.keyHandlers[DelimiterFilterStateId.NotSkipping];
            this.setKeyHandler(
                DelimiterFilterStateId.NotSkipping,
                this.keyHandler_NotSkippingPrefixNorVersionsV1.bind(this));
        }
        // in v1, we can directly use Delimiter's implementation,
        // which is already set to the proper state

        // default initialization of the gap cache and building states, can be
        // set by refreshGapCache()
        this._gapCaching = {
            state: GapCachingState.NoGapCache,
        };
        this._gapBuilding = {
            state: GapBuildingState.Disabled,
        };
        this._refreshedBuildingParams = null;
    }

    /**
     * Get the validity period left before a refresh of the gap cache is needed
     * to continue building new gaps.
     *
     * @return {number|null} one of:
     * - the remaining time in milliseconds in which gaps can be added to the
     *   cache before a call to refreshGapCache() is required
     * - or 0 if there is no time left and a call to refreshGapCache() is required
     *   to resume caching gaps
     * - or null if refreshing the cache is never needed (because the gap cache
     *   is either not available or not used)
     */
    getGapBuildingValidityPeriodMs(): number | null {
        let gapBuilding;
        switch (this._gapBuilding.state) {
        case GapBuildingState.Disabled:
            return null;
        case GapBuildingState.Expired:
            return 0;
        case GapBuildingState.NotBuilding:
            gapBuilding = <GapBuildingInfo_NotBuilding> this._gapBuilding;
            break;
        case GapBuildingState.Building:
            gapBuilding = <GapBuildingInfo_Building> this._gapBuilding;
            break;
        }
        const { gapCache, params } = gapBuilding;
        const elapsedTime = Date.now() - params.initTimestamp;
        return Math.max(gapCache.exposureDelayMs - elapsedTime, 0);
    }

    /**
     * Refresh the gaps caching logic (gaps are series of current delete markers
     * in V0 bucket metadata format). It has two effects:
     *
     * - starts exposing existing and future gaps from the cache to efficiently
     *   skip over series of current delete markers that have been seen and cached
     *   earlier
     *
     * - enables building and caching new gaps (or extend existing ones), for a
     *   limited time period defined by the `gapCacheProxy.exposureDelayMs` value
     *   in milliseconds. To refresh the validity period and resume building and
     *   caching new gaps, one must restart a new listing from the database (starting
     *   at the current listing key, included), then call refreshGapCache() again.
     *
     * @param {GapCacheInterface} gapCacheProxy - API proxy to the gaps cache
     *   (the proxy should handle prefixing object keys with the bucket name)
     * @param {number} [minGapWeight=100] - minimum weight of a gap for it to be
     *   added in the cache
     * @param {number} [triggerSaveGapWeight] - cumulative weight to wait for
     *   before saving the current building gap. Cannot be greater than
     *   `gapCacheProxy.maxGapWeight` (the value is thresholded to `maxGapWeight`
     *   otherwise). Defaults to `gapCacheProxy.maxGapWeight / 2`.
     * @return {undefined}
     */
    refreshGapCache(
        gapCacheProxy: GapCacheInterface,
        minGapWeight?: number,
        triggerSaveGapWeight?: number
    ): void {
        if (this.vFormat !== BucketVersioningKeyFormat.v0) {
            return;
        }
        if (this._gapCaching.state === GapCachingState.NoGapCache) {
            this._gapCaching = {
                state: GapCachingState.UnknownGap,
                gapCache: gapCacheProxy,
            };
        }
        const refreshedBuildingParams: GapBuildingParams = {
            minGapWeight: minGapWeight || 100,
            triggerSaveGapWeight: triggerSaveGapWeight
                || Math.trunc(gapCacheProxy.maxGapWeight / 2),
            initTimestamp: Date.now(),
        };
        if (this._gapBuilding.state === GapBuildingState.Building) {
            // refreshed params will be applied as soon as the current building gap is saved
            this._refreshedBuildingParams = refreshedBuildingParams;
        } else {
            this._gapBuilding = {
                state: GapBuildingState.NotBuilding,
                gapCache: gapCacheProxy,
                params: refreshedBuildingParams,
            };
        }
    }

    /**
     * Trigger a lookup of the closest upcoming or already skippable gap.
     *
     * @param {string} fromKey - lookup a gap not before 'fromKey'
     * @return {undefined} - the lookup is asynchronous and its
     * response is handled inside this function
     */
    _triggerGapLookup(gapCaching: GapCachingInfo_NoCachedGap, fromKey: string): void {
        this._gapCaching = {
            state: GapCachingState.GapLookupInProgress,
            gapCache: gapCaching.gapCache,
        };
        const maxKey = this.prefix ? inc(this.prefix) : undefined;
        gapCaching.gapCache.lookupGap(fromKey, maxKey).then(_gap => {
            const gap = <GapSetEntry | null> _gap;
            if (gap) {
                this._gapCaching = {
                    state: GapCachingState.GapCached,
                    gapCache: gapCaching.gapCache,
                    gapCached: gap,
                };
            } else {
                this._gapCaching = {
                    state: GapCachingState.NoMoreGap,
                };
            }
        });
    }

    _checkGapOnMasterDeleteMarker(key: string): FilterReturnValue {
        switch (this._gapBuilding.state) {
        case GapBuildingState.Disabled:
        case GapBuildingState.Expired:
            break;
        case GapBuildingState.NotBuilding:
            this._createBuildingGap(key, 1);
            break;
        case GapBuildingState.Building:
            this._updateBuildingGap(key);
            break;
        }
        if (this._gapCaching.state === GapCachingState.GapCached) {
            const { gapCached } = this._gapCaching;
            if (key >= gapCached.firstKey) {
                if (key <= gapCached.lastKey) {
                    // we are inside the last looked up cached gap: transition to
                    // 'SkippingGapV0' state
                    this.setState(<DelimiterMasterFilterState_SkippingGapV0> {
                        id: DelimiterMasterFilterStateId.SkippingGapV0,
                    });
                    // cut the current gap before skipping, it will be merged or
                    // chained with the existing one (depending on its weight)
                    if (this._gapBuilding.state === GapBuildingState.Building) {
                        // substract 1 from the weight because we are going to chain this gap,
                        // which has an overlap of one key.
                        this._gapBuilding.gap.weight -= 1;
                        this._cutBuildingGap();
                    }
                    return FILTER_SKIP;
                }
                // as we are past the cached gap, we will need another lookup
                this._gapCaching = {
                    state: GapCachingState.UnknownGap,
                    gapCache: this._gapCaching.gapCache,
                };
            }
        }
        if (this._gapCaching.state === GapCachingState.UnknownGap) {
            this._triggerGapLookup(this._gapCaching, key);
        }
        return FILTER_ACCEPT;
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
            return this._checkGapOnMasterDeleteMarker(key);
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
        // cut the current gap as soon as a non-deleted entry is seen
        this._cutBuildingGap();

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

    filter_onNewMasterKeyV1(key: string, value: string): FilterReturnValue {
        // if this master key is a delete marker, accept it without
        // adding the version to the contents
        if (Version.isDeleteMarker(value)) {
            return FILTER_ACCEPT;
        }
        // use base Delimiter's implementation
        return this.keyHandler_NotSkipping_Delimiter(key, value);
    }

    keyHandler_NotSkippingPrefixNorVersionsV1(key: string, value: string): FilterReturnValue {
        return this.filter_onNewMasterKeyV1(key, value);
    }

    keyHandler_SkippingVersionsV0(key: string, value: string): FilterReturnValue {
        /* In the SkippingVersionsV0 state, skip all version keys
         * (<key><versionIdSeparator><version>) */
        const versionIdIndex = key.indexOf(VID_SEP);
        if (versionIdIndex !== -1) {
            // version keys count in the building gap weight because they must
            // also be listed until skipped
            if (this._gapBuilding.state === GapBuildingState.Building) {
                this._updateBuildingGap(key);
            }
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

    keyHandler_SkippingGapV0(key: string, value: string): FilterReturnValue {
        const { gapCache, gapCached } = <GapCachingInfo_GapCached> this._gapCaching;
        if (key <= gapCached.lastKey) {
            return FILTER_SKIP;
        }
        this._gapCaching = {
            state: GapCachingState.UnknownGap,
            gapCache,
        };
        this.setState(<DelimiterMasterFilterState_SkippingVersionsV0> {
            id: DelimiterMasterFilterStateId.SkippingVersionsV0,
        });
        // Start a gap with weight=0 from the latest skippable key. This will
        // allow to extend the gap just skipped with a chained gap in case
        // other delete markers are seen after the existing gap is skipped.
        this._createBuildingGap(gapCached.lastKey, 0, gapCached.weight);

        return this.handleKey(key, value);
    }

    skippingBase(): string | undefined {
        switch (this.state.id) {
        case DelimiterMasterFilterStateId.SkippingVersionsV0:
            const { masterKey } = <DelimiterMasterFilterState_SkippingVersionsV0> this.state;
            return masterKey + inc(VID_SEP);

        case DelimiterMasterFilterStateId.SkippingGapV0:
            const { gapCached } = <GapCachingInfo_GapCached> this._gapCaching;
            return gapCached.lastKey;

        default:
            return super.skippingBase();
        }
    }

    result(): ResultObject {
        this._cutBuildingGap();
        return super.result();
    }

    _checkRefreshedBuildingParams(params: GapBuildingParams): GapBuildingParams {
        if (this._refreshedBuildingParams) {
            const newParams = this._refreshedBuildingParams;
            this._refreshedBuildingParams = null;
            return newParams;
        }
        return params;
    }

    /**
     * Save the gap being built if allowed (i.e. still within the
     * allocated exposure time window).
     *
     * @return {boolean} - true if the gap was saved, false if we are
     * outside the allocated exposure time window.
     */
    _saveBuildingGap(): boolean {
        const { gapCache, params, gap, gapWeight } =
              <GapBuildingInfo_Building> this._gapBuilding;
        const totalElapsed = Date.now() - params.initTimestamp;
        if (totalElapsed >= gapCache.exposureDelayMs) {
            this._gapBuilding = {
                state: GapBuildingState.Expired,
            };
            this._refreshedBuildingParams = null;
            return false;
        }
        const { firstKey, lastKey, weight } = gap;
        gapCache.setGap(firstKey, lastKey, weight);
        this._gapBuilding = {
            state: GapBuildingState.Building,
            gapCache,
            params: this._checkRefreshedBuildingParams(params),
            gap: {
                firstKey: gap.lastKey,
                lastKey: gap.lastKey,
                weight: 0,
            },
            gapWeight,
        };
        return true;
    }

    /**
     * Create a new gap to be extended afterwards
     *
     * @param {string} newKey - gap's first key
     * @param {number} startWeight - initial weight of the building gap (usually 0 or 1)
     * @param {number} [cachedWeight] - if continuing a cached gap, weight of the existing
     *   cached portion
     * @return {undefined}
     */
    _createBuildingGap(newKey: string, startWeight: number, cachedWeight?: number): void {
        if (this._gapBuilding.state === GapBuildingState.NotBuilding) {
            const { gapCache, params } = <GapBuildingInfo_NotBuilding> this._gapBuilding;
            this._gapBuilding = {
                state: GapBuildingState.Building,
                gapCache,
                params: this._checkRefreshedBuildingParams(params),
                gap: {
                    firstKey: newKey,
                    lastKey: newKey,
                    weight: startWeight,
                },
                gapWeight: (cachedWeight || 0) + startWeight,
            };
        }
    }

    _updateBuildingGap(newKey: string): void {
        const gapBuilding = <GapBuildingInfo_Building> this._gapBuilding;
        const { params, gap } = gapBuilding;
        gap.lastKey = newKey;
        gap.weight += 1;
        gapBuilding.gapWeight += 1;
        // the GapCache API requires updating a gap regularly because it can only split
        // it once per update, by the known last key. In practice the default behavior
        // is to trigger an update after a number of keys that is half the maximum weight.
        // It is also useful for other listings to benefit from the cache sooner.
        if (gapBuilding.gapWeight >= params.minGapWeight &&
            gap.weight >= params.triggerSaveGapWeight) {
            this._saveBuildingGap();
        }
    }

    _cutBuildingGap(): void {
        if (this._gapBuilding.state === GapBuildingState.Building) {
            let gapBuilding = <GapBuildingInfo_Building> this._gapBuilding;
            let { gapCache, params, gap, gapWeight } = gapBuilding;
            // only set gaps that are significant enough in weight and
            // with a non-empty extension
            if (gapWeight >= params.minGapWeight && gap.weight > 0) {
                // we're done if we were not allowed to save the gap
                if (!this._saveBuildingGap()) {
                    return;
                }
                // params may have been refreshed, reload them
                gapBuilding = <GapBuildingInfo_Building> this._gapBuilding;
                params = gapBuilding.params;
            }
            this._gapBuilding = {
                state: GapBuildingState.NotBuilding,
                gapCache,
                params,
            };
        }
    }
}
