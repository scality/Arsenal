const { parseString } = require('xml2js');
const errors = require('../errors');

/*
    Format of the xml request:
    <LegalHold>
        <Status>ON|OFF</Status>
    </LegalHold>
*/

/**
 * validate status - validates status xml
 * @param {object} status - parsed status object
 * @return {boolean} - true or false on success, error on failure
 */
function _validateStatus(status) {
    const validatedStatus = {};
    const expectedValues = ['OFF', 'ON'];
    if (!status || status[0] === '') {
        validatedStatus.error = errors.MalformedXML.customizeDescription(
            'request xml does not contain Status');
        return validatedStatus;
    }
    if (status.length > 1) {
        validatedStatus.error = errors.MalformedXML.customizeDescription(
            'request xml contains more than one Status');
        return validatedStatus;
    }
    if (!expectedValues.includes(status[0])) {
        validatedStatus.error = errors.MalformedXML.customizeDescription(
            'Status request xml must be one of "ON", "OFF"');
        return validatedStatus;
    }
    validatedStatus.status = status[0];
    return validatedStatus.status === 'ON';
}

/**
 * validate legal hold - validates legal hold xml
 * @param {object} parsedXml - parsed legal hold xml object
 * @return {boolean} - contains legal hold status on success,
 * error on failure
 */
function _validateLegalHold(parsedXml) {
    const validatedLegalHold = {};
    if (!parsedXml) {
        validatedLegalHold.error = errors.MalformedXML.customizeDescription(
            'request xml is undefined or empty');
        return validatedLegalHold;
    }
    if (!parsedXml.LegalHold) {
        validatedLegalHold.error = errors.MalformedXML.customizeDescription(
            'request xml does not contain LegalHold');
        return validatedLegalHold;
    }
    const validatedStatus = _validateStatus(parsedXml.LegalHold.Status);
    if (validatedStatus.error) {
        validatedLegalHold.error = validatedStatus.error;
        return validatedLegalHold;
    }
    validatedLegalHold.status = validatedStatus;
    return validatedLegalHold;
}

/**
 * parse object legal hold - parse and validate xml body
 * @param {string} xml - xml body to parse and validate
 * @param {object} log - werelogs logger
 * @param {function} cb - callback to server
 * @return {function} - callback with legal hold boolean on success,
 * error on failure
 */
function parseLegalHoldXml(xml, log, cb) {
    parseString(xml, (err, result) => {
        if (err) {
            log.debug('xml parsing failed', {
                error: { message: err.message },
                method: 'parseLegalHoldXml',
                xml,
            });
            return cb(errors.MalformedXML);
        }
        const validatedLegalHold = _validateLegalHold(result);
        if (validatedLegalHold.error) {
            log.debug('legal hold validation failed', {
                error: { message: validatedLegalHold.error.message },
                method: 'parseLegalHoldXml',
                xml,
            });
            return cb(validatedLegalHold.error);
        }
        return cb(null, validatedLegalHold.status);
    });
}

/**
 * convert to xml - generates legal hold xml
 * @param {boolean} legalHold - true if legal hold is on else false
 * @return {string} - returns legal hold xml
 */
function convertToXml(legalHold) {
    const status = legalHold ? 'ON' : 'OFF';
    const xml = `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
        <LegalHold><Status>${status}</Status></LegalHold>`;
    return xml;
}

module.exports = {
    convertToXml,
    parseLegalHoldXml,
};
