const assert = require('assert');
const UUID = require('uuid');

const {
    supportedNotificationEvents,
    notificationArnPrefix,
} = require('../constants');
const errors = require('../errors');

/**
 * Format of xml request:
 *
 * <ONotificationConfiguration>
 *      <QueueConfiguration>
 *          <Event>array</Event>
 *          <Filter>
 *              <S3Key>
 *                  <FilterRule>
 *                      <Name>string</Name>
 *                      <Value>string</Value>
 *                  </FilterRule>
 *              </S3Key>
 *          </Filter>
 *          <Id>string</Id>
 *          <Queue>string</Queue>
 *      </QueueConfiguration>
 * </NotificationConfiguration>
 */

 /**
  * Format of config:
  *
  * config = {
  *     queueConfig: [
  *         {
  *         events: array,
  *         queueArn: string,
  *         filterRules: [
  *             {
  *                 name: string,
  *                 value: string
  *             },
  *             {
  *                 name: string,
  *                 value:string
  *             },
  *         ],
  *         id: string
  *         }
  *     ]
  * }
  */

class NotificationConfiguration {
    /**
     * Create a Notification Configuration instance
     * @param {string} xml - parsed configuration xml
     * @return {object} - NotificationConfiguration instance
     */
    constructor(xml) {
        this._parsedXml = xml;
        this._config = {};
        this._ids = new Set([]);
    }

    /**
     * Get notification configuration
     * @return {object} - contains error if parsing failed
     */
    getValidatedNotificationConfiguration() {
        const validationError = this._parseNotificationConfig();
        if (validationError) {
            this._config.error = validationError;
        }
        return this._config;
    }

    /**
     * Check that notification configuration is valid
     * @return {error | null} - error if parsing failed, else undefined
     */
    _parseNotificationConfig() {
        if (!this._parsedXml || this._parsedXml === '') {
            return errors.MalformedXML.customizeDescription(
                'request xml is undefined or empty');
        }
        const notificationConfig = this._parsedXml.NotificationConfiguration;
        if (!notificationConfig || notificationConfig === '') {
            return errors.MalformedXML.customizeDescription(
                'request xml does not include NotificationConfiguration');
        }
        const queueConfig = notificationConfig.QueueConfiguration;
        if (!queueConfig || !queueConfig[0]) {
            // if undefined or empty QueueConfiguration, notif configuration is deleted
            return null;
        }
        this._config.queueConfig = [];
        let parseError;
        for (let i = 0; i < queueConfig.length; i++) {
            const eventObj = this._parseEvents(queueConfig[i].Event);
            const filterObj = this._parseFilter(queueConfig[i].Filter);
            const idObj = this._parseId(queueConfig[i].Id);
            const arnObj = this._parseArn(queueConfig[i].Queue);

            if (eventObj.error) {
                parseError = eventObj.error;
                this._config = {};
                break;
            }
            if (filterObj.error) {
                parseError = filterObj.error;
                this._config = {};
                break;
            }
            if (idObj.error) {
                parseError = idObj.error;
                this._config = {};
                break;
            }
            if (arnObj.error) {
                parseError = arnObj.error;
                this._config = {};
                break;
            }
            this._config.queueConfig.push({
                events: eventObj.events,
                queueArn: arnObj.arn,
                id: idObj.id,
                filterRules: filterObj.filterRules,
            });
        }
        return parseError;
    }

    /**
     * Check that events array is valid
     * @param {array} events - event array
     * @return {object} - contains error if parsing failed or events array
     */
    _parseEvents(events) {
        const eventsObj = {
            events: [],
        };
        if (!events || !events[0]) {
            eventsObj.error = errors.MalformedXML.customizeDescription(
                'each queue configuration must contain an event');
            return eventsObj;
        }
        events.forEach(e => {
            if (!supportedNotificationEvents.has(e)) {
                eventsObj.error = errors.MalformedXML.customizeDescription(
                    'event array contains invalid or unsupported event');
            } else {
                eventsObj.events.push(e);
            }
        });
        return eventsObj;
    }

    /**
     * Check that filter array is valid
     * @param {array} filter - filter array
     * @return {object} - contains error if parsing failed or filter array
     */
    _parseFilter(filter) {
        if (!filter || !filter[0]) {
            return {};
        }
        if (!filter[0].S3Key || !filter[0].S3Key[0]) {
            return { error: errors.MalformedXML.customizeDescription(
                'if included, queue configuration filter must contain S3Key') };
        }
        const filterRules = filter[0].S3Key[0];
        if (!filterRules.FilterRule || !filterRules.FilterRule[0]) {
            return { error: errors.MalformedXML.customizeDescription(
                'if included, queue configuration filter must contain a rule') };
        }
        const filterObj = {
            filterRules: [],
        };
        const ruleArray = filterRules.FilterRule;
        for (let i = 0; i < ruleArray.length; i++) {
            if (!ruleArray[i].Name
                || !ruleArray[i].Name[0]
                || !ruleArray[i].Value
                || !ruleArray[i].Value[0]) {
                return { error: errors.MalformedXML.customizeDescription(
                    'each included filter must contain a name and value') };
            }
            if (!['Prefix', 'Suffix'].includes(ruleArray[i].Name[0])) {
                return { error: errors.MalformedXML.customizeDescription(
                    'filter Name must be one of Prefix or Suffix') };
            }
            filterObj.filterRules.push({
                name: ruleArray[i].Name[0],
                value: ruleArray[i].Value[0],
            });
        }
        return filterObj;
    }

    /**
     * Check that id string is valid
     * @param {string} id - id string (optional)
     * @return {object} - contains error if parsing failed or id
     */
    _parseId(id) {
        if (id && id[0].length > 255) {
            return { error: errors.InvalidArgument.customizeDescription(
                'queue configuration ID is greater than 255 characters long') };
        }
        let validId;
        if (!id || !id[0]) {
            // id is optional property, so create one if not provided or is ''
            // We generate 48-character alphanumeric, unique id for rule
            validId = Buffer.from(UUID.v4()).toString('base64');
        } else {
            validId = id[0];
        }
        // Each ID in a list of rules must be unique.
        if (this._ids.has(validId)) {
            return { error: errors.InvalidRequest.customizeDescription(
                'queue configuration ID must be unique') };
        }
        this._ids.add(validId);
        return { id: validId };
    }

    /**
     * Check that arn string is valid
     * @param {string} arn - queue arn
     * @return {object} - contains error if parsing failed or queue arn
     */
    _parseArn(arn) {
        if (!arn || !arn[0]) {
            return { error: errors.MalformedXML.customizeDescription(
                'each queue configuration must contain a queue arn'),
            };
        }
        const splitArn = arn[0].split(':');
        const slicedArn = arn[0].slice(0, 23);
        if (splitArn.length !== 6 || slicedArn !== notificationArnPrefix) {
            return { error: errors.MalformedXML.customizeDescription(
                'queue arn is invalid') };
        }
        // remaining 3 parts of arn are evaluated in cloudserver
        return { arn: arn[0] };
    }

    /**
     * Get XML representation of notification configuration object
     * @param {object} config - notification configuration object
     * @return {string} - XML representation of config
     */
    static getConfigXML(config) {
        const xmlArray = [];
        if (config && config.queueConfig) {
            config.queueConfig.forEach(c => {
                xmlArray.push('<QueueConfiguration>');
                xmlArray.push(`<Id>${c.id}</Id>`);
                xmlArray.push(`<Queue>${c.queueArn}</Queue>`);
                c.events.forEach(e => {
                    xmlArray.push(`<Event>${e}</Event>`);
                });
                if (c.filterRules) {
                    xmlArray.push('<Filter><S3Key>');
                    c.filterRules.forEach(r => {
                        xmlArray.push(`<FilterRule><Name>${r.name}</Name>` +
                            `<Value>${r.value}</Value></FilterRule>`);
                    });
                    xmlArray.push('</S3Key></Filter>');
                }
                xmlArray.push('</QueueConfiguration>');
            });
        }
        const queueConfigXML = xmlArray.join('');
        return '<?xml version="1.0" encoding="UTF-8"?>' +
            '<NotificationConfiguration ' +
            'xmlns="http://s3.amazonaws.com/doc/2006-03-01/">' +
            `${queueConfigXML}` +
            '</NotificationConfiguration>';
    }

    /**
     * Validate the bucket metadata notification configuration structure and
     * value types
     * @param {object} config - The notificationconfiguration to validate
     * @return {undefined}
     */
    static validateConfig(config) {
        assert.strictEqual(typeof config, 'object');
        if (!config.queueConfig) {
            return;
        }
        config.queueConfig.forEach(q => {
            const { events, queueArn, filterRules, id } = q;
            events.forEach(e => assert.strictEqual(typeof e, 'string'));
            assert.strictEqual(typeof queueArn, 'string');
            if (filterRules) {
                filterRules.forEach(f => {
                    assert.strictEqual(typeof f.name, 'string');
                    assert.strictEqual(typeof f.value, 'string');
                });
            }
            assert.strictEqual(typeof id, 'string');
        });
        return;
    }
}

module.exports = NotificationConfiguration;
