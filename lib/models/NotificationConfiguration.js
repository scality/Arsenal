const UUID = require('uuid');

const { bucketNotifSupportedEvents } = require('../constants');
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
        this._ids = [];
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
     * @return {error | undefined} - error if parsing failed, else undefined
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
        if (!queueConfig || !queueConfig[0] || queueConfig[0] === '') {
            return errors.MalformedXML.customizeDescription(
                'request xml does not include QueueConfiguration');
        }
        this._config.queueConfig = [];
        let parseError;
        queueConfig.forEach(c => {
            const eventObj = this._parseEvents(c.Event);
            const filterObj = this._parseFilter(c.Filter);
            const idObj = this._parseId(c.Id);
            const arnObj = this._parseArn(c.QueueArn);

            if (eventObj.error) {
                parseError = eventObj.error;
            } else if (filterObj.error) {
                parseError = filterObj.error;
            } else if (idObj.error) {
                parseError = idObj.error;
            } else if (arnObj.error) {
                parseError = arnObj.error;
            } else {
                this._config.queueConfig.push({
                    events: eventObj.events,
                    queueArn: arnObj.arn,
                    id: idObj.id,
                    filterRules: filterObj.filterRules,
                });
            }
        });
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
            if (!bucketNotifSupportedEvents.includes(e)) {
                eventsObj.error = errors.MalformedXML.customizeDescription(
                    'event array contains invalid or unsupported event');
            }
            eventsObj.events.push(e);
        });
        return eventsObj;
    }

    /**
     * Check that filter array is valid
     * @param {array} filter - filter array
     * @return {object} - contains error if parsing failed or filter array
     */
    _parseFilter(filter) {
        const filterObj = {
            filterRules: [],
        };
        if (filter && filter[0]) {
            if (!filter[0].S3Key || !filter[0].S3Key[0]) {
                filterObj.error = errors.MalformedXML.customizeDescription(
                    'if included, queue configuration filter must contain S3Key');
                return filterObj;
            }
            const filterRules = filter[0].S3Key[0];
            if (!filterRules.FilterRule || !filterRules.FilterRule[0]) {
                filterObj.error = errors.MalformedXML.customizeDescription(
                    'if included, queue configuration filter must contain a rule');
                return filterObj;
            }
            const ruleArray = filterRules.FilterRule;
            ruleArray.forEach(r => {
                if (!r.Name || !r.Name[0] || !r.Value || !r.Value[0]) {
                    filterObj.error = errors.MalformedXML.customizeDescription(
                        'each included filter must contain a name and value');
                } else if (!['Prefix', 'Suffix'].includes(r.Name[0])) {
                    filterObj.error = errors.MalformedXML.customizeDescription(
                        'filter Name must be one of Prefix or Suffix');
                } else {
                    filterObj.filterRules.push({
                        name: r.Name[0],
                        value: r.Value[0],
                    });
                }
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
        const idObj = {};
        idObj.propName = 'ruleID';
        if (id && id[0].length > 255) {
            idObj.error = errors.InvalidArgument.customizeDescription(
                'queue configuration ID is greater than 255 characters long');
            return idObj;
        }
        if (!id || !id[0] || id[0] === '') {
            // id is optional property, so create one if not provided or is ''
            // We generate 48-character alphanumeric, unique id for rule
            idObj.id = Buffer.from(UUID.v4()).toString('base64');
        } else {
            idObj.id = id[0];
        }
        // Each ID in a list of rules must be unique.
        if (this._ids.includes(idObj.id)) {
            idObj.error = errors.InvalidRequest.customizeDescription(
                'queue configuration ID must be unique');
            return idObj;
        }
        this._ids.push(idObj.id);
        return idObj;
    }

    /**
     * Check that arn string is valid
     * @param {string} arn - queue arn
     * @return {object} - contains error if parsing failed or queue arn
     */
    _parseArn(arn) {
        const arnObj = {};
        if (!arn || !arn[0]) {
            arnObj.error = errors.MalformedXML.customizeDescription(
                'each queue configuration must contain a queue arn');
            return arnObj;
        }
        const splitArn = arn[0].split(':');
        if (splitArn.length !== 6 ||
            !(splitArn[0] === 'arn') ||
            !(splitArn[1] === 'scality') ||
            !(splitArn[2] === 'bucketnotif')) {
            arnObj.error = errors.MalformedXML.customizeDescription(
                'queue arn is invalid');
        }
        // remaining 3 parts of arn are evaluated in cloudserver
        arnObj.arn = arn[0];
        return arnObj;
    }
}

module.exports = NotificationConfiguration;
