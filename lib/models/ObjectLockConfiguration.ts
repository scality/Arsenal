import assert from 'assert';
import errors, { ArsenalError } from '../errors';

export type Config = any;
export type LockMode = 'GOVERNANCE' | 'COMPLIANCE';
export type DefaultRetention = { Days: number } | { Years: number };
export type ParsedRetention =
    | { error: ArsenalError }
    | { timeType: 'days' | 'years'; timeValue: number };

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
export default class ObjectLockConfiguration {
    _parsedXml: any;
    _config: Config;
    _days: number | null;

    /**
     * Create an Object Lock Configuration instance
     * @param xml - the parsed configuration xml
     * @return - ObjectLockConfiguration instance
     */
    constructor(xml: any) {
        this._parsedXml = xml;
        this._config = {};
        this._days = null;
    }

    /**
     * Get the object lock configuration
     * @return - contains error if parsing failed
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
     * @param mode - array containing mode value
     * @return - contains error if parsing failed
     */
    _parseMode(mode: LockMode[]): { error: ArsenalError } | { mode: LockMode } {
        const expectedModes = ['GOVERNANCE', 'COMPLIANCE'];
        if (!mode || !mode[0]) {
            const msg = 'request xml does not contain Mode';
            const error = errors.MalformedXML.customizeDescription(msg);
            return { error };
        }
        if (mode.length > 1) {
            const msg = 'request xml contains more than one Mode';
            const error = errors.MalformedXML.customizeDescription(msg);
            return { error };
        }
        if (!expectedModes.includes(mode[0])) {
            const msg = 'Mode request xml must be one of "GOVERNANCE", "COMPLIANCE"';
            const error = errors.MalformedXML.customizeDescription(msg);
            return { error };
        }
        return { mode: mode[0] };
    }

    /**
     * Check that time limit is valid
     * @param dr - DefaultRetention object containing days or years
     * @return - contains error if parsing failed
     */
    _parseTime(dr: DefaultRetention): ParsedRetention {
        if ('Days' in dr && 'Years' in dr) {
            const msg = 'request xml contains both Days and Years';
            const error = errors.MalformedXML.customizeDescription(msg);
            return { error };
        }
        const timeType = 'Days' in dr ? 'Days' : 'Years';
        if (!dr[timeType] || !dr[timeType][0]) {
            const msg = 'request xml does not contain Days or Years';
            const error = errors.MalformedXML.customizeDescription(msg);
            return { error };
        }
        if (dr[timeType].length > 1) {
            const msg = 'request xml contains more than one retention period';
            const error = errors.MalformedXML.customizeDescription(msg);
            return { error };
        }
        const timeValue = Number.parseInt(dr[timeType][0], 10);
        if (Number.isNaN(timeValue)) {
            const msg = 'request xml does not contain valid retention period';
            const error = errors.MalformedXML.customizeDescription(msg);
            return { error };
        }
        if (timeValue < 1) {
            const msg = 'retention period must be a positive integer';
            const error = errors.InvalidArgument.customizeDescription(msg);
            return { error };
        }
        if ((timeType === 'Days' && timeValue > 36500) ||
        (timeType === 'Years' && timeValue > 100)) {
            const msg = 'retention period is too large';
            const error = errors.InvalidArgument.customizeDescription(msg);
            return { error };
        }
        return {
            timeType: timeType.toLowerCase() as 'days' | 'years',
            timeValue: timeValue,
        };
    }

    /**
     * Check that object lock configuration is valid
     * @return - contains error if parsing failed
     */
    _parseObjectLockConfig() {
        const validConfig: { error?: ArsenalError } = {};
        if (!this._parsedXml || this._parsedXml === '') {
            const msg = 'request xml is undefined or empty';
            const error = errors.MalformedXML.customizeDescription(msg);
            return { error };
        }
        const objectLockConfig = this._parsedXml.ObjectLockConfiguration;
        if (!objectLockConfig || objectLockConfig === '') {
            const msg = 'request xml does not include ObjectLockConfiguration';
            const error = errors.MalformedXML.customizeDescription(msg);
            return { error };
        }
        const objectLockEnabled = objectLockConfig.ObjectLockEnabled;
        if (!objectLockEnabled || objectLockEnabled[0] !== 'Enabled') {
            const msg = 'request xml does not include valid ObjectLockEnabled';
            const error = errors.MalformedXML.customizeDescription(msg);
            return { error };
        }
        const ruleArray = objectLockConfig.Rule;
        if (ruleArray) {
            if (ruleArray.length > 1) {
                const msg = 'request xml contains more than one rule';
                const error = errors.MalformedXML.customizeDescription(msg);
                return { error };
            }
            const drArray = ruleArray[0].DefaultRetention;
            if (!drArray || !drArray[0] || drArray[0] === '') {
                const msg = 'Rule request xml does not contain DefaultRetention';
                const error = errors.MalformedXML.customizeDescription(msg);
                return { error };
            }
            if (!drArray[0].Mode || (!drArray[0].Days && !drArray[0].Years)) {
                const msg =
                    'DefaultRetention request xml does not contain Mode or ' +
                    'retention period (Days or Years)';
                const error = errors.MalformedXML.customizeDescription(msg);
                return { error };
            }
            const validMode = this._parseMode(drArray[0].Mode);
            if ('error' in validMode) {
                return validMode;
            }
            const validTime = this._parseTime(drArray[0]);
            if ('error' in validTime) {
                return validTime;
            }
            this._config.rule = {};
            this._config.rule.mode = validMode.mode;
            this._config.rule[validTime.timeType!] = validTime.timeValue;
            // Store the number of days
            this._days = validTime.timeType === 'years' ? 365 * validTime.timeValue : validTime.timeValue;
        }
        return validConfig;
    }

    /**
     * Validate the bucket metadata object lock configuration structure and
     * value types
     * @param config - The object lock configuration to validate
     */
    static validateConfig(config: any) {
        assert.strictEqual(typeof config, 'object');
        const rule = config.rule;
        if (rule) {
            assert.strictEqual(typeof rule, 'object');
            assert.strictEqual(typeof rule.mode, 'string');
            if (rule.days) {
                assert.strictEqual(typeof rule.days, 'number');
            } else {
                assert.strictEqual(typeof rule.years, 'number');
            }
        }
    }

    /**
     * Get the XML representation of the configuration object
     * @param config - The bucket object lock configuration
     * @return - The XML representation of the configuration
     */
    static getConfigXML(config: any) {
        // object lock is enabled on the bucket but object lock configuration
        // not set
        if (config.rule === undefined) {
            return '<?xml version="1.0" encoding="UTF-8"?>' +
                '<ObjectLockConfiguration ' +
                'xmlns="http://s3.amazonaws.com/doc/2006-03-01/">' +
                '<ObjectLockEnabled>Enabled</ObjectLockEnabled>' +
                '</ObjectLockConfiguration>';
        }
        const { days, years, mode } = config.rule;
        const Mode = `<Mode>${mode}</Mode>`;
        const Days = days !== undefined ? `<Days>${days}</Days>` : '';
        const Years = years !== undefined ? `<Years>${years}</Years>` : '';
        const Time = Days || Years;
        return '<?xml version="1.0" encoding="UTF-8"?>' +
            '<ObjectLockConfiguration ' +
            'xmlns="http://s3.amazonaws.com/doc/2006-03-01/">' +
            '<ObjectLockEnabled>Enabled</ObjectLockEnabled>' +
            '<Rule>' +
            '<DefaultRetention>' +
            `${Mode}` +
            `${Time}` +
            '</DefaultRetention>' +
            '</Rule>' +
            '</ObjectLockConfiguration>';
    }
}
