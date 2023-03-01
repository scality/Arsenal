import assert from 'assert';

import LifecycleDateTime from './LifecycleDateTime';
import { supportedLifecycleRules } from '../../constants';

export default class LifecycleUtils {
    _supportedRules: string[];
    _datetime: LifecycleDateTime;

    constructor(supportedRules?: string[], datetime?: LifecycleDateTime) {
        if (supportedRules) {
            assert(Array.isArray(supportedRules));
        }

        if (datetime) {
            assert(datetime instanceof LifecycleDateTime);
        }

        this._supportedRules = supportedRules || supportedLifecycleRules;
        this._datetime = datetime || new LifecycleDateTime();
    }

    /**
    * Compare two transition rules and return the one that is most recent.
    * @param params - The function parameters
    * @param params.transition1 - A transition from the current rule
    * @param params.transition2 - A transition from the previous rule
    * @param params.lastModified - The object's last modified
    * date
    * @return The most applicable transition rule
    */
    compareTransitions(params: {
        lastModified: string;
        transition1: any;
        transition2?: any;
    }): number | undefined;
    compareTransitions(params: {
        lastModified: string;
        transition1?: any;
        transition2: any;
    }): number | undefined;
    compareTransitions(params: {
        lastModified: string;
        transition1: any;
        transition2: any;
    }): number | undefined;
    compareTransitions(params: {
        lastModified: string;
        transition1?: any;
        transition2?: any;
    }) {
        const { transition1, transition2, lastModified } = params;
        if (transition1 === undefined) {
            return transition2;
        }
        if (transition2 === undefined) {
            return transition1;
        }
        const trans1 = this._datetime.getTransitionTimestamp(transition1!, lastModified)!;
        const trans2 = this._datetime.getTransitionTimestamp(transition2!, lastModified)!;
        return trans1 > trans2 ? transition1 : transition2;
    }

    // TODO Fix This
    /**
    * Find the most relevant trantition rule for the given transitions array
    * and any previously stored transition from another rule.
    * @param params - The function parameters
    * @param params.transitions - Array of lifecycle rule transitions
    * @param params.lastModified - The object's last modified
    * date
    * @return The most applicable transition rule
    */
    getApplicableTransition(params: {
        store: any;
        currentDate: Date;
        transitions: any[];
        lastModified: string;
    }) {
        const { transitions, store, lastModified, currentDate } = params;
        const transition = transitions.reduce((result, transition) => {
            const isApplicable = // Is the transition time in the past?
                this._datetime.getTimestamp(currentDate) >=
                this._datetime.getTransitionTimestamp(transition, lastModified)!;
            if (!isApplicable) {
                return result;
            }
            return this.compareTransitions({
                transition1: transition,
                transition2: result,
                lastModified,
            });
        }, undefined);
        return this.compareTransitions({
            transition1: transition,
            transition2: store.Transition,
            lastModified,
        });
    }

    // TODO
    /**
    * Filter out all rules based on `Status` and `Filter` (Prefix and Tags)
    * @param bucketLCRules - array of bucket lifecycle rules
    * @param item - represents a single object, version, or upload
    * @param objTags - all tags for given `item`
    * @return list of all filtered rules that apply to `item`
    */
    filterRules(bucketLCRules: any[], item: any, objTags: any) {
        /*
            Bucket Tags must be included in the list of object tags.
            So if a bucket tag with "key1/value1" exists, and an object with
            "key1/value1, key2/value2" exists, this bucket lifecycle rules
            apply on this object.

            Vice versa, bucket rule is "key1/value1, key2/value2" and object
            rule is "key1/value1", this buckets rule does not apply to this
            object.
        */
        function deepCompare(rTags: any, oTags: any) {
            // check to make sure object tags length matches or is greater
            if (rTags.length > oTags.length) {
                return false;
            }
            // all key/value tags of bucket rules must be within object tags
            for (let i = 0; i < rTags.length; i++) {
                const oTag = oTags.find((pair: any) => pair.Key === rTags[i].Key);
                if (!oTag || rTags[i].Value !== oTag.Value) {
                    return false;
                }
            }
            return true;
        }

        return bucketLCRules.filter(rule => {
            if (rule.Status === 'Disabled') {
                return false;
            }
            // check all locations where prefix could possibly be
            // console.log(rule.Prefix);
            // console.log(rule.Filter);
            // console.log(rule.Filter.And);
            const prefix = rule.Prefix
                    || (rule.Filter && (rule.Filter.And
                        ? rule.Filter.And.Prefix
                        : rule.Filter.Prefix));
            if (prefix && !item.Key.startsWith(prefix)) {
                return false;
            }
            if (!rule.Filter) {
                return true;
            }
            const tags = rule.Filter.And
                ? rule.Filter.And.Tags
                : (rule.Filter.Tag && [rule.Filter.Tag]);
            if (tags && !deepCompare(tags, objTags.TagSet || [])) {
                return false;
            }
            return true;
        });
    }

    // TODO
    /**
    * For all filtered rules, get rules that apply the earliest
    * @param rules - list of filtered rules that apply to a specific
    *   object, version, or upload
    * @param metadata - metadata about the object to transition
    * @return all applicable rules with earliest dates of action
    *  i.e. { Expiration: { Date: <DateObject>, Days: 10 },
    *         NoncurrentVersionExpiration: { NoncurrentDays: 5 } }
    */
    getApplicableRules(rules: any[], metadata: any) {
        // Declare the current date before the reducing function so that all
        // rule comparisons use the same date.
        const currentDate = new Date();
        /* eslint-disable no-param-reassign */
        const applicableRules = rules.reduce((store, rule) => {
            // filter and find earliest dates
            if (rule.Expiration && this._supportedRules.includes('expiration')) {
                if (!store.Expiration) {
                    store.Expiration = {};
                }
                if (rule.Expiration.Days) {
                    if (!store.Expiration.Days || rule.Expiration.Days
                    < store.Expiration.Days) {
                        store.Expiration.ID = rule.ID;
                        store.Expiration.Days = rule.Expiration.Days;
                    }
                }
                if (rule.Expiration.Date) {
                    if (!store.Expiration.Date || rule.Expiration.Date
                    < store.Expiration.Date) {
                        store.Expiration.ID = rule.ID;
                        store.Expiration.Date = rule.Expiration.Date;
                    }
                }
                const eodm = rule.Expiration.ExpiredObjectDeleteMarker;
                if (eodm !== undefined) {
                    // preference for later rules in list of rules
                    store.Expiration.ID = rule.ID;
                    store.Expiration.ExpiredObjectDeleteMarker = eodm;
                }
            }
            if (rule.NoncurrentVersionExpiration
            && this._supportedRules.includes('noncurrentVersionExpiration')) {
                // Names are long, so obscuring a bit
                const ncve = 'NoncurrentVersionExpiration';
                const ncd = 'NoncurrentDays';
                const nncv = 'NewerNoncurrentVersions';

                if (!store[ncve]) {
                    store[ncve] = {};
                }
                if (!store[ncve][ncd] || rule[ncve][ncd] < store[ncve][ncd]) {
                    store[ncve].ID = rule.ID;
                    store[ncve][ncd] = rule[ncve][ncd];
                    store[ncve][nncv] = rule[ncve][nncv];
                }
            }
            if (rule.AbortIncompleteMultipartUpload
            && this._supportedRules.includes('abortIncompleteMultipartUpload')) {
                // Names are long, so obscuring a bit
                const aimu = 'AbortIncompleteMultipartUpload';
                const dai = 'DaysAfterInitiation';

                if (!store[aimu]) {
                    store[aimu] = {};
                }
                if (!store[aimu][dai] || rule[aimu][dai] < store[aimu][dai]) {
                    store[aimu].ID = rule.ID;
                    store[aimu][dai] = rule[aimu][dai];
                }
            }
            const hasTransitions = Array.isArray(rule.Transitions) && rule.Transitions.length > 0;
            if (hasTransitions && this._supportedRules.includes('transitions')) {
                store.Transition = this.getApplicableTransition({
                    transitions: rule.Transitions,
                    lastModified: metadata.LastModified,
                    store,
                    currentDate,
                });
            }
            // TODO: Add support for NoncurrentVersionTransitions.
            return store;
        }, {});
        // Do not transition to a location where the object is already stored.
        if (applicableRules.Transition
            && applicableRules.Transition.StorageClass === metadata.StorageClass) {
            applicableRules.Transition = undefined;
        }
        return applicableRules;
        /* eslint-enable no-param-reassign */
    }
}
