const assert = require('assert');

const errors = require('../errors');

/**
 * Format of xml request:
 *
 * <ObjectLockConfiguration>
 *      <ObjectLockEnabled>Enabled</ObjectLockEnabled>
 *      <Rule>
 *          <DefaultRetention>
 *              <Mode>GOVERNANCE|COMPLIANCE</Mode>
 *              <Days>1</Days>
 *              <Years>1</Years>
 *          </DefaultRetention>
 *      </Rule>
 * </ObjectLockConfiguration>
 */

 /**
  * Format of config:
  *
  * config = {
  *     rule: {
  *         mode: GOVERNANCE|COMPLIANCE,
  *         days|years: integer,
  *     }
  * }
  */
class ObjectLockConfiguration {
    /**
     * Create an Object Lock Configuration instance
     * @param {string} xml - the parsed configuration xml
     * @return {object} - ObjectLockConfiguration instance
     */
    constructor(xml) {
        this._parsedXml = xml;
        this._config = {};
    }

    /**
     * Get the object lock configuration
     * @return {object} - contains error if parsing failed
     */
    getValidatedObjectLockConfiguration() {
        const validConfig = this._parseObjectLockConfig();
        if (validConfig.error) {
            this._config.error = validConfig.error;
        }
        return this._config;
    }

    /**
     * Check that mode is valid
     * @param {array} mode - array containing mode value
     * @return {object} - contains error if parsing failed
     */
    _parseMode(mode) {
        const validMode = {};
        const expectedModes = ['GOVERNANCE', 'COMPLIANCE'];
        if (!mode || !mode[0] || mode[0] === '') {
            validMode.error = errors.MalformedXML.customizeDescription(
                'request xml does not contain Mode');
            return validMode;
        }
        if (mode.length > 1) {
            validMode.error = errors.MalformedXML.customizeDescription(
                'request xml contains more than one Mode');
            return validMode;
        }
        if (!expectedModes.includes(mode[0])) {
            validMode.error = errors.MalformedXML.customizeDescription(
                'Mode request xml must be one of "GOVERNANCE", "COMPLIANCE"');
            return validMode;
        }
        validMode.mode = mode[0];
        return validMode;
    }

    /**
     * Check that time limit is valid
     * @param {object} dr - DefaultRetention object containing days or years
     * @return {object} - contains error if parsing failed
     */
    _parseTime(dr) {
        const validTime = {};
        if (dr.Days && dr.Years) {
            validTime.error = errors.MalformedXML.customizeDescription(
                'request xml contains both Days and Years');
            return validTime;
        }
        const timeType = dr.Days ? 'Days' : 'Years';
        if (!dr[timeType] || !dr[timeType][0]) {
            validTime.error = errors.MalformedXML.customizeDescription(
                'request xml does not contain Days or Years');
            return validTime;
        }
        if (dr[timeType].length > 1) {
            validTime.error = errors.MalformedXML.customizeDescription(
                'request xml contains more than one retention period');
            return validTime;
        }
        const timeValue = Number.parseInt(dr[timeType][0], 10);
        if (Number.isNaN(timeValue)) {
            validTime.error = errors.MalformedXML.customizeDescription(
                'request xml does not contain valid retention period');
            return validTime;
        }
        if (timeValue < 1) {
            validTime.error = errors.InvalidArgument.customizeDescription(
                'retention period must be a positive integer');
            return validTime;
        }
        if ((timeType === 'Days' && timeValue > 36500) ||
        (timeType === 'Years' && timeValue > 100)) {
            validTime.error = errors.InvalidArgument.customizeDescription(
                'retention period is too large');
            return validTime;
        }
        validTime.timeType = timeType.toLowerCase();
        validTime.timeValue = timeValue;
        return validTime;
    }

    /**
     * Check that object lock configuration is valid
     * @return {object} - contains error if parsing failed
     */
    _parseObjectLockConfig() {
        const validConfig = {};
        if (!this._parsedXml || this._parsedXml === '') {
            validConfig.error = errors.MalformedXML.customizeDescription(
                'request xml is undefined or empty');
            return validConfig;
        }
        const objectLockConfig = this._parsedXml.ObjectLockConfiguration;
        if (!objectLockConfig || objectLockConfig === '') {
            validConfig.error = errors.MalformedXML.customizeDescription(
                'request xml does not include ObjectLockConfiguration');
            return validConfig;
        }
        const objectLockEnabled = objectLockConfig.ObjectLockEnabled;
        if (!objectLockEnabled || objectLockEnabled[0] !== 'Enabled') {
            validConfig.error = errors.MalformedXML.customizeDescription(
                'request xml does not include valid ObjectLockEnabled');
            return validConfig;
        }
        const ruleArray = objectLockConfig.Rule;
        if (ruleArray.length > 1) {
            validConfig.error = errors.MalformedXML.customizeDescription(
                'request xml contains more than one rule');
            return validConfig;
        }

        const drArray = ruleArray[0].DefaultRetention;
        if (!drArray || !drArray[0] || drArray[0] === '') {
            validConfig.error = errors.MalformedXML.customizeDescription(
                'Rule request xml does not contain DefaultRetention');
            return validConfig;
        }
        if (!drArray[0].Mode || (!drArray[0].Days && !drArray[0].Years)) {
            validConfig.error = errors.MalformedXML.customizeDescription(
                'DefaultRetention request xml does not contain Mode or ' +
                'retention period (Days or Years)');
            return validConfig;
        }
        const validMode = this._parseMode(drArray[0].Mode);
        if (validMode.error) {
            validConfig.error = validMode.error;
            return validConfig;
        }
        const validTime = this._parseTime(drArray[0]);
        if (validTime.error) {
            validConfig.error = validTime.error;
            return validConfig;
        }

        this._config.rule = {};
        this._config.rule.mode = validMode.mode;
        this._config.rule[validTime.timeType] = validTime.timeValue;
        return validConfig;
    }

    /**
     * Validate the bucket metadata object lock configuration structure and
     * value types
     * @param {object} config - The object lock configuration to validate
     * @return {undefined}
     */
    static validateConfig(config) {
        assert.strictEqual(typeof config, 'object');
        const rule = config.rule;
        assert.strictEqual(typeof rule, 'object');
        assert.strictEqual(typeof rule.mode, 'string');
        if (rule.days) {
            assert.strictEqual(typeof rule.days, 'number');
        } else {
            assert.strictEqual(typeof rule.years, 'number');
        }
    }

}

module.exports = ObjectLockConfiguration;
