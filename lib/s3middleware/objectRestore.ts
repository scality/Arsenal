import {parseStringPromise} from 'xml2js';
import errors, {ArsenalError} from '../errors';
import * as werelogs from 'werelogs';
import {validRestoreObjectTiers} from "../constants";

/*
    Format of xml request:
    <RestoreRequest>
      <Days>integer</Days>
      <Tier>Standard|Bulk|Expedited</Tier>
    </RestoreRequest>
*/

/**
 * validate restore request xml
 * @param restoreRequest - parsed restore request object
 * @return{ArsenalError|undefined} - error on failure, undefined on success
 */
function validateRestoreRequest(restoreRequest?: any) {
    if (!restoreRequest) {
        const desc = 'request xml does not contain RestoreRequest';
        return errors.MalformedXML.customizeDescription(desc);
    }
    if (!restoreRequest.Days || !restoreRequest.Days[0]) {
        const desc = 'request xml does not contain RestoreRequest.Days';
        return errors.MalformedXML.customizeDescription(desc);
    }
    // RestoreRequest.Days must be greater than or equal to 1
    const daysValue = Number.parseInt(restoreRequest.Days[0], 10);
    if (Number.isNaN(daysValue)) {
        const desc = `RestoreRequest.Days is invalid type. [${restoreRequest.Days[0]}]`;
        return errors.MalformedXML.customizeDescription(desc);
    }
    if (daysValue < 1) {
        const desc = `RestoreRequest.Days must be greater than 0. [${restoreRequest.Days[0]}]`;
        return errors.MalformedXML.customizeDescription(desc);
    }
    if (daysValue > 2147483647) {
        const desc = `RestoreRequest.Days must be less than 2147483648. [${restoreRequest.Days[0]}]`;
        return errors.MalformedXML.customizeDescription(desc);
    }
    if (restoreRequest.Tier && restoreRequest.Tier[0] && !validRestoreObjectTiers.has(restoreRequest.Tier[0])) {
        const desc = `RestoreRequest.Tier is invalid value. [${restoreRequest.Tier[0]}]`;
        return errors.MalformedXML.customizeDescription(desc);
    }
    return undefined;
}

/**
 * parseRestoreRequestXml - Parse and validate xml body, returning callback with
 * object restoreReqObj: { days: <value>, tier: <value> }
 * @param xml - xml body to parse and validate
 * @param log - Werelogs logger
 * @param cb - callback to server
 * @return - calls callback with object restore request or error
 */
export async function parseRestoreRequestXml(
    xml: string,
    log: werelogs.Logger,
    cb: (err: ArsenalError | null, data?: any) => void,
) {
    let result;
    try {
        result = await parseStringPromise(xml);
    } catch (err) {
        log.debug('xml parsing failed', {
            error: err,
            method: 'parseRestoreXml',
            xml,
        });
        return cb(errors.MalformedXML);
    }
    if (!result) {
        const desc = 'request xml is undefined or empty';
        return cb(errors.MalformedXML.customizeDescription(desc));
    }
    const restoreRequest = result.RestoreRequest;
    const restoreReqError = validateRestoreRequest(restoreRequest);
    if (restoreReqError) {
        log.debug('restore request validation failed', {
            error: restoreReqError,
            method: 'validateRestoreRequest',
            xml,
        });
        return cb(restoreReqError);
    }
    // If do not specify Tier, set "Standard"
    return cb(null, {
        days: Number.parseInt(restoreRequest.Days, 10),
        tier: restoreRequest.Tier && restoreRequest.Tier[0] ? restoreRequest.Tier[0] : 'Standard',
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
        return '';
    }
    return [
        '<RestoreRequest xmlns="http://s3.amazonaws.com/doc/2006-03-01/">',
        `<Days>${days}</Days>`,
        `<Tier>${tier}</Tier>`,
        '</RestoreRequest>',
    ].join('');
}
