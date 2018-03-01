const assert = require('assert');
const UUID = require('uuid');

const errors = require('../errors');

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

class LifecycleConfiguration {
    /**
     * Create a Lifecycle Configuration instance
     * @param {string} xml - the parsed xml
     * @return {object} - LifecycleConfiguration instance
     */
    constructor(xml) {
        this._parsedXML = xml;
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
        if (rule.Transition || rule.NoncurrentVersionTransition) {
            ruleObj.error = errors.NotImplemented.customizeDescription(
                'Transition lifecycle action not yet implemented');
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
        const subFilter = rule.Filter ? rule.Filter[0] : rule.Prefix;

        const id = this._parseID(rule.ID);
        const status = this._parseStatus(rule.Status[0]);
        const filter = this._parseFilter(subFilter);
        const actions = this._parseAction(rule);

        const rulePropArray = [id, status, filter, actions];
        for (let i = 0; i < rulePropArray.length; i++) {
            const prop = rulePropArray[i];
            if (prop.error) {
                ruleObj.error = prop.error;
                break;
            } else {
                const propName = prop.propName;
                // eslint-disable-next-line no-param-reassign
                delete prop.propName;
                ruleObj[propName] = prop[propName] || prop;
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
        // if no Rule Prefix or Filter, rulePrefix is empty string
        filterObj.rulePrefix = '';
        if (Array.isArray(filter)) {
            // if Prefix was included, not Filter, filter will be Prefix array
            // if more than one Prefix is included, we ignore all but the last
            filterObj.rulePrefix = filter.pop();
            return filterObj;
        }
        if (filter.And && (filter.Prefix || filter.Tag) ||
        (filter.Prefix && filter.Tag)) {
            filterObj.error = errors.MalformedXML.customizeDescription(
                'Filter should only include one of And, Prefix, or Tag key');
            return filterObj;
        }
        if (filter.Prefix) {
            filterObj.rulePrefix = filter.Prefix.pop();
            return filterObj;
        }
        if (filter.Tag) {
            const tagObj = this._parseTags(filter.Tag[0]);
            if (tagObj.error) {
                filterObj.error = tagObj.error;
                return filterObj;
            }
            filterObj.tags = tagObj.tags;
            return filterObj;
        }
        if (filter.And) {
            const andF = filter.And[0];
            if (!andF.Tags || (!andF.Prefix && andF.Tags.length < 2)) {
                filterObj.error = errors.MalformedXML.customizeDescription(
                    'And should include Prefix and Tags or more than one Tag');
                return filterObj;
            }
            if (andF.Prefix && andF.Prefix.length >= 1) {
                filterObj.rulePrefix = andF.Prefix.pop();
            }
            const tagObj = this._parseTags(andF.Tags[0]);
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
        if (!tags.Key || !tags.Value) {
            tagObj.error = errors.MissingRequiredParameter.customizeDescription(
                'Tag XML does not contain both Key and Value');
            return tagObj;
        }
        if (tags.Key.length !== tags.Value.length) {
            tagObj.error = errors.MalformedXML.customizeDescription(
                'Tag XML should contain same number of Keys and Values');
            return tagObj;
        }
        for (let i = 0; i < tags.Key.length; i++) {
            if (tags.Key[i].length < 1 || tags.Key[i].length > 128) {
                tagObj.error = errors.InvalidRequest.customizeDescription(
                    'Tag Key must be a length between 1 and 128 char');
                break;
            }
            if (this._tagKeys.includes(tags.Key[i])) {
                tagObj.error = errors.InvalidRequest.customizeDescription(
                    'Tag Keys must be unique');
                break;
            }
            this._tagKeys.push(tags.Key[i]);
            const tag = {
                key: tags.Key[i],
                val: tags.Value[i],
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
        const validActions = ['AbortIncompleteMultipartUpload',
            'Expiration', 'NoncurrentVersionExpiration'];
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
                const actionTimes = ['days', 'date', 'deleteMarker'];
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
            const isoRegex = new RegExp('^(-?(?:[1-9][0-9]*)?[0-9]{4})-' +
                '(1[0-2]|0[1-9])-(3[01]|0[1-9]|[12][0-9])T(2[0-3]|[01][0-9])' +
                ':([0-5][0-9]):([0-5][0-9])(.[0-9]+)?(Z)?$');
            if (!isoRegex.test(subExp.Date[0])) {
                expObj.error = errors.InvalidArgument.customizeDescription(
                    'Date must be in ISO 8601 format');
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
            const { ruleID, ruleStatus, filter, actions } = rule;
            assert.strictEqual(typeof ruleID, 'string');
            assert.strictEqual(typeof ruleStatus, 'string');
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
            const { ruleID, ruleStatus, filter, actions } = rule;
            const ID = `<ID>${ruleID}</ID>`;
            const Status = `<Status>${ruleStatus}</Status>`;

            const { rulePrefix, tags } = filter;
            const Prefix = rulePrefix ? `<Prefix>${rulePrefix}</Prefix>` : '';
            let tagXML = '';
            if (tags) {
                if (Prefix || tags.length > 1) {
                    const keysVals = tags.map(t => {
                        const { key, val } = t;
                        const Tag = `<Key>${key}</Key>` +
                            `<Value>${val}</Value>`;
                        return Tag;
                    }).join('');
                    tagXML = `<Tags>${keysVals}</Tags>`;
                } else {
                    // only one tag included
                    const { key, val } = tags[0];
                    tagXML = `<Tag><Key>${key}</Key>` +
                        `<Value>${val}</Value></Tag>`;
                }
            }
            let Filter;
            if (rulePrefix && !tags) {
                Filter = Prefix;
            } else if (tags && (rulePrefix || tags.length > 1)) {
                Filter = `<Filter><And>${Prefix}${tagXML}</And></Filter>`;
            } else {
                // remaining condition is if only one or no tag
                Filter = `<Filter>${tagXML}</Filter>`;
            }

            const Actions = actions.map(action => {
                const { actionName, days, date, deleteMarker } = action;
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
}

module.exports = LifecycleConfiguration;
