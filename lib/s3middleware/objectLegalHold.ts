import { parseString } from 'xml2js';
import errors, { ArsenalError } from '../errors';
import * as werelogs from 'werelogs';

/*
    Format of the xml request:
    <LegalHold>
        <Status>ON|OFF</Status>
    </LegalHold>
*/

/**
 * @param status - legal hold status parsed from xml to be validated
 * @return - legal hold status or error
 */
function _validateStatus(status?: string[]) {
    const expectedValues = new Set(['OFF', 'ON']);
    if (!status || status[0] === '') {
        const desc = 'request xml does not contain Status';
        const error = errors.MalformedXML.customizeDescription(desc);
        return { error };
    }
    if (status.length > 1) {
        const desc = 'request xml contains more than one Status';
        const error = errors.MalformedXML.customizeDescription(desc);
        return { error };
    }
    if (!expectedValues.has(status[0])) {
        const desc = 'Status request xml must be one of "ON", "OFF"';
        const error = errors.MalformedXML.customizeDescription(desc);
        return { error };
    }
    return { status: status[0] as 'OFF' | 'ON' }
}

/**
 * validate legal hold - validates legal hold xml
 * @param parsedXml - parsed legal hold xml object
 * @return - object with status or error
 */
function _validateLegalHold(parsedXml?: { LegalHold: { Status: string[] } }) {
    if (!parsedXml) {
        const desc = 'request xml is undefined or empty';
        const error = errors.MalformedXML.customizeDescription(desc);
        return { error };
    }
    if (!parsedXml.LegalHold) {
        const desc = 'request xml does not contain LegalHold';
        const error = errors.MalformedXML.customizeDescription(desc);
        return { error };
    }
    const validatedStatus = _validateStatus(parsedXml.LegalHold.Status);
    if (validatedStatus.error) {
        const error = validatedStatus.error;
        return { error };
    }
    return { status: validatedStatus.status };
}

/**
 * parse object legal hold - parse and validate xml body
 * @param xml - xml body to parse and validate
 * @param log - werelogs logger
 * @param cb - callback to server
 * @return - calls callback with legal hold status or error
 */
export function parseLegalHoldXml(
    xml: string,
    log: werelogs.Logger,
    cb: (err: ArsenalError | null, data?: boolean) => void,
) {
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
        const validatedLegalHoldStatus = validatedLegalHold.status === 'ON';
        if (validatedLegalHold.error) {
            log.debug('legal hold validation failed', {
                error: { message: validatedLegalHold.error.message },
                method: 'parseLegalHoldXml',
                xml,
            });
            return cb(validatedLegalHold.error);
        }
        return cb(null, validatedLegalHoldStatus);
    });
}

/**
 * convert to xml - generates legal hold xml
 * @param legalHold - true if legal hold is on
 * false if legal hold is off, undefined if legal hold is not set
 * @return - returns legal hold xml
 */
export function convertToXml(legalHold?: boolean) {
    if (!legalHold && legalHold !== false) {
        return '';
    }
    return [
        '<?xml version="1.0" encoding="UTF-8" standalone="yes"?>',
        '<LegalHold>',
            `<Status>${legalHold ? 'ON' : 'OFF'}</Status>`,
        '</LegalHold>',
    ].join('');
}
