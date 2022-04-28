const { parseString } = require('xml2js');

const errors = require('../errors').default;

/*
    Format of xml request:
    <Retention>
      <Mode>COMPLIANCE|GOVERNANCE</Mode>
      <RetainUntilDate>2020-05-20T04:58:45.413000Z</RetainUntilDate>
    </Retention>
*/

/**
 * validateMode - validate retention mode
 * @param {array} mode - parsed xml mode array
 * @return {object} - contains mode or error
 */
function validateMode(mode) {
    const modeObj = {};
    const expectedModes = new Set(['GOVERNANCE', 'COMPLIANCE']);
    if (!mode || !mode[0]) {
        modeObj.error = errors.MalformedXML.customizeDescription(
            'request xml does not contain Mode');
        return modeObj;
    }
    if (mode.length > 1) {
        modeObj.error = errors.MalformedXML.customizeDescription(
            'request xml contains more than one Mode');
        return modeObj;
    }
    if (!expectedModes.has(mode[0])) {
        modeObj.error = errors.MalformedXML.customizeDescription(
            'Mode request xml must be one of "GOVERNANCE", "COMPLIANCE"');
        return modeObj;
    }
    modeObj.mode = mode[0];
    return modeObj;
}

/**
 * validateRetainDate - validate retain until date
 * @param {array} retainDate - parsed xml retention date array
 * @return {object} - contains retain until date or error
 */
function validateRetainDate(retainDate) {
    const dateObj = {};
    if (!retainDate || !retainDate[0]) {
        dateObj.error = errors.MalformedXML.customizeDescription(
            'request xml does not contain RetainUntilDate');
        return dateObj;
    }
    const retentionDate = Date.parse(retainDate[0]);
    if (isNaN(retentionDate)) {
        dateObj.error = errors.InvalidRequest.customizeDescription(
            'RetainUntilDate is not a valid timestamp');
        return dateObj;
    }
    const date = new Date(retentionDate);
    if (date < Date.now()) {
        dateObj.error = errors.InvalidRequest.customizeDescription(
            'RetainUntilDate must be in the future');
        return dateObj;
    }
    dateObj.date = retainDate[0];
    return dateObj;
}

/**
 * validate retention - validate retention xml
 * @param {object} parsedXml - parsed retention xml object
 * @return {object} - contains retention information on success,
 * error on failure
 */
function validateRetention(parsedXml) {
    const retentionObj = {};
    if (!parsedXml) {
        retentionObj.error = errors.MalformedXML.customizeDescription(
            'request xml is undefined or empty');
        return retentionObj;
    }
    const retention = parsedXml.Retention;
    if (!retention) {
        retentionObj.error = errors.MalformedXML.customizeDescription(
            'request xml does not contain Retention');
        return retentionObj;
    }
    const modeObj = validateMode(retention.Mode);
    if (modeObj.error) {
        retentionObj.error = modeObj.error;
        return retentionObj;
    }
    const dateObj = validateRetainDate(retention.RetainUntilDate);
    if (dateObj.error) {
        retentionObj.error = dateObj.error;
        return retentionObj;
    }
    retentionObj.mode = modeObj.mode;
    retentionObj.date = dateObj.date;
    return retentionObj;
}

/**
 * parseRetentionXml - Parse and validate xml body, returning callback with
 * object retentionObj: { mode: <value>, date: <value> }
 * @param {string} xml - xml body to parse and validate
 * @param {object} log - Werelogs logger
 * @param {function} cb - callback to server
 * @return {undefined} - calls callback with object retention or error
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
        const retentionObj = validateRetention(result);
        if (retentionObj.error) {
            log.debug('retention validation failed', {
                error: retentionObj.error,
                method: 'validateRetention',
                xml,
            });
            return cb(retentionObj.error);
        }
        return cb(null, retentionObj);
    });
}

/**
 * convertToXml - Convert retention info object to xml
 * @param {string} mode - retention mode
 * @param {string} date - retention retain until date
 * @return {string} - returns retention information xml string
 */
function convertToXml(mode, date) {
    const xml = [];
    xml.push('<Retention xmlns="http://s3.amazonaws.com/doc/2006-03-01/">');
    if (mode && date) {
        xml.push(`<Mode>${mode}</Mode>`);
        xml.push(`<RetainUntilDate>${date}</RetainUntilDate>`);
    } else {
        return '';
    }
    xml.push('</Retention>');
    return xml.join('');
}

module.exports = {
    parseRetentionXml,
    convertToXml,
};
