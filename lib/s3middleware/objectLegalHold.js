const { parseString } = require('xml2js');
const errors = require('../errors');

/*
    Format of the xml request:
    <LegalHold>
        <Status>ON|OFF</Status>
    </LegalHold>
*/

/**
 * validate status - validate status xml
 * @param {object} status - parsed status object
 * @return {object} - contains validated status object on success,
 * error on failure
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
    return validatedStatus;
}

/**
 * validate legal hold - validate legal hold xml
 * @param {object} parsedXml - parsed legal hold xml object
 * @return {object} - contains legal hold information on success,
 * error on failure
 */
function _validateLegalHold(parsedXml) {
    const validatedLegalHold = {};
    if (!parsedXml || parsedXml === '') {
        validatedLegalHold.error = errors.MalformedXML.customizeDescription(
            'request xml is undefined or empty');
        return validatedLegalHold;
    }
    const legalHold = parsedXml.LegalHold;
    if (!legalHold || legalHold === '') {
        validatedLegalHold.error = errors.MalformedXML.customizeDescription(
            'request xml does not contain LegalHold');
        return validatedLegalHold;
    }
    const validatedStatus = _validateStatus(legalHold.Status);
    if (validatedStatus.error) {
        validatedLegalHold.error = validatedStatus.error;
        return validatedLegalHold;
    }
    validatedLegalHold.legalHold = {
        status: validatedStatus.status,
    };
    return validatedLegalHold;
}

/**
 * parse object legal hold - Parse and validate xml body, returning callback with
 * object legalHold: { status: ON | OFF }
 * @param {string} xml - xml body to parse and validate
 * @param {object} log - Werelogs logger
 * @param {function} cb - callback to server
 * @return {Error|object} - returns object with legal hold status on success,
 * error on failure
 */
function parseLegalHoldXml(xml, log, cb) {
    parseString(xml, (err, result) => {
        if (err) {
            log.trace('xml parsing failed', {
                error: err,
                method: 'parseLegalHoldXml',
            });
            log.debug('invalid xml', { xml });
            return cb(errors.MalformedXML);
        }
        const validatedLegalHold = _validateLegalHold(result);
        if (validatedLegalHold.error) {
            log.debug('legal hold validation failed', {
                error: validatedLegalHold.error,
                method: 'validateLegalHold',
                xml,
            });
            return cb(validatedLegalHold.error);
        }
        return cb(null, validatedLegalHold);
    });
}

/**
 * parse object legal hold - Parse and validate xml body, returning callback with
 * object legalHold: { status: ON | OFF }
 * @param {object} legalHold - valid legal hold object
 * @return {object|Error} - returns object with legal hold status on success,
 * error on failure
 */
function convertToXml(legalHold) {
    const xml = '<?xml version="1.0" encoding="UTF-8" standalone="yes"?>' +
        `<LegalHold><Status>${legalHold.status}</Status></LegalHold>`;
    return xml;
}

module.exports = {
    convertToXml,
    parseLegalHoldXml,
};
