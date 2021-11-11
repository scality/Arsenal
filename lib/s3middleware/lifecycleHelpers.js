const LifecycleDateTime = require('../models/LifecycleDateTime');
const { supportedLifecycleRules } = require('../constants');

const defaultDateTime = new LifecycleDateTime();

/**
 * Compare two transition rules and return the one that is most recent.
 * @param {object} params - The function parameters
 * @param {object} params.transition1 - A transition from the current rule
 * @param {object} params.transition2 - A transition from the previous rule
 * @param {string} params.lastModified - The object's last modified
 * date
 * @param {LifecycleDateTime} datetime - lifecycle datetime class
 * @return {object} The most applicable transition rule
 */
function compareTransitions(params, datetime) {
    const { transition1, transition2, lastModified } = params;
    if (transition1 === undefined) {
        return transition2;
    }
    if (transition2 === undefined) {
        return transition1;
    }
    return datetime.getTransitionTimestamp(transition1, lastModified)
        > datetime.getTransitionTimestamp(transition2, lastModified)
        ? transition1 : transition2;
}

/**
 * Find the most relevant trantition rule for the given transitions array
 * and any previously stored transition from another rule.
 * @param {object} params - The function parameters
 * @param {array} params.transitions - Array of lifecycle rule transitions
 * @param {string} params.lastModified - The object's last modified
 * date
 * @param {LifecycleDateTime} datetime - lifecycle datetime class
 * @return {object} The most applicable transition rule
 */
function getApplicableTransition(params, datetime) {
    const {
        transitions, store, lastModified, currentDate,
    } = params;

    const transition = transitions.reduce((result, transition) => {
        const isApplicable = // Is the transition time in the past?
            datetime.getTimestamp(currentDate) >=
            datetime.getTransitionTimestamp(transition, lastModified);
        if (!isApplicable) {
            return result;
        }
        return compareTransitions({
            transition1: transition,
            transition2: result,
            lastModified,
        }, datetime);
    }, undefined);
    return compareTransitions({
        transition1: transition,
        transition2: store.Transition,
        lastModified,
    }, datetime);
}

/**
 * Filter out all rules based on `Status` and `Filter` (Prefix and Tags)
 * @param {array} bucketLCRules - array of bucket lifecycle rules
 * @param {object} item - represents a single object, version, or upload
 * @param {object} objTags - all tags for given `item`
 * @param {LifecycleDateTime} datetime - lifecycle datetime class
 * @return {array} list of all filtered rules that apply to `item`
 */
function filterRules(bucketLCRules, item, objTags) {
    /*
        Bucket Tags must be included in the list of object tags.
        So if a bucket tag with "key1/value1" exists, and an object with
        "key1/value1, key2/value2" exists, this bucket lifecycle rules
        apply on this object.

        Vice versa, bucket rule is "key1/value1, key2/value2" and object
        rule is "key1/value1", this buckets rule does not apply to this
        object.
    */
    function deepCompare(rTags, oTags) {
        // check to make sure object tags length matches or is greater
        if (rTags.length > oTags.length) {
            return false;
        }
        // all key/value tags of bucket rules must be within object tags
        for (let i = 0; i < rTags.length; i++) {
            const oTag = oTags.find(pair => pair.Key === rTags[i].Key);
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

/**
 * For all filtered rules, get rules that apply the earliest
 * @param {array} rules - list of filtered rules that apply to a specific
 *   object, version, or upload
 * @param {object} metadata - metadata about the object to transition
 * @param {LifecycleDateTime} datetime - lifecycle datetime class
 * @return {object} all applicable rules with earliest dates of action
 *  i.e. { Expiration: { Date: <DateObject>, Days: 10 },
 *         NoncurrentVersionExpiration: { NoncurrentDays: 5 } }
 */
function getApplicableRules(rules, metadata, datetime) {
    const dt = datetime || defaultDateTime;
    // Declare the current date before the reducing function so that all
    // rule comparisons use the same date.
    const currentDate = new Date();
    /* eslint-disable no-param-reassign */
    const applicableRules = rules.reduce((store, rule) => {
        // filter and find earliest dates
        if (rule.Expiration && supportedLifecycleRules.includes('expiration')) {
            if (!store.Expiration) {
                store.Expiration = {};
            }
            if (rule.Expiration.Days) {
                if (!store.Expiration.Days || rule.Expiration.Days
                < store.Expiration.Days) {
                    store.Expiration.Days = rule.Expiration.Days;
                }
            }
            if (rule.Expiration.Date) {
                if (!store.Expiration.Date || rule.Expiration.Date
                < store.Expiration.Date) {
                    store.Expiration.Date = rule.Expiration.Date;
                }
            }
            const eodm = rule.Expiration.ExpiredObjectDeleteMarker;
            if (eodm !== undefined) {
                // preference for later rules in list of rules
                store.Expiration.ExpiredObjectDeleteMarker = eodm;
            }
        }
        if (rule.NoncurrentVersionExpiration
        && supportedLifecycleRules.includes('noncurrentVersionExpiration')) {
            // Names are long, so obscuring a bit
            const ncve = 'NoncurrentVersionExpiration';
            const ncd = 'NoncurrentDays';

            if (!store[ncve]) {
                store[ncve] = {};
            }
            if (!store[ncve][ncd] || rule[ncve][ncd] < store[ncve][ncd]) {
                store[ncve][ncd] = rule[ncve][ncd];
            }
        }
        if (rule.AbortIncompleteMultipartUpload
        && supportedLifecycleRules.includes('abortIncompleteMultipartUpload')) {
            // Names are long, so obscuring a bit
            const aimu = 'AbortIncompleteMultipartUpload';
            const dai = 'DaysAfterInitiation';

            if (!store[aimu]) {
                store[aimu] = {};
            }
            if (!store[aimu][dai] || rule[aimu][dai] < store[aimu][dai]) {
                store[aimu][dai] = rule[aimu][dai];
            }
        }
        const hasTransitions = Array.isArray(rule.Transitions) && rule.Transitions.length > 0;
        if (hasTransitions && supportedLifecycleRules.includes('transitions')) {
            store.Transition = getApplicableTransition({
                transitions: rule.Transitions,
                lastModified: metadata.LastModified,
                store,
                currentDate,
            }, dt);
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

module.exports = {
    defaultDateTime,
    compareTransitions,
    getApplicableTransition,
    getApplicableRules,
    filterRules,
};
