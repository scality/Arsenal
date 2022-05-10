import { parseString } from 'xml2js';
import errors, { ArsenalError } from '../errors';
import * as werelogs from 'werelogs';

/*
    Format of xml request:
    <RestoreRequest>
      <Days>integer</Days>
      <Tier>Standard|Bulk|Expedited</RetainUntilDate>
    </RestoreRequest>
*/

/**
 * validateDays - validate restore days
 * @param days - parsed days string
 * @return - contains days or error
 */
function validateDays(days?: string) {
    if (!days || !days[0]) {
        const desc = 'request xml does not contain RestoreRequest.Days';
        const error = errors.MalformedXML.customizeDescription(desc);
        return { error };
    }
    // RestoreRequest.Days must be greater than or equal to 1
    const daysValue = Number.parseInt(days[0], 10);
    if (Number.isNaN(daysValue)) {
        const desc = `RestoreRequest.Days is invalid type. [${days}]`;
        const error = errors.MalformedXML.customizeDescription(desc);
        return { error };
    }
    if (daysValue < 1) {
        const desc = `RestoreRequest.Days must be greater than 0. [${days}]`;
        const error = errors.MalformedXML.customizeDescription(desc);
        return { error };
    }
    if (daysValue > 2147483647) {
        const desc = `RestoreRequest.Days must be less than 2147483648. [${days}]`;
        const error = errors.MalformedXML.customizeDescription(desc);
        return { error };
    }
    return { days: daysValue }
}

/**
 * validateTier - validate retain until date
 * @param tier - parsed tier string
 * @return - contains retain until date or error
 */
function validateTier(tier?: string) {
    // If Tier is specified, must be "Expedited" or "Standard" or "Bulk"
    const tierList = ['Expedited', 'Standard', 'Bulk'];
    if (tier && tier[0] && !tierList.includes(tier[0])) {
        const desc = `RestoreRequest.Tier is invalid value. [${tier}]`;
        const error = errors.MalformedXML.customizeDescription(desc);
        return { error };
    }
    // If do not specify, set "Standard"
    return { tier: tier && tier[0] ? tier[0] : 'Standard' };
}

/**
 * validate retention - validate retention xml
 * @param parsedXml - parsed retention xml object
 * @return - contains retention information on success,
 * error on failure
 */
function validateRestoreRequestParameters(parsedXml?: any) {
    if (!parsedXml) {
        const desc = 'request xml is undefined or empty';
        const error = errors.MalformedXML.customizeDescription(desc);
        return { error };
    }
    const restoreRequest = parsedXml.RestoreRequest;
    if (!restoreRequest) {
        const desc = 'request xml does not contain RestoreRequest';
        const error = errors.MalformedXML.customizeDescription(desc);
        return { error };
    }
    const daysObj = validateDays(restoreRequest.Days);
    if (daysObj.error) {
        return { error: daysObj.error };
    }
    const tierObj = validateTier(restoreRequest.Tier);
    if (tierObj.error) {
        return { error: tierObj.error };
    }
    return { days: daysObj.days, tier: tierObj.tier };
}

/**
 * parseRetentionXml - Parse and validate xml body, returning callback with
 * object retentionObj: { mode: <value>, date: <value> }
 * @param xml - xml body to parse and validate
 * @param log - Werelogs logger
 * @param cb - callback to server
 * @return - calls callback with object retention or error
 */
export function parseRestoreRequestXml(
    xml: string,
    log: werelogs.Logger,
    cb: (err: ArsenalError | null, data?: any) => void,
) {
    parseString(xml, (err, result) => {
        if (err) {
            log.trace('xml parsing failed', {
                error: err,
                method: 'parseRestoreXml',
            });
            log.debug('invalid xml', { xml });
            return cb(errors.MalformedXML);
        }
        const restoreReqObj = validateRestoreRequestParameters(result);
        if (restoreReqObj.error) {
            log.debug('restore request validation failed', {
                error: restoreReqObj.error,
                method: 'validateRestoreRequestParameters',
                xml,
            });
            return cb(restoreReqObj.error);
        }
        return cb(null, restoreReqObj);
    });
}

/**
 * convertToXml - Convert restore request info object to xml
 * @param days - restore days
 * @param tier - restore tier
 * @return - returns restore request information xml string
 */
export function convertToXml(days: string, tier: string) {
    if (!(days && tier)) {
        return ''
    }
    return [
        '<RestoreRequest xmlns="http://s3.amazonaws.com/doc/2006-03-01/">',
        `<Days>${days}</Days>`,
        `<Tier>${tier}</Tier>`,
        '</RestoreRequest>',
    ].join('');
}
