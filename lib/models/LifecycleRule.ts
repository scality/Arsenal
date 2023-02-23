import uuid from 'uuid/v4';

export type Status = 'Disabled' | 'Enabled';
export type Tag = { Key: string; Value: string };
export type Tags = Tag[];
export type And = { Prefix?: string; Tags: Tags };
export type Filter = { Prefix?: string; Tag?: Tag } | { And: And };
export type Expiration = {
    ExpiredObjectDeleteMarker?: number | boolean;
    Date?: number | boolean;
    Days?: number | boolean;
};
export type NoncurrentExpiration = {
    NoncurrentDays: number | null;
    NewerNoncurrentVersions: number | null;
};

/**
 * @class LifecycleRule
 *
 * @classdesc Simple get/set class to build a single Rule
 */
export default class LifecycleRule {
    id: string;
    status: Status;
    tags: Tags;
    expiration?: Expiration;
    ncvExpiration?: NoncurrentExpiration;
    abortMPU?: { DaysAfterInitiation: number };
    transitions?: any[];
    prefix?: string;

    constructor(id: string, status: Status) {
        // defaults
        this.id = id || uuid();
        this.status = status === 'Disabled' ? 'Disabled' : 'Enabled';
        this.tags = [];
    }

    build() {
        const rule: {
            ID: string;
            Status: Status;
            Expiration?: Expiration;
            NoncurrentVersionExpiration?: NoncurrentExpiration;
            AbortIncompleteMultipartUpload?: { DaysAfterInitiation: number };
            Transitions?: any[];
            Filter?: Filter;
            Prefix?: '';
        } = { ID: this.id, Status: this.status };

        if (this.expiration) {
            rule.Expiration = this.expiration;
        }
        if (this.ncvExpiration) {
            console.log(this.ncvExpiration);
            rule.NoncurrentVersionExpiration = this.ncvExpiration
        }
        if (this.abortMPU) {
            rule.AbortIncompleteMultipartUpload = this.abortMPU;
        }
        if (this.transitions) {
            rule.Transitions = this.transitions;
        }

        const filter = this.buildFilter();

        if (Object.keys(filter).length > 0) {
            rule.Filter = filter;
        } else {
            rule.Prefix = '';
        }

        return rule;
    }

    buildFilter() {
        if ((this.prefix && this.tags.length) || this.tags.length > 1) {
            // And rule
            const And: And = { Tags: this.tags };
            if (this.prefix) {
                And.Prefix = this.prefix;
            }
            return { And };
        } else {
            const filter: Filter = {};
            if (this.prefix) {
                filter.Prefix = this.prefix;
            }
            if (this.tags.length > 0) {
                filter.Tag = this.tags[0];
            }
            return filter;
        }
    }

    addID(id: string) {
        this.id = id;
        return this;
    }

    disable() {
        this.status = 'Disabled';
        return this;
    }

    addPrefix(prefix: string) {
        this.prefix = prefix;
        return this;
    }

    addTag(key: string, value: string) {
        this.tags.push({
            Key: key,
            Value: value,
        });
        return this;
    }

    /**
     * Expiration
     * @param prop - Property must be defined in `validProps`
     * @param value - integer for `Date` or `Days`, or boolean for `ExpiredObjectDeleteMarker`
     */
    addExpiration(prop: 'ExpiredObjectDeleteMarker', value: boolean): this;
    addExpiration(prop: 'Date' | 'Days', value: number): this;
    addExpiration(prop: string, value: number | boolean) {
        const validProps = ['Date', 'Days', 'ExpiredObjectDeleteMarker'];
        if (validProps.includes(prop)) {
            this.expiration = this.expiration || {};
            if (prop === 'ExpiredObjectDeleteMarker') {
                // FIXME
                // @ts-expect-error
                this.expiration[prop] = JSON.parse(value);
            } else {
                this.expiration[prop] = value;
            }
        }
        return this;
    }

    /**
     * NoncurrentVersionExpiration
     * @param prop - Property must be defined in `validProps`
     * @param value - integer for `NoncurrentDays` and `NewerNoncurrentVersions` 
     */
    addNCVExpiration(prop: 'NoncurrentDays' | 'NewerNoncurrentVersions', value: number): this;
    addNCVExpiration(prop: string, value: number) {
        const validProps = ['NoncurrentDays', 'NewerNoncurrentVersions'];
        if (validProps.includes(prop)) {
            this.ncvExpiration = this.ncvExpiration || {
                NoncurrentDays: null,
                NewerNoncurrentVersions: null,
            };
            this.ncvExpiration[prop] = value;
        }
        return this;
    }

    /**
     * abortincompletemultipartupload
     * @param days - DaysAfterInitiation
     */
    addAbortMPU(days: number) {
        this.abortMPU = { DaysAfterInitiation: days };
        return this;
    }

    /**
     * Transitions
     * @param transitions - transitions
     */
    addTransitions(transitions: any[]) {
        this.transitions = transitions;
        return this;
    }
}
