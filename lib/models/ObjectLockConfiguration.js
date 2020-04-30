const assert = require('assert');

/**
 * Format of xml request:
 *
 * <ObjectLockConfiguration>
 *      <ObjectLockEnabled>Enabled</ObjectLockEnabled>
 *      <Rule>
 *          <DefaultRetention>
 *              <Mode>GOVERNANCE|COMPLIANCE</Mode>
 *              <Days>1</Days>
 *              <Years>1</Years>z
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
     * Validate the bucket metadata lifecycle configuration structure and
     * value types
     * @param {object} config - The lifecycle configuration to validate
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
