const { parseString } = require('xml2js');

const errors = require('../errors');

/*
    Format of xml request:
    <Retention>
      <Mode>COMPLIANCE|GOVERNANCE</Mode>
      <RetainUntilDate>2020-05-20T04:58:45.413000Z</RetainUntilDate>
    </Retention>
*/

function validateMode(mode) {
    const validMode = {};
    const expectedModes = ['GOVERNANCE', 'COMPLIANCE'];
    if (!mode || !mode[0]) {
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

function validateRetainDate(retainDate) {
    const validRetainDate = {};
    if (!retainDate || !retainDate[0]) {
        validRetainDate.error = errors.MalformedXML.customizeDescription(
            'request xml does not contain RetainUntilDate');
        return validRetainDate;
    }
    if (!/\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}.\d{3}Z/.test(retainDate[0])) {
        validRetainDate.error = errors.InvalidRequest.customizeDescription(
            'retain until date timestamp must be ISO-8601 format');
        return validRetainDate;
    }
    const date = new Date(retainDate[0]);
    if (date < Date.now()) {
        validRetainDate.error = errors.InvalidRequest.customizeDescription(
            'retain until date must be in the future');
        return validRetainDate;
    }
    validRetainDate.date = retainDate[0];
    return validRetainDate;
}

/**
 * validate retention - validate retention xml
 * @param {object} parsedXml - parsed retention xml object
 * @return {object} - contains retention information on success,
 * error on failure
 */
function validateRetention(parsedXml) {
    const validRetention = {};
    if (!parsedXml || parsedXml === '') {
        validRetention.error = errors.MalformedXML.customizeDescription(
            'request xml is undefined or empty');
        return validRetention;
    }
    const retention = parsedXml.ObjectRetention;
    if (!retention || retention === '') {
        validRetention.error = errors.MalformedXML.customizeDescription(
            'request xml does not contain Retention');
        return validRetention;
    }
    const validMode = validateMode(retention.Mode);
    if (validMode.error) {
        validRetention.error = validMode.error;
        return validRetention;
    }
    const validRetainDate = validateRetainDate(retention.RetainUntilDate);
    if (validRetainDate.error) {
        validRetention.error = validRetainDate.error;
        return validRetention;
    }
    validRetention.retention = {
        mode: validMode.mode,
        retainUntilDate: validRetainDate.date,
    };
    return validRetention;
}

/**
 * parseRetentionXml - Parse and validate xml body, returning callback with
 * object retentionInfo: { mode: <value>, retainUntilDate: <value> }
 * @param {string} xml - xml body to parse and validate
 * @param {object} log - Werelogs logger
 * @param {function} cb - callback to server
 * @return {Error|object} - returns object with retention information on
 * success, error on failure
 */
function parseRetentionXml(xml, log, cb) {
    parseString(xml, (err, result) => {
        if (err) {
            log.trace('xml parsing failed', {
                error: err,
                method: 'parseRetentionXml',
            });
            log.debug('invalid xml', { xml });
            return cb(errors.MalformedXML);
        }
        const validRetention = validateRetention(result);
        if (validRetention.error) {
            log.debug('retention validation failed', {
                error: validRetention.error,
                method: 'validateRetention',
                xml,
            });
            return cb(validRetention.error);
        }
        return cb(null, validRetention);
    });
}

/**
 * convertToXml - Convert retention info object to xml
 * @param {object} retentionInfo - retention information object
 * @return {string} - returns retention information xml string
 */
function convertToXml(retentionInfo) {
    const xml = [];
    const ret = retentionInfo.retention;
    xml.push('<ObjectRetention xmlns="http://s3.amazonaws.com/doc/2006-03-01/">');
    if (ret && ret.mode && ret.retainUntilDate) {
        xml.push(`<Mode>${ret.mode}</Mode>` +
            `<RetainUntilDate>${ret.retainUntilDate}</RetainUntilDate>`);
    } else {
        return '';
    }
    xml.push('</ObjectRetention>');
    return xml.join('');
}

module.exports = {
    parseRetentionXml,
    convertToXml,
};
