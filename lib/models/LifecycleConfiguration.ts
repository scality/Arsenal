import assert from 'assert';
import UUID from 'uuid';

import errors from '../errors';
import LifecycleRule from './LifecycleRule';
import escapeForXml from '../s3middleware/escapeForXml';

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
    /**
     * Create a Lifecycle Configuration instance
     * @param {string} xml - the parsed xml
     * @param {object} config - the CloudServer config
     * @return {object} - LifecycleConfiguration instance
     */
    constructor(xml, config) {
        this._parsedXML = xml;
        this._storageClasses =
            config.replicationEndpoints.map(endpoint => endpoint.site);
        this._ruleIDs = [];
        this._tagKeys = [];
        this._config = {};
    }

    /**
     * Get the lifecycle configuration
     * @return {object} - the lifecycle configuration
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
     * @return {object} - contains error if any rule returned an error
     * or parsing failed
     */
    _buildRulesArray() {
        const rules = {};
        this._config.rules = [];
        if (!this._parsedXML || this._parsedXML === '') {
            rules.error = errors.MalformedXML.customizeDescription(
                'request xml is undefined or empty');
            return rules;
        }
        if (!this._parsedXML.LifecycleConfiguration &&
            this._parsedXML.LifecycleConfiguration !== '') {
            rules.error = errors.MalformedXML.customizeDescription(
                'request xml does not include LifecycleConfiguration');
            return rules;
        }
        const lifecycleConf = this._parsedXML.LifecycleConfiguration;
        const rulesArray = lifecycleConf.Rule;
        if (!rulesArray || !Array.isArray(rulesArray)
        || rulesArray.length === 0) {
            rules.error = errors.MissingRequiredParameter.customizeDescription(
                'missing required key \'Rules\' in LifecycleConfiguration');
            return rules;
        }
        if (rulesArray.length > 1000) {
            rules.error = errors.MalformedXML.customizeDescription(
                'request xml includes over max limit of 1000 rules');
            return rules;
        }
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
     * @param {string} prefix - The prefix to check
     * @return {object|null} - The error or null
     */
    _checkPrefix(prefix) {
        if (prefix.length > 1024) {
            const msg = 'The maximum size of a prefix is 1024';
            return errors.InvalidRequest.customizeDescription(msg);
        }
        return null;
    }

    /**
     * Parses the prefix of the config
     * @param {string} prefix - The prefix to parse
     * @return {object} - Contains error if parsing returned an error, otherwise
     * it contains the parsed rule object
     */
    _parsePrefix(prefix) {
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
     * @param {object} rule - a rule object from Rule array from this._parsedXml
     * @return {object} - contains error if any component returned an error
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
    _parseRule(rule) {
        const ruleObj = {};
        if (rule.NoncurrentVersionTransition) {
            ruleObj.error = errors.NotImplemented.customizeDescription(
                'NoncurrentVersionTransition lifecycle action not yet ' +
                'implemented');
            return ruleObj;
        }
        // Either Prefix or Filter must be included, but can be empty string
        if ((!rule.Filter && rule.Filter !== '') &&
        (!rule.Prefix && rule.Prefix !== '')) {
            ruleObj.error = errors.MalformedXML.customizeDescription(
                'Rule xml does not include valid Filter or Prefix');
            return ruleObj;
        }
        if (rule.Filter && rule.Prefix) {
            ruleObj.error = errors.MalformedXML.customizeDescription(
                'Rule xml should not include both Filter and Prefix');
            return ruleObj;
        }
        if (!rule.Status) {
            ruleObj.error = errors.MissingRequiredParameter.
                customizeDescription('Rule xml does not include Status');
            return ruleObj;
        }
        const id = this._parseID(rule.ID);
        const status = this._parseStatus(rule.Status[0]);
        const actions = this._parseAction(rule);
        const rulePropArray = [id, status, actions];
        if (rule.Prefix) {
            // Backward compatibility with deprecated top-level prefix.
            const prefix = this._parsePrefix(rule.Prefix[0]);
            rulePropArray.push(prefix);
        } else if (rule.Filter) {
            const filter = this._parseFilter(rule.Filter[0]);
            rulePropArray.push(filter);
        }
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
     * @param {object} filter - filter object from a rule object
     * @return {object} - contains error if parsing failed, else contains
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
    _parseFilter(filter) {
        const filterObj = {};
        filterObj.propName = 'filter';
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
            filterObj.error = errors.MalformedXML.customizeDescription(
                'Filter should only include one of And, Prefix, or Tag key');
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
     * @param {object} tags - a tag object from a filter object
     * @return {boolean} - indicates whether tag object is valid
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
    _parseTags(tags) {
        const tagObj = {};
        tagObj.tags = [];
        // reset _tagKeys to empty because keys cannot overlap within a rule,
        // but different rules can have the same tag keys
        this._tagKeys = [];
        for (let i = 0; i < tags.length; i++) {
            if (!tags[i].Key || !tags[i].Value) {
                tagObj.error =
                    errors.MissingRequiredParameter.customizeDescription(
                        'Tag XML does not contain both Key and Value');
                break;
            }

            if (tags[i].Key[0].length < 1 || tags[i].Key[0].length > 128) {
                tagObj.error = errors.InvalidRequest.customizeDescription(
                    'A Tag\'s Key must be a length between 1 and 128');
                break;
            }
            if (tags[i].Value[0].length < 0 || tags[i].Value[0].length > 256) {
                tagObj.error = errors.InvalidRequest.customizeDescription(
                    'A Tag\'s Value must be a length between 0 and 256');
                break;
            }
            if (this._tagKeys.includes(tags[i].Key[0])) {
                tagObj.error = errors.InvalidRequest.customizeDescription(
                    'Tag Keys must be unique');
                break;
            }
            this._tagKeys.push(tags[i].Key[0]);
            const tag = {
                key: tags[i].Key[0],
                val: tags[i].Value[0],
            };
            tagObj.tags.push(tag);
        }
        return tagObj;
    }

    /**
     * Check that ID component of rule is valid
     * @param {array} id - contains id string at first index or empty
     * @return {object} - contains error if parsing failed or id is not unique,
     * else contains parsed or generated id
     *
     * Format of idObj:
     * idObj = {
     *      error: <error>,
     *      propName: 'ruleID',
     *      ruleID: <value>
     * }
     */
    _parseID(id) {
        const idObj = {};
        idObj.propName = 'ruleID';
        if (id && id[0].length > 255) {
            idObj.error = errors.InvalidArgument.customizeDescription(
                'Rule ID is greater than 255 characters long');
            return idObj;
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
            idObj.error = errors.InvalidRequest.customizeDescription(
                'Rule ID must be unique');
            return idObj;
        }
        this._ruleIDs.push(idObj.ruleID);
        return idObj;
    }

    /**
     * Check that status component of rule is valid
     * @param {string} status - status string
     * @return {object} - contains error if parsing failed, else contains
     * parsed status
     *
     * Format of statusObj:
     * statusObj = {
     *      error: <error>,
     *      propName: 'ruleStatus',
     *      ruleStatus: <value>
     * }
     */
    _parseStatus(status) {
        const statusObj = {};
        statusObj.propName = 'ruleStatus';
        const validStatuses = ['Enabled', 'Disabled'];
        if (!validStatuses.includes(status)) {
            statusObj.error = errors.MalformedXML.customizeDescription(
                'Status is not valid');
            return statusObj;
        }
        statusObj.ruleStatus = status;
        return statusObj;
    }

    /**
     * Finds the prefix and/or tags of the given rule and gets the error message
     * @param {object} rule - The rule to find the prefix in
     * @return {string} - The prefix of filter information
     */
    _getRuleFilterDesc(rule) {
        if (rule.Prefix) {
            return `prefix '${rule.Prefix[0]}'`;
        }
        // There must be a filter if no top-level prefix is provided. First
        // check if there are multiple filters (i.e. `Filter.And`).
        if (rule.Filter[0] === undefined || rule.Filter[0].And === undefined) {
            const { Prefix, Tag } = rule.Filter[0] || {};
            if (Prefix) {
                return `filter '(prefix=${Prefix[0]})'`;
            }
            if (Tag) {
                const { Key, Value } = Tag[0];
                return `filter '(tag: key=${Key[0]}, value=${Value[0]})'`;
            }
            return 'filter (all)';
        }
        const filters = [];
        const { Prefix, Tag } = rule.Filter[0].And[0];
        if (Prefix) {
            filters.push(`prefix=${Prefix[0]}`);
        }
        Tag.forEach(tag => {
            const { Key, Value } = tag;
            filters.push(`tag: key=${Key[0]}, value=${Value[0]}`);
        });
        const joinedFilters = filters.join(' and ');
        return `filter '(${joinedFilters})'`;
    }

    /**
     * Checks the validity of the given field
     * @param {object} params - Given function parameters
     * @param {string} params.days - The value of the field to check
     * @param {string} params.field - The field name with the value
     * @param {string} params.ancestor - The immediate ancestor field
     * @return {object|null} Returns an error object or `null`
     */
    _checkDays(params) {
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
     * @param {object} params - Given function parameters
     * @param {array} params.usedStorageClasses - Storage classes used in other
     * rules
     * @param {string} params.storageClass - The storage class of the current
     * rule
     * @param {string} params.ancestor - The immediate ancestor field
     * @param {string} params.prefix - The prefix of the rule
     * @return {object|null} Returns an error object or `null`
     */
    _checkStorageClasses(params) {
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
     * @param {object} params - Given function parameters
     * @param {string} [params.days] - The days of the current transition
     * @param {string} [params.date] - The date of the current transition
     * @param {string} params.storageClass - The storage class of the current
     * rule
     * @param {string} params.rule - The current rule
     * @return {undefined}
     */
    _checkTimeGap(params) {
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
        return undefined;
    }

    /**
     * Checks transition time type (i.e. 'Date' or 'Days') only occurs once
     * across transitions and across transitions and expiration policies
     * @param {object} params - Given function parameters
     * @param {string} params.usedTimeType - The time type that has been used by
     * another rule
     * @param {string} params.currentTimeType - the time type used by the
     * current rule
     * @param {string} params.rule - The current rule
     * @return {object|null} Returns an error object or `null`
     */
    _checkTimeType(params) {
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
     * @param {string} date - The date the check
     * @return {object|null} Returns an error object or `null`
     */
    _checkDate(date) {
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
     * @param {object} rule - Rule object from Rule array from this._parsedXml
     * @return {object} - Contains error if parsing failed, otherwise contains
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
    _parseNoncurrentVersionTransition(rule) {
        const nonCurrentVersionTransition = [];
        const usedStorageClasses = [];
        for (let i = 0; i < rule.NoncurrentVersionTransition.length; i++) {
            const t = rule.NoncurrentVersionTransition[i]; // Transition object
            const noncurrentDays =
                t.NoncurrentDays && Number.parseInt(t.NoncurrentDays[0], 10);
            const storageClass = t.StorageClass && t.StorageClass[0];
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
     * @param {object} rule - Rule object from Rule array from this._parsedXml
     * @return {object} - Contains error if parsing failed, otherwise contains
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
    _parseTransition(rule) {
        const transition = [];
        const usedStorageClasses = [];
        let usedTimeType = null;
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
     * @param {object} rule - a rule object from Rule array from this._parsedXml
     * @return {object} - contains error if parsing failed, else contains
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
    _parseAction(rule) {
        const actionsObj = {};
        actionsObj.propName = 'actions';
        actionsObj.actions = [];
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
            actionsObj.error = errors.InvalidRequest.customizeDescription(
                'Rule does not include valid action');
            return actionsObj;
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
     * @param {object} rule - a rule object from Rule array from this._parsedXml
     * @return {object} - contains error if parsing failed, else contains
     * parsed action time
     *
     * Format of abortObj:
     * abortObj = {
     *      error: <error>,
     *      days: <value>
     * }
     */
    _parseAbortIncompleteMultipartUpload(rule) {
        const abortObj = {};
        let filter = null;
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
                'AbortIncompleteMultipartUpload action');
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
     * @param {object} rule - a rule object from Rule array from this._parsedXml
     * @return {object} - contains error if parsing failed, else contains
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
    _parseExpiration(rule) {
        const expObj = {};
        const subExp = rule.Expiration[0];
        if (!subExp.Date && !subExp.Days && !subExp.ExpiredObjectDeleteMarker) {
            expObj.error = errors.MalformedXML.customizeDescription(
                'Expiration action does not include an action time');
            return expObj;
        }
        const eodm = 'ExpiredObjectDeleteMarker';
        if (subExp.Date && (subExp.Days || subExp[eodm]) ||
        (subExp.Days && subExp[eodm])) {
            expObj.error = errors.MalformedXML.customizeDescription(
                'Expiration action includes more than one time');
            return expObj;
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
            let filter = null;
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
     * @param {object} rule - a rule object from Rule array from this._parsedXml
     * @return {object} - contains error if parsing failed, else contains
     * parsed action time
     *
     * Format of nvExpObj:
     * nvExpObj = {
     *      error: <error>,
     *      days: <value>,
     * }
     */
    _parseNoncurrentVersionExpiration(rule) {
        const nvExpObj = {};
        const subNVExp = rule.NoncurrentVersionExpiration[0];
        if (!subNVExp.NoncurrentDays) {
            nvExpObj.error = errors.MalformedXML.customizeDescription(
                'NoncurrentVersionExpiration action does not include ' +
                'NoncurrentDays');
            return nvExpObj;
        }
        const daysInt = parseInt(subNVExp.NoncurrentDays[0], 10);
        if (daysInt < 1) {
            nvExpObj.error = errors.InvalidArgument.customizeDescription(
                'NoncurrentDays is not a positive integer');
        } else {
            nvExpObj.days = daysInt;
        }
        return nvExpObj;
    }

    /**
     * Validate the bucket metadata lifecycle configuration structure and
     * value types
     * @param {object} config - The lifecycle configuration to validate
     * @return {undefined}
     */
    static validateConfig(config) {
        assert.strictEqual(typeof config, 'object');
        const rules = config.rules;
        assert.strictEqual(Array.isArray(rules), true);
        rules.forEach(rule => {
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
                    filter.tags.forEach(t => {
                        assert.strictEqual(typeof t.key, 'string');
                        assert.strictEqual(typeof t.val, 'string');
                    });
                }
            }
            actions.forEach(a => {
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
     * @param {object} config - Lifecycle configuration object
     * @return {string} - XML representation of config
     */
    static getConfigXml(config) {
        const rules = config.rules;
        const rulesXML = rules.map(rule => {
            const { ruleID, ruleStatus, filter, actions, prefix } = rule;
            const ID = `<ID>${escapeForXml(ruleID)}</ID>`;
            const Status = `<Status>${ruleStatus}</Status>`;
            let rulePrefix;
            if (prefix !== undefined) {
                rulePrefix = prefix;
            } else {
                rulePrefix = filter.rulePrefix;
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
            let Filter;
            if (prefix !== undefined) {
                // Prefix is in the top-level of the config, so we can skip the
                // filter property.
                Filter = Prefix;
            } else if (filter.rulePrefix !== undefined && !tags) {
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
                let Action;
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
                    const xml = [];
                    nonCurrentVersionTransition.forEach(transition => {
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
                    const xml = [];
                    transition.forEach(transition => {
                        const { days, date, storageClass } = transition;
                        let element;
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
     * @param {object} config - Lifecycle configuration object
     * @return {string} - XML representation of config
     */
    static getConfigJson(config) {
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
                    entry.addAbortMPU(days);
                    return;
                }
                if (actionName === 'NoncurrentVersionExpiration') {
                    entry.addNCVExpiration(days);
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
