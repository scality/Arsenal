import { parseString } from 'xml2js';
import errors, { ArsenalError } from '../errors';
import * as werelogs from 'werelogs';

/*
    Format of xml request:
    <Retention>
      <Mode>COMPLIANCE|GOVERNANCE</Mode>
      <RetainUntilDate>2020-05-20T04:58:45.413000Z</RetainUntilDate>
    </Retention>
*/

/**
 * validateMode - validate retention mode
 * @param mode - parsed xml mode array
 * @return - contains mode or error
 */
function validateMode(mode?: string[]) {
    const expectedModes = new Set(['GOVERNANCE', 'COMPLIANCE']);
    if (!mode || !mode[0]) {
        const desc = 'request xml does not contain Mode';
        const error = errors.MalformedXML.customizeDescription(desc);
        return { error };
    }
    if (mode.length > 1) {
        const desc = 'request xml contains more than one Mode';
        const error = errors.MalformedXML.customizeDescription(desc);
        return { error };
    }
    if (!expectedModes.has(mode[0])) {
        const desc = 'Mode request xml must be one of "GOVERNANCE", "COMPLIANCE"';
        const error = errors.MalformedXML.customizeDescription(desc);
        return { error };
    }
    return { mode: mode[0] as 'GOVERNANCE' | 'COMPLIANCE' }
}

/**
 * validateRetainDate - validate retain until date
 * @param retainDate - parsed xml retention date array
 * @return - contains retain until date or error
 */
function validateRetainDate(retainDate?: string[]) {
    if (!retainDate || !retainDate[0]) {
        const desc = 'request xml does not contain RetainUntilDate';
        const error = errors.MalformedXML.customizeDescription(desc);
        return { error };
    }
    const retentionDate = Date.parse(retainDate[0]);
    if (isNaN(retentionDate)) {
        const desc = 'RetainUntilDate is not a valid timestamp';
        const error = errors.InvalidRequest.customizeDescription(desc);
        return { error };
    }
    const date = new Date(retentionDate);
    if (date < new Date()) {
        const desc = 'RetainUntilDate must be in the future';
        const error = errors.InvalidRequest.customizeDescription(desc);
        return { error };
    }
    return { date: retainDate[0] };
}

/**
 * validate retention - validate retention xml
 * @param parsedXml - parsed retention xml object
 * @return - contains retention information on success,
 * error on failure
 */
function validateRetention(parsedXml?: any) {
    if (!parsedXml) {
        const desc = 'request xml is undefined or empty';
        const error = errors.MalformedXML.customizeDescription(desc);
        return { error };
    }
    const retention = parsedXml.Retention;
    if (!retention) {
        const desc = 'request xml does not contain Retention';
        const error = errors.MalformedXML.customizeDescription(desc);
        return { error };
    }
    const modeObj = validateMode(retention.Mode);
    if (modeObj.error) {
        return { error: modeObj.error };
    }
    const dateObj = validateRetainDate(retention.RetainUntilDate);
    if (dateObj.error) {
        return { error: dateObj.error };
    }
    return { mode: modeObj.mode, date: dateObj.date };
}

/**
 * parseRetentionXml - Parse and validate xml body, returning callback with
 * object retentionObj: { mode: <value>, date: <value> }
 * @param xml - xml body to parse and validate
 * @param log - Werelogs logger
 * @param cb - callback to server
 * @return - calls callback with object retention or error
 */
export function parseRetentionXml(
    xml: string,
    log: werelogs.Logger,
    cb: (err: ArsenalError | null, data?: any) => void,
) {
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
 * @param mode - retention mode
 * @param date - retention retain until date
 * @return - returns retention information xml string
 */
export function convertToXml(mode: string, date: string) {
    if (!(mode && date)) {
        return ''
    }
    return [
        '<Retention xmlns="http://s3.amazonaws.com/doc/2006-03-01/">',
            `<Mode>${mode}</Mode>`,
            `<RetainUntilDate>${date}</RetainUntilDate>`,
        '</Retention>',
    ].join('');
}
