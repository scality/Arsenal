import uuid from 'uuid/v4';

/**
 * @class LifecycleRule
 *
 * @classdesc Simple get/set class to build a single Rule
 */
export default class LifecycleRule {
    constructor(id, status) {
        // defaults
        this.id = id || uuid();
        this.status = status === 'Disabled' ? 'Disabled' : 'Enabled';
        this.tags = [];
    }

    build() {
        const rule = {};

        rule.ID = this.id;
        rule.Status = this.status;

        if (this.expiration) {
            rule.Expiration = this.expiration;
        }
        if (this.ncvExpiration) {
            rule.NoncurrentVersionExpiration = this.ncvExpiration;
        }
        if (this.abortMPU) {
            rule.AbortIncompleteMultipartUpload = this.abortMPU;
        }
        if (this.transitions) {
            rule.Transitions = this.transitions;
        }


        const filter = {};
        if ((this.prefix && this.tags.length) || (this.tags.length > 1)) {
            // And rule
            const andRule = {};

            if (this.prefix) {
                andRule.Prefix = this.prefix;
            }
            andRule.Tags = this.tags;
            filter.And = andRule;
        } else {
            if (this.prefix) {
                filter.Prefix = this.prefix;
            }
            if (this.tags.length) {
                filter.Tag = this.tags[0];
            }
        }

        if (Object.keys(filter).length > 0) {
            rule.Filter = filter;
        } else {
            rule.Prefix = '';
        }

        return rule;
    }

    addID(id) {
        this.id = id;
        return this;
    }

    disable() {
        this.status = 'Disabled';
        return this;
    }

    addPrefix(prefix) {
        this.prefix = prefix;
        return this;
    }

    addTag(key, value) {
        this.tags.push({
            Key: key,
            Value: value,
        });
        return this;
    }

    /**
    * Expiration
    * @param {string} prop - Property must be defined in `validProps`
    * @param {integer|boolean} value - integer for `Date` or `Days`, or
    *   boolean for `ExpiredObjectDeleteMarker`
    * @return {undefined}
    */
    addExpiration(prop, value) {
        const validProps = ['Date', 'Days', 'ExpiredObjectDeleteMarker'];
        if (validProps.indexOf(prop) > -1) {
            this.expiration = this.expiration || {};
            if (prop === 'ExpiredObjectDeleteMarker') {
                this.expiration[prop] = JSON.parse(value);
            } else {
                this.expiration[prop] = value;
            }
        }
        return this;
    }

    /**
    * NoncurrentVersionExpiration
    * @param {integer} days - NoncurrentDays
    * @return {undefined}
    */
    addNCVExpiration(days) {
        this.ncvExpiration = { NoncurrentDays: days };
        return this;
    }

    /**
    * AbortIncompleteMultipartUpload
    * @param {integer} days - DaysAfterInitiation
    * @return {undefined}
    */
    addAbortMPU(days) {
        this.abortMPU = { DaysAfterInitiation: days };
        return this;
    }

    /**
     * Transitions
     * @param {array} transitions - transitions
     * @return {undefined}
     */
    addTransitions(transitions) {
        this.transitions = transitions;
        return this;
    }
}
