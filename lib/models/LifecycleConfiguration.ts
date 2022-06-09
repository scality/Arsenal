import assert from 'assert';
import UUID from 'uuid';

import errors, { ArsenalError } from '../errors';
import LifecycleRule from './LifecycleRule';
import escapeForXml from '../s3middleware/escapeForXml';
import type { XMLRule } from './ReplicationConfiguration';
import { Status } from './LifecycleRule';

const MAX_DAYS = 2147483647; // Max 32-bit signed binary integer.

/**
 * Format of xml request:

 <LifecycleConfiguration>
    <Rule>
        <ID>id1</ID>
        <Filter>
            <Prefix>logs/</Prefix>
        </Filter>
        <Status>Enabled</Status>
        <Expiration>
            <Days>365</Days>
        </Expiration>
    </Rule>
    <Rule>
        <ID>DeleteAfterBecomingNonCurrent</ID>
        <Filter>
            <And>
                <Prefix>logs/</Prefix>
                <Tag>
                    <Key>key1</Key>
                    <Value>value1</Value>
                </Tag>
            </And>
        </Filter>
        <Status>Enabled</Status>
        <NoncurrentVersionExpiration>
            <NoncurrentDays>1</NoncurrentDays>
        </NoncurrentVersionExpiration>
        <AbortIncompleteMultipartUploads>
            <DaysAfterInitiation>1</DaysAfterInitiation>
        </AbortIncompleteMultipartUploads>
    </Rule>
</LifecycleConfiguration>
 */

/**
 * Format of config:

  config = {
    rules = [
        {
            ruleID: <value>,
            ruleStatus: <value>,
            filter: {
                rulePrefix: <value>,
                tags: [
                    {
                        key: <value>,
                        val: <value>
                    },
                    {
                        key: <value>,
                        val: <value>
                    }
                ]
            },
            actions: [
                {
                    actionName: <value>,
                    days: <value>,
                    date: <value>,
                    deleteMarker: <value>
                },
                {
                    actionName: <value>,
                    days: <value>,
                    date: <value>,
                    deleteMarker: <value>,
                },
            ]
        }
    ]
  };
 */

export default class LifecycleConfiguration {
    _parsedXML: any;
    _ruleIDs: string[];
    _tagKeys: string[];
    _storageClasses: string[];
    _config: {
        error?: ArsenalError;
        rules?: any[];
    };

    /**
     * Create a Lifecycle Configuration instance
     * @param xml - the parsed xml
     * @param config - the CloudServer config
     * @return - LifecycleConfiguration instance
     */
    constructor(xml: any, config: { replicationEndpoints: { site: string }[] }) {
        this._parsedXML = xml;
        this._storageClasses =
            config.replicationEndpoints.map(endpoint => endpoint.site);
        this._ruleIDs = [];
        this._tagKeys = [];
        this._config = {};
    }

    /**
     * Get the lifecycle configuration
     * @return - the lifecycle configuration
     */
    getLifecycleConfiguration() {
        const rules = this._buildRulesArray();
        if (rules.error) {
            this._config.error = rules.error;
        }
        return this._config;
    }

    /**
     * Build the this._config.rules array
     * @return - contains error if any rule returned an error
     * or parsing failed
     */
    _buildRulesArray() {
        this._config.rules = [];
        if (!this._parsedXML || this._parsedXML === '') {
            const msg = 'request xml is undefined or empty';
            const error = errors.MalformedXML.customizeDescription(msg);
            return { error };
        }
        if (!this._parsedXML.LifecycleConfiguration &&
            this._parsedXML.LifecycleConfiguration !== '') {
            const msg = 'request xml does not include LifecycleConfiguration';
            const error = errors.MalformedXML.customizeDescription(msg);
            return { error };
        }
        const lifecycleConf = this._parsedXML.LifecycleConfiguration;
        const rulesArray: any[] = lifecycleConf.Rule;
        if (!rulesArray || !Array.isArray(rulesArray) || rulesArray.length === 0) {
            const msg = 'missing required key \'Rules\' in LifecycleConfiguration';
            const error = errors.MissingRequiredParameter.customizeDescription(msg);
            return { error };
        }
        if (rulesArray.length > 1000) {
            const msg = 'request xml includes over max limit of 1000 rules';
            const error = errors.MalformedXML.customizeDescription(msg);
            return { error };
        }
        const rules: any = {};
        for (let i = 0; i < rulesArray.length; i++) {
            const rule = this._parseRule(rulesArray[i]);
            if (rule.error) {
                rules.error = rule.error;
                break;
            } else {
                this._config.rules.push(rule);
            }
        }
        return rules;
    }

    /**
     * Check that the prefix is valid
     * @param prefix - The prefix to check
     * @return - The error or null
     */
    _checkPrefix(prefix: string) {
        if (prefix.length > 1024) {
            const msg = 'The maximum size of a prefix is 1024';
            return errors.InvalidRequest.customizeDescription(msg);
        }
        return null;
    }

    /**
     * Parses the prefix of the config
     * @param prefix - The prefix to parse
     * @return - Contains error if parsing returned an error, otherwise
     * it contains the parsed rule object
     */
    _parsePrefix(prefix: string) {
        const error = this._checkPrefix(prefix);
        if (error) {
            return { error };
        }
        return {
            propName: 'prefix',
            prefix,
        };
    }

    /**
     * Check that each xml rule is valid
     * @param rule - a rule object from Rule array from this._parsedXml
     * @return - contains error if any component returned an error
     * or parsing failed, else contains parsed rule object
     *
     * Format of ruleObj:
     * ruleObj = {
     *      ruleID: <value>,
     *      ruleStatus: <value>,
     *      filter: {
     *          rulePrefix: <value>,
     *          tags: [
     *              {
     *                  key: <value>,
     *                  val: <value>,
     *              }
     *          ]
     *      }
     *      actions: [
     *          {
     *              actionName: <value>,
     *              day: <value>,
     *              date: <value>,
     *              deleteMarker: <value>
     *          },
     *      ]
     * }
     */
    _parseRule(rule: XMLRule) {
        // Either Prefix or Filter must be included, but can be empty string
        if ((!rule.Filter && rule.Filter !== '') &&
        (!rule.Prefix && rule.Prefix !== '')) {
            const msg = 'Rule xml does not include valid Filter or Prefix';
            const error = errors.MalformedXML.customizeDescription(msg);
            return { error };
        }
        if (rule.Filter && rule.Prefix) {
            const msg = 'Rule xml should not include both Filter and Prefix';
            const error = errors.MalformedXML.customizeDescription(msg);
            return { error };
        }
        if (!rule.Status) {
            const msg = 'Rule xml does not include Status';
            const error = errors.MissingRequiredParameter.customizeDescription(msg);
            return { error };
        }
        const id = this._parseID(rule.ID!);
        const status = this._parseStatus(rule.Status[0]);
        const actions = this._parseAction(rule);
        const rulePropArray: any[] = [id, status, actions];
        if (rule.Prefix) {
            // Backward compatibility with deprecated top-level prefix.
            const prefix = this._parsePrefix(rule.Prefix[0]);
            rulePropArray.push(prefix);
        } else if (rule.Filter) {
            const filter = this._parseFilter(rule.Filter[0]);
            rulePropArray.push(filter);
        }
        const ruleObj: any = {};
        for (let i = 0; i < rulePropArray.length; i++) {
            const prop = rulePropArray[i];
            if (prop.error) {
                ruleObj.error = prop.error;
                break;
            } else {
                const propName = prop.propName;
                // eslint-disable-next-line no-param-reassign
                delete prop.propName;
                if (prop[propName] !== undefined) {
                    ruleObj[propName] = prop[propName];
                } else {
                    ruleObj[propName] = prop;
                }
            }
        }
        return ruleObj;
    }

    /**
     * Check that filter component of rule is valid
     * @param filter - filter object from a rule object
     * @return - contains error if parsing failed, else contains
     * parsed prefix and tag array
     *
     * Format of filterObj:
     * filterObj = {
     *      error: <error>,
     *      propName: 'filter',
     *      rulePrefix: <value>,
     *      tags: [
     *          {
     *              key: <value>,
     *              val: <value>
     *          },
     *          {
     *              key: <value>,
     *              value: <value>
     *          }
     *      ]
     * }
     */
    _parseFilter(filter: any) {
        // @ts-ignore
        const filterObj: {
            error?: ArsenalError;
            propName: 'filter';
            rulePrefix: string;
            tags: { key: string; val: string }[]
        } = {
            propName: 'filter',
        };
        if (Array.isArray(filter)) {
            // if Prefix was included, not Filter, filter will be Prefix array
            // if more than one Prefix is included, we ignore all but the last
            filterObj.rulePrefix = filter[filter.length - 1];
            const error = this._checkPrefix(filterObj.rulePrefix);
            if (error) {
                filterObj.error = error;
            }
            return filterObj;
        }
        if (filter.And && (filter.Prefix || filter.Tag) ||
        (filter.Prefix && filter.Tag)) {
            const msg = 'Filter should only include one of And, Prefix, or Tag key';
            const error = errors.MalformedXML.customizeDescription(msg);
            filterObj.error = error;
            return filterObj;
        }
        if (filter.Prefix) {
            filterObj.rulePrefix = filter.Prefix[filter.Prefix.length - 1];
            const error = this._checkPrefix(filterObj.rulePrefix);
            if (error) {
                filterObj.error = error;
            }
            return filterObj;
        }
        if (filter.Tag) {
            const tagObj = this._parseTags(filter.Tag);
            if (tagObj.error) {
                filterObj.error = tagObj.error;
                return filterObj;
            }
            filterObj.tags = tagObj.tags;
            return filterObj;
        }
        if (filter.And) {
            const andF = filter.And[0];
            if (!andF.Tag || (!andF.Prefix && andF.Tag.length < 2)) {
                filterObj.error = errors.MalformedXML.customizeDescription(
                    'And should include Prefix and Tags or more than one Tag');
                return filterObj;
            }
            if (andF.Prefix && andF.Prefix.length >= 1) {
                filterObj.rulePrefix = andF.Prefix[andF.Prefix.length - 1];
                const error = this._checkPrefix(filterObj.rulePrefix);
                if (error) {
                    filterObj.error = error;
                    return filterObj;
                }
            }
            const tagObj = this._parseTags(andF.Tag);
            if (tagObj.error) {
                filterObj.error = tagObj.error;
                return filterObj;
            }
            filterObj.tags = tagObj.tags;
            return filterObj;
        }
        return filterObj;
    }

    /**
     * Check that each tag object is valid
     * @param tags - a tag object from a filter object
     * @return - indicates whether tag object is valid
     *
     * Format of tagObj:
     * tagObj = {
     *      error: <error>,
     *      tags: [
     *          {
     *              key: <value>,
     *              value: <value>,
     *          }
     *      ]
     * }
     */
    _parseTags(tags: { Key?: string; Value?: any[] }[]) {
        // FIXME please
        const tagObj: {
            error?: ArsenalError;
            tags: { key: string; val: string }[];
        } = {
            tags: [],
        };
        // reset _tagKeys to empty because keys cannot overlap within a rule,
        // but different rules can have the same tag keys
        this._tagKeys = [];
        for (const tag of tags) {
            if (!tag.Key || !tag.Value) {
                const msg = 'Tag XML does not contain both Key and Value';
                const err = errors.MissingRequiredParameter.customizeDescription(msg);
                tagObj.error = err;
                break;
            }

            if (tag.Key[0].length < 1 || tag.Key[0].length > 128) {
                tagObj.error = errors.InvalidRequest.customizeDescription(
                    "A Tag's Key must be a length between 1 and 128"
                );
                break;
            }
            if (tag.Value[0].length < 0 || tag.Value[0].length > 256) {
                tagObj.error = errors.InvalidRequest.customizeDescription(
                    "A Tag's Value must be a length between 0 and 256"
                );
                break;
            }
            if (this._tagKeys.includes(tag.Key[0])) {
                tagObj.error = errors.InvalidRequest.customizeDescription(
                    'Tag Keys must be unique'
                );
                break;
            }
            this._tagKeys.push(tag.Key[0]);
            tagObj.tags.push({
                key: tag.Key[0],
                val: tag.Value[0],
            });
        }
        return tagObj;
    }

    /**
     * Check that ID component of rule is valid
     * @param id - contains id string at first index or empty
     * @return - contains error if parsing failed or id is not unique,
     * else contains parsed or generated id
     *
     * Format of idObj:
     * idObj = {
     *      error: <error>,
     *      propName: 'ruleID',
     *      ruleID: <value>
     * }
     */
    _parseID(id: string[]) {
        // @ts-ignore
        const idObj:
            | { error: ArsenalError; propName: 'ruleID', ruleID?: any }
            | { propName: 'ruleID', ruleID: any } = { propName: 'ruleID' };
        if (id && id[0].length > 255) {
            const msg = 'Rule ID is greater than 255 characters long';
            const error = errors.InvalidArgument.customizeDescription(msg);
            return { ...idObj, error };
        }
        if (!id || !id[0] || id[0] === '') {
            // ID is optional property, but create one if not provided or is ''
            // We generate 48-character alphanumeric, unique ID for rule
            idObj.ruleID = Buffer.from(UUID.v4()).toString('base64');
        } else {
            idObj.ruleID = id[0];
        }
        // Each ID in a list of rules must be unique.
        if (this._ruleIDs.includes(idObj.ruleID)) {
            const msg = 'Rule ID must be unique';
            const error = errors.InvalidRequest.customizeDescription(msg);
            return { ...idObj, error };
        }
        this._ruleIDs.push(idObj.ruleID);
        return idObj;
    }

    /**
     * Check that status component of rule is valid
     * @param status - status string
     * @return - contains error if parsing failed, else contains
     * parsed status
     *
     * Format of statusObj:
     * statusObj = {
     *      error: <error>,
     *      propName: 'ruleStatus',
     *      ruleStatus: <value>
     * }
     */
    _parseStatus(status: string) {
        const base: { propName: 'ruleStatus' } = { propName: 'ruleStatus' }
        const validStatuses = ['Enabled', 'Disabled'];
        if (!validStatuses.includes(status)) {
            const msg = 'Status is not valid';
            const error = errors.MalformedXML.customizeDescription(msg);
            return { ...base, error };
        }
        return { ...base, ruleStatus: status }
    }

    /**
     * Finds the prefix and/or tags of the given rule and gets the error message
     * @param rule - The rule to find the prefix in
     * @return - The prefix of filter information
     */
    _getRuleFilterDesc(rule: { Prefix?: string[]; Filter?: any[] }) {
        if (rule.Prefix) {
            return `prefix '${rule.Prefix[0]}'`;
        }
        // There must be a filter if no top-level prefix is provided. First
        // check if there are multiple filters (i.e. `Filter.And`).
        if (rule.Filter?.[0] === undefined || rule.Filter[0].And === undefined) {
            const { Prefix, Tag } = rule.Filter?.[0] || {};
            if (Prefix) {
                return `filter '(prefix=${Prefix[0]})'`;
            }
            if (Tag) {
                const { Key, Value } = Tag[0];
                return `filter '(tag: key=${Key[0]}, value=${Value[0]})'`;
            }
            return 'filter (all)';
        }
        const filters: string[] = [];
        const { Prefix, Tag } = rule.Filter[0].And[0];
        if (Prefix) {
            filters.push(`prefix=${Prefix[0]}`);
        }
        Tag.forEach((tag: { Key: string[]; Value: string[] }) => {
            const { Key, Value } = tag;
            filters.push(`tag: key=${Key[0]}, value=${Value[0]}`);
        });
        const joinedFilters = filters.join(' and ');
        return `filter '(${joinedFilters})'`;
    }

    /**
     * Checks the validity of the given field
     * @param params - Given function parameters
     * @param params.days - The value of the field to check
     * @param params.field - The field name with the value
     * @param params.ancestor - The immediate ancestor field
     * @return Returns an error object or `null`
     */
    _checkDays(params: { days: number; field: string; ancestor: string }) {
        const { days, field, ancestor } = params;
        if (days < 0) {
            const msg = `'${field}' in ${ancestor} action must be nonnegative`;
            return errors.InvalidArgument.customizeDescription(msg);
        }
        if (days > MAX_DAYS) {
            return errors.MalformedXML.customizeDescription(
                `'${field}' in ${ancestor} action must not exceed ${MAX_DAYS}`);
        }
        return null;
    }

    /**
     * Checks the validity of the given storage class
     * @param params - Given function parameters
     * @param params.usedStorageClasses - Storage classes used in other
     * rules
     * @param params.storageClass - The storage class of the current
     * rule
     * @param params.ancestor - The immediate ancestor field
     * @param params.prefix - The prefix of the rule
     * @return Returns an error object or `null`
     */
    _checkStorageClasses(params: {
        usedStorageClasses: string[];
        storageClass: string;
        ancestor: string;
        rule: { Prefix?: string[]; Filter?: any };
    }) {
        const { usedStorageClasses, storageClass, ancestor, rule } = params;
        if (!this._storageClasses.includes(storageClass)) {
            // This differs from the AWS message. This will help the user since
            // the StorageClass does not conform to AWS specs.
            const list = `'${this._storageClasses.join("', '")}'`;
            const msg = `'StorageClass' must be one of ${list}`;
            return errors.MalformedXML.customizeDescription(msg);
        }
        if (usedStorageClasses.includes(storageClass)) {
            const msg = `'StorageClass' must be different for '${ancestor}' ` +
                `actions in same 'Rule' with ${this._getRuleFilterDesc(rule)}`;
            return errors.InvalidRequest.customizeDescription(msg);
        }
        return null;
    }

    /**
     * Ensure that transition rules are at least a day apart from each other.
     * @param params - Given function parameters
     * @param [params.days] - The days of the current transition
     * @param [params.date] - The date of the current transition
     * @param params.storageClass - The storage class of the current
     * rule
     * @param params.rule - The current rule
     */
    _checkTimeGap(params: {
        days?: number;
        date?: string;
        storageClass: string;
        rule: { Transition: any[]; Prefix?: string[]; Filter?: any };
    }) {
        const { days, date, storageClass, rule } = params;
        const invalidTransition = rule.Transition.find(transition => {
            if (storageClass === transition.StorageClass[0]) {
                return false;
            }
            if (days !== undefined) {
                return Number.parseInt(transition.Days[0], 10) === days;
            }
            if (date !== undefined) {
                const timestamp = new Date(date).getTime();
                const compareTimestamp = new Date(transition.Date[0]).getTime();
                const oneDay = 24 * 60 * 60 * 1000; // Milliseconds in a day.
                return Math.abs(timestamp - compareTimestamp) < oneDay;
            }
            return false;
        });
        if (invalidTransition) {
            const timeType = days !== undefined ? 'Days' : 'Date';
            const filterMsg = this._getRuleFilterDesc(rule);
            const compareStorageClass = invalidTransition.StorageClass[0];
            const msg = `'${timeType}' in the 'Transition' action for ` +
                `StorageClass '${storageClass}' for ${filterMsg} must be at ` +
                `least one day apart from ${filterMsg} in the 'Transition' ` +
                `action for StorageClass '${compareStorageClass}'`;
            return errors.InvalidArgument.customizeDescription(msg);
        }
        return null;
    }

    /**
     * Checks transition time type (i.e. 'Date' or 'Days') only occurs once
     * across transitions and across transitions and expiration policies
     * @param params - Given function parameters
     * @param params.usedTimeType - The time type that has been used by
     * another rule
     * @param params.currentTimeType - the time type used by the
     * current rule
     * @param params.rule - The current rule
     * @return Returns an error object or `null`
     */
    _checkTimeType(params: {
        usedTimeType: string | null;
        currentTimeType: string;
        rule: { Prefix?: string[]; Filter?: any; Expiration?: any[] };
    }) {
        const { usedTimeType, currentTimeType, rule } = params;
        if (usedTimeType && usedTimeType !== currentTimeType) {
            const msg = "Found mixed 'Date' and 'Days' based Transition " +
                'actions in lifecycle rule for ' +
                `${this._getRuleFilterDesc(rule)}`;
            return errors.InvalidRequest.customizeDescription(msg);
        }
        // Transition time type cannot differ from the expiration, if provided.
        if (rule.Expiration &&
            rule.Expiration[0][currentTimeType] === undefined) {
            const msg = "Found mixed 'Date' and 'Days' based Expiration and " +
                'Transition actions in lifecycle rule for ' +
                `${this._getRuleFilterDesc(rule)}`;
            return errors.InvalidRequest.customizeDescription(msg);
        }
        return null;
    }

    /**
     * Checks the validity of the given date
     * @param date - The date the check
     * @return Returns an error object or `null`
     */
    _checkDate(date: string) {
        const isoRegex = new RegExp('^(-?(?:[1-9][0-9]*)?[0-9]{4})-' +
            '(1[0-2]|0[1-9])-(3[01]|0[1-9]|[12][0-9])T(2[0-3]|[01][0-9])' +
            ':([0-5][0-9]):([0-5][0-9])(.[0-9]+)?(Z)?$');
        if (!isoRegex.test(date)) {
            const msg = 'Date must be in ISO 8601 format';
            return errors.InvalidArgument.customizeDescription(msg);
        }
        return null;
    }

    /**
     * Parses the NonCurrentVersionTransition value
     * @param rule - Rule object from Rule array from this._parsedXml
     * @return - Contains error if parsing failed, otherwise contains
     * the parsed nonCurrentVersionTransition array
     *
     * Format of result:
     * result = {
     *      error: <error>,
     *      nonCurrentVersionTransition: [
     *          {
     *              noncurrentDays: <non-current-days>,
     *              storageClass: <storage-class>,
     *          },
     *          ...
     *      ]
     * }
     */
    _parseNoncurrentVersionTransition(rule: {
        NoncurrentVersionTransition: any[];
        Prefix?: string[];
        Filter?: any;
    }) {
        const nonCurrentVersionTransition: {
            noncurrentDays: number;
            storageClass: string;
        }[] = [];
        const usedStorageClasses: string[] = [];
        for (let i = 0; i < rule.NoncurrentVersionTransition.length; i++) {
            const t = rule.NoncurrentVersionTransition[i]; // Transition object
            const noncurrentDays: number | undefined =
                t.NoncurrentDays && Number.parseInt(t.NoncurrentDays[0], 10);
            const storageClass: string | undefined = t.StorageClass && t.StorageClass[0];
            if (noncurrentDays === undefined || storageClass === undefined) {
                return { error: errors.MalformedXML };
            }
            let error = this._checkDays({
                days: noncurrentDays,
                field: 'NoncurrentDays',
                ancestor: 'NoncurrentVersionTransition',
            });
            if (error) {
                return { error };
            }
            error = this._checkStorageClasses({
                storageClass,
                usedStorageClasses,
                ancestor: 'NoncurrentVersionTransition',
                rule,
            });
            if (error) {
                return { error };
            }
            nonCurrentVersionTransition.push({ noncurrentDays, storageClass });
            usedStorageClasses.push(storageClass);
        }
        return { nonCurrentVersionTransition };
    }

    /**
     * Parses the Transition value
     * @param rule - Rule object from Rule array from this._parsedXml
     * @return - Contains error if parsing failed, otherwise contains
     * the parsed transition array
     *
     * Format of result:
     * result = {
     *      error: <error>,
     *      transition: [
     *          {
     *              days: <days>,
     *              date: <date>,
     *              storageClass: <storage-class>,
     *          },
     *          ...
     *      ]
     * }
     */
    _parseTransition(rule: {
        Transition: any[];
        Prefix?: string[];
        Filter?: any;
    }) {
        const transition:
            ({ days: number; storageClass: string }
            | { date: string; storageClass: string })[] = [];
        const usedStorageClasses: string[] = [];
        let usedTimeType: string | null = null;
        for (let i = 0; i < rule.Transition.length; i++) {
            const t = rule.Transition[i]; // Transition object
            const days = t.Days && Number.parseInt(t.Days[0], 10);
            const date = t.Date && t.Date[0];
            const storageClass = t.StorageClass && t.StorageClass[0];
            if ((days === undefined && date === undefined) ||
                (days !== undefined && date !== undefined) ||
                (storageClass === undefined)) {
                return { error: errors.MalformedXML };
            }
            let error = this._checkStorageClasses({
                storageClass,
                usedStorageClasses,
                ancestor: 'Transition',
                rule,
            });
            if (error) {
                return { error };
            }
            usedStorageClasses.push(storageClass);
            if (days !== undefined) {
                error = this._checkTimeType({
                    usedTimeType,
                    currentTimeType: 'Days',
                    rule,
                });
                if (error) {
                    return { error };
                }
                usedTimeType = 'Days';
                error = this._checkDays({
                    days,
                    field: 'Days',
                    ancestor: 'Transition',
                });
                if (error) {
                    return { error };
                }
                transition.push({ days, storageClass });
            }
            if (date !== undefined) {
                error = this._checkTimeType({
                    usedTimeType,
                    currentTimeType: 'Date',
                    rule,
                });
                if (error) {
                    return { error };
                }
                usedTimeType = 'Date';
                error = this._checkDate(date);
                if (error) {
                    return { error };
                }
                transition.push({ date, storageClass });
            }
            error = this._checkTimeGap({ days, date, storageClass, rule });
            if (error) {
                return { error };
            }
        }
        return { transition };
    }

    /**
     * Check that action component of rule is valid
     * @param rule - a rule object from Rule array from this._parsedXml
     * @return - contains error if parsing failed, else contains
     * parsed action information
     *
     * Format of actionObj:
     * actionsObj = {
     *      error: <error>,
     *      propName: 'action',
     *      actions: [
     *          {
     *              actionName: <value>,
     *              days: <value>,
     *              date: <value>,
     *              deleteMarker: <value>
     *          },
     *      ],
     * }
     */
    _parseAction(rule: any) {
        const actionsObj: {
            error?: ArsenalError;
            propName: 'actions';
            actions: {
                actionName: string;
                days?: number;
                date?: number;
                deleteMarker?: boolean
            }[];
        } = {
            propName: 'actions',
            actions: [],
        };
        const validActions = [
            'AbortIncompleteMultipartUpload',
            'Expiration',
            'NoncurrentVersionExpiration',
            'NoncurrentVersionTransition',
            'Transition',
        ];
        validActions.forEach(a => {
            if (rule[a]) {
                actionsObj.actions.push({ actionName: `${a}` });
            }
        });
        if (actionsObj.actions.length === 0) {
            const msg = 'Rule does not include valid action';
            const error = errors.InvalidRequest.customizeDescription(msg);
            return { ...actionsObj, error };
        }
        actionsObj.actions.forEach(a => {
            const actionFn = `_parse${a.actionName}`;
            const action = this[actionFn](rule);
            if (action.error) {
                actionsObj.error = action.error;
            } else {
                const actionTimes = ['days', 'date', 'deleteMarker',
                    'transition', 'nonCurrentVersionTransition'];
                actionTimes.forEach(t => {
                    if (action[t]) {
                        // eslint-disable-next-line no-param-reassign
                        a[t] = action[t];
                    }
                });
            }
        });
        return actionsObj;
    }

    /**
     * Check that AbortIncompleteMultipartUpload action is valid
     * @param rule - a rule object from Rule array from this._parsedXml
     * @return - contains error if parsing failed, else contains
     * parsed action time
     *
     * Format of abortObj:
     * abortObj = {
     *      error: <error>,
     *      days: <value>
     * }
     */
    _parseAbortIncompleteMultipartUpload(rule: any) {
        const abortObj: { error?: ArsenalError, days?: number } = {};
        let filter: any = null;
        if (rule.Filter && rule.Filter[0]) {
            if (rule.Filter[0].And) {
                filter = rule.Filter[0].And[0];
            } else {
                filter = rule.Filter[0];
            }
        }
        if (filter && filter.Tag) {
            abortObj.error = errors.InvalidRequest.customizeDescription(
                'Tag-based filter cannot be used with ' +
                'AbortIncompleteMultipartUpload action',
            );
            return abortObj;
        }
        const subAbort = rule.AbortIncompleteMultipartUpload[0];
        if (!subAbort.DaysAfterInitiation) {
            abortObj.error = errors.MalformedXML.customizeDescription(
                'AbortIncompleteMultipartUpload action does not ' +
                'include DaysAfterInitiation');
            return abortObj;
        }
        const daysInt = parseInt(subAbort.DaysAfterInitiation[0], 10);
        if (daysInt < 1) {
            abortObj.error = errors.InvalidArgument.customizeDescription(
                'DaysAfterInitiation is not a positive integer');
            return abortObj;
        }
        abortObj.days = daysInt;
        return abortObj;
    }

    /**
     * Check that Expiration action is valid
     * @param rule - a rule object from Rule array from this._parsedXml
     * @return - contains error if parsing failed, else contains
     * parsed action time
     *
     * Format of expObj:
     * expObj = {
     *      error: <error>,
     *      days: <value>,
     *      date: <value>,
     *      deleteMarker: <value>
     * }
     */
    _parseExpiration(rule: any) {
        const expObj: {
            error?: ArsenalError;
            days?: number;
            date?: number;
            deleteMarker?: boolean;
        } = {};
        const subExp = rule.Expiration[0];
        if (!subExp.Date && !subExp.Days && !subExp.ExpiredObjectDeleteMarker) {
            const msg = 'Expiration action does not include an action time';
            const error = errors.MalformedXML.customizeDescription(msg);
            return { error };
        }
        const eodm = 'ExpiredObjectDeleteMarker';
        if (subExp.Date &&
            (subExp.Days || subExp[eodm]) ||
            (subExp.Days && subExp[eodm])) {
            const msg = 'Expiration action includes more than one time';
            const error = errors.MalformedXML.customizeDescription(msg);
            return { error };
        }
        if (subExp.Date) {
            const error = this._checkDate(subExp.Date[0]);
            if (error) {
                expObj.error = error;
            } else {
                expObj.date = subExp.Date[0];
            }
        }
        if (subExp.Days) {
            const daysInt = parseInt(subExp.Days[0], 10);
            if (daysInt < 1) {
                expObj.error = errors.InvalidArgument.customizeDescription(
                    'Expiration days is not a positive integer');
            } else {
                expObj.days = daysInt;
            }
        }
        if (subExp.ExpiredObjectDeleteMarker) {
            let filter: any = null;
            if (rule.Filter && rule.Filter[0]) {
                if (rule.Filter[0].And) {
                    filter = rule.Filter[0].And[0];
                } else {
                    filter = rule.Filter[0];
                }
            }
            if (filter && filter.Tag) {
                expObj.error = errors.InvalidRequest.customizeDescription(
                    'Tag-based filter cannot be used with ' +
                    'ExpiredObjectDeleteMarker action');
                return expObj;
            }
            const validValues = ['true', 'false'];
            if (!validValues.includes(subExp.ExpiredObjectDeleteMarker[0])) {
                expObj.error = errors.MalformedXML.customizeDescription(
                    'ExpiredObjDeleteMarker is not true or false');
            } else {
                expObj.deleteMarker = subExp.ExpiredObjectDeleteMarker[0];
            }
        }
        return expObj;
    }

    /**
     * Check that NoncurrentVersionExpiration action is valid
     * @param rule - a rule object from Rule array from this._parsedXml
     * @return - contains error if parsing failed, else contains
     * parsed action time
     *
     * Format of nvExpObj:
     * nvExpObj = {
     *      error: <error>,
     *      days: <value>,
     * }
     */
    _parseNoncurrentVersionExpiration(rule: any) {
        const subNVExp = rule.NoncurrentVersionExpiration[0];
        if (!subNVExp.NoncurrentDays) {
            const error = errors.MalformedXML.customizeDescription(
                'NoncurrentVersionExpiration action does not include ' +
                'NoncurrentDays');
            return { error };
        }
        const daysInt = parseInt(subNVExp.NoncurrentDays[0], 10);
        if (daysInt < 1) {
            const msg = 'NoncurrentDays is not a positive integer';
            const error = errors.InvalidArgument.customizeDescription(msg);
            return { error };
        } else {
            return { days: daysInt };
        }
    }

    /**
     * Validate the bucket metadata lifecycle configuration structure and
     * value types
     * @param config - The lifecycle configuration to validate
     */
    static validateConfig(config: any) {
        assert.strictEqual(typeof config, 'object');
        const rules = config.rules;
        assert.strictEqual(Array.isArray(rules), true);
        rules.forEach((rule: any) => {
            const { ruleID, ruleStatus, prefix, filter, actions } = rule;
            assert.strictEqual(typeof ruleID, 'string');
            assert.strictEqual(typeof ruleStatus, 'string');
            if (prefix !== undefined) {
                assert.strictEqual(typeof prefix, 'string');
            } else {
                assert.strictEqual(typeof filter, 'object');
                assert.strictEqual(Array.isArray(actions), true);
                if (filter.rulePrefix) {
                    assert.strictEqual(typeof filter.rulePrefix, 'string');
                }
                if (filter.tags) {
                    assert.strictEqual(Array.isArray(filter.tags), true);
                    filter.tags.forEach((t: any) => {
                        assert.strictEqual(typeof t.key, 'string');
                        assert.strictEqual(typeof t.val, 'string');
                    });
                }
            }
            actions.forEach((a: any) => {
                assert.strictEqual(typeof a.actionName, 'string');
                if (a.days) {
                    assert.strictEqual(typeof a.days, 'number');
                }
                if (a.date) {
                    assert.strictEqual(typeof a.date, 'string');
                }
                if (a.deleteMarker) {
                    assert.strictEqual(typeof a.deleteMarker, 'string');
                }
                if (a.nonCurrentVersionTransition) {
                    assert.strictEqual(
                        typeof a.nonCurrentVersionTransition, 'object');
                    a.nonCurrentVersionTransition.forEach(t => {
                        assert.strictEqual(typeof t.noncurrentDays, 'number');
                        assert.strictEqual(typeof t.storageClass, 'string');
                    });
                }
                if (a.transition) {
                    assert.strictEqual(typeof a.transition, 'object');
                    a.transition.forEach(t => {
                        if (t.days || t.days === 0) {
                            assert.strictEqual(typeof t.days, 'number');
                        }
                        if (t.date !== undefined) {
                            assert.strictEqual(typeof t.date, 'string');
                        }
                        assert.strictEqual(typeof t.storageClass, 'string');
                    });
                }
            });
        });
    }

    /**
     * Get XML representation of lifecycle configuration object
     * @param config - Lifecycle configuration object
     * @return - XML representation of config
     */
    static getConfigXml(config: { rules: Rule[] }) {
        const rules = config.rules;
        const rulesXML = rules.map((rule) => {
            const { ruleID, ruleStatus, filter, actions, prefix } = rule;
            const ID = `<ID>${escapeForXml(ruleID)}</ID>`;
            const Status = `<Status>${ruleStatus}</Status>`;
            let rulePrefix: string | undefined;
            if (prefix !== undefined) {
                rulePrefix = prefix;
            } else {
                rulePrefix = filter?.rulePrefix;
            }
            const tags = filter && filter.tags;
            const Prefix = rulePrefix !== undefined ?
                `<Prefix>${rulePrefix}</Prefix>` : '';
            let tagXML = '';
            if (tags) {
                tagXML = tags.map(t => {
                    const { key, val } = t;
                    const Tag = `<Tag><Key>${key}</Key>` +
                        `<Value>${val}</Value></Tag>`;
                    return Tag;
                }).join('');
            }
            let Filter: string;
            if (prefix !== undefined) {
                // Prefix is in the top-level of the config, so we can skip the
                // filter property.
                Filter = Prefix;
            } else if (filter?.rulePrefix !== undefined && !tags) {
                Filter = `<Filter>${Prefix}</Filter>`;
            } else if (tags &&
                (filter.rulePrefix !== undefined || tags.length > 1)) {
                Filter = `<Filter><And>${Prefix}${tagXML}</And></Filter>`;
            } else {
                // remaining condition is if only one or no tag
                Filter = `<Filter>${tagXML}</Filter>`;
            }

            const Actions = actions.map(action => {
                const { actionName, days, date, deleteMarker,
                    nonCurrentVersionTransition, transition } = action;
                let Action: any;
                if (actionName === 'AbortIncompleteMultipartUpload') {
                    Action = `<${actionName}><DaysAfterInitiation>${days}` +
                        `</DaysAfterInitiation></${actionName}>`;
                } else if (actionName === 'NoncurrentVersionExpiration') {
                    Action = `<${actionName}><NoncurrentDays>${days}` +
                        `</NoncurrentDays></${actionName}>`;
                } else if (actionName === 'Expiration') {
                    const Days = days ? `<Days>${days}</Days>` : '';
                    const Date = date ? `<Date>${date}</Date>` : '';
                    const DelMarker = deleteMarker ?
                        `<ExpiredObjectDeleteMarker>${deleteMarker}` +
                        '</ExpiredObjectDeleteMarker>' : '';
                    Action = `<${actionName}>${Days}${Date}${DelMarker}` +
                        `</${actionName}>`;
                }
                if (actionName === 'NoncurrentVersionTransition') {
                    const xml: string[] = [];
                    nonCurrentVersionTransition!.forEach(transition => {
                        const { noncurrentDays, storageClass } = transition;
                        xml.push(
                            `<${actionName}>`,
                            `<NoncurrentDays>${noncurrentDays}` +
                                '</NoncurrentDays>',
                            `<StorageClass>${storageClass}</StorageClass>`,
                            `</${actionName}>`,
                        );
                    });
                    Action = xml.join('');
                }
                if (actionName === 'Transition') {
                    const xml: string[] = [];
                    transition!.forEach(transition => {
                        const { days, date, storageClass } = transition;
                        let element: string = '';
                        if (days !== undefined) {
                            element = `<Days>${days}</Days>`;
                        }
                        if (date !== undefined) {
                            element = `<Date>${date}</Date>`;
                        }
                        xml.push(
                            `<${actionName}>`,
                            element,
                            `<StorageClass>${storageClass}</StorageClass>`,
                            `</${actionName}>`,
                        );
                    });
                    Action = xml.join('');
                }
                return Action;
            }).join('');
            return `<Rule>${ID}${Status}${Filter}${Actions}</Rule>`;
        }).join('');
        return '<?xml version="1.0" encoding="UTF-8"?>' +
        '<LifecycleConfiguration ' +
            'xmlns="http://s3.amazonaws.com/doc/2006-03-01/">' +
            `${rulesXML}` +
        '</LifecycleConfiguration>';
    }

    /**
     * Get JSON representation of lifecycle configuration object
     * @param config - Lifecycle configuration object
     * @return - XML representation of config
     */
    static getConfigJson(config: { rules: Rule[] }) {
        const rules = config.rules;
        const rulesJSON = rules.map(rule => {
            const { ruleID, ruleStatus, filter, actions, prefix } = rule;
            const entry = new LifecycleRule(ruleID, ruleStatus);
            if (prefix !== undefined) {
                entry.addPrefix(prefix);
            } else if (filter && filter.rulePrefix !== undefined) {
                entry.addPrefix(filter.rulePrefix);
            }

            const tags = filter && filter.tags;
            if (tags) {
                tags.forEach(tag => entry.addTag(tag.key, tag.val));
            }

            actions.forEach(action => {
                const { actionName, days, date, deleteMarker } = action;
                if (actionName === 'AbortIncompleteMultipartUpload') {
                    entry.addAbortMPU(days!);
                    return;
                }
                if (actionName === 'NoncurrentVersionExpiration') {
                    entry.addNCVExpiration(days!);
                    return;
                }
                if (actionName === 'Expiration') {
                    if (days !== undefined) {
                        entry.addExpiration('Days', days);
                        return;
                    }

                    if (date !== undefined) {
                        entry.addExpiration('Date', date);
                        return;
                    }

                    if (deleteMarker !== undefined) {
                        entry.addExpiration('ExpiredObjectDeleteMarker', deleteMarker);
                        return;
                    }
                }
            });

            return entry.build();
        });

        return { Rules: rulesJSON };
    }
}

export type Rule = {
    ruleID: string;
    prefix?: string;
    ruleStatus: Status;
    actions: {
        actionName: string;
        days?: number;
        date?: number;
        deleteMarker?: boolean;
        nonCurrentVersionTransition?: {
            noncurrentDays: number;
            storageClass: string;
        }[];
        transition?: {
            days?: number;
            date?: string;
            storageClass: string;
        }[];
    }[];
    filter?: {
        rulePrefix?: string;
        tags: { key: string; val: string }[];
    };
};
