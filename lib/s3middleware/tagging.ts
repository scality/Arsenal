import { parseString } from 'xml2js';
import * as werelogs from 'werelogs';
import errors, { ArsenalError } from '../errors';
import escapeForXml from './escapeForXml';

const errorInvalidArgument = () => errors.InvalidArgument
    .customizeDescription('The header \'x-amz-tagging\' shall be ' +
  'encoded as UTF-8 then URLEncoded URL query parameters without ' +
  'tag name duplicates.');
const errorBadRequestLimit50 = () => errors.BadRequest
    .customizeDescription('Object tags cannot be greater than 50');

/*
    Format of xml request:

    <Tagging>
      <TagSet>
         <Tag>
           <Key>Tag Name</Key>
           <Value>Tag Value</Value>
         </Tag>
      </TagSet>
    </Tagging>
*/


export const _validator = {
    validateTagStructure: (tag: any) => tag
        && Object.keys(tag).length === 2
        && tag.Key && tag.Value
        && tag.Key.length === 1 && tag.Value.length === 1
        && tag.Key[0] !== undefined && tag.Value[0] !== undefined
        && typeof tag.Key[0] === 'string' && typeof tag.Value[0] === 'string',

    validateXMLStructure: (result: any) =>
        result && Object.keys(result).length === 1 &&
        result.Tagging &&
        result.Tagging.TagSet &&
        result.Tagging.TagSet.length === 1 &&
        (
            result.Tagging.TagSet[0] === '' ||
          result.Tagging.TagSet[0] &&
          Object.keys(result.Tagging.TagSet[0]).length === 1 &&
          result.Tagging.TagSet[0].Tag &&
          Array.isArray(result.Tagging.TagSet[0].Tag)
        ),

    validateKeyValue: (key: string, value: any) => {
        if (key.length > 128) {
            return errors.InvalidTag.customizeDescription('The TagKey you ' +
              'have provided is too long, max 128');
        }
        if (value.length > 256) {
            return errors.InvalidTag.customizeDescription('The TagValue you ' +
              'have provided is too long, max 256');
        }
        return true;
    },
};

/** _validateTags - Validate tags, returning an error if tags are invalid
* @param tags - tags parsed from xml to be validated
* @param tags[].Key - Name of the tag
* @param tags[].Value - Value of the tag
* @return tagsResult - return object tags on success
* { key: value}; error on failure
*/
function _validateTags(tags: Array<{ Key: string[], Value: string[] }>) {
    if (tags.length === 0) {
        return {};
    }
    // Maximum number of tags per resource: 50
    if (tags.length > 50) {
        return errorBadRequestLimit50();
    }

    const tagsResult = {};
    for (const tag of tags) {
        if (!_validator.validateTagStructure(tag)) {
            return errors.MalformedXML;
        }
        const key = tag.Key[0];
        const value = tag.Value[0];

        if (!key) {
            return errors.InvalidTag.customizeDescription('The TagKey you ' +
            'have provided is invalid');
        }

        // Allowed characters are letters, whitespace, and numbers, plus
        // the following special characters: + - = . _ : /
        // Maximum key length: 128 Unicode characters
        // Maximum value length: 256 Unicode characters
        const result = _validator.validateKeyValue(key, value);
        if (result instanceof Error) {
            return result;
        }

        tagsResult[key] = value;
    }
    // not repeating keys
    if (tags.length > Object.keys(tagsResult).length) {
        return errors.InvalidTag.customizeDescription('Cannot provide ' +
        'multiple Tags with the same key');
    }
    return tagsResult;
}

/** parseTagXml - Parse and validate xml body, returning callback with object
* tags : { key: value}
* @param xml - xml body to parse and validate
* @param log - Werelogs logger
* @param cb - callback to server
* @return - calls callback with tags object on success, error
* on failure
*/
export function parseTagXml(
    xml: string,
    log: werelogs.Logger,
    cb: (error: ArsenalError | Error | null, data?: any) => void,
) {
    parseString(xml, (err, result) => {
        if (err) {
            log.trace('xml parsing failed', {
                error: err,
                method: 'parseTagXml',
            });
            log.debug('invalid xml', { xml });
            return cb(errors.MalformedXML);
        }
        if (!_validator.validateXMLStructure(result)) {
            log.debug('xml validation failed', {
                error: errors.MalformedXML,
                method: '_validator.validateXMLStructure',
                xml,
            });
            return cb(errors.MalformedXML);
        }
        // AWS does not return error if no tag
        if (result.Tagging.TagSet[0] === '') {
            return cb(null, []);
        }
        const validationRes = _validateTags(result.Tagging.TagSet[0].Tag);
        if (validationRes instanceof Error) {
            log.debug('tag validation failed', {
                error: validationRes,
                method: '_validateTags',
                xml,
            });
            return cb(validationRes);
        }
        // if no error, validation returns tags object
        return cb(null, validationRes);
    });
}

export function convertToXml(objectTags?: any) {
    const xml: string[] = [];
    xml.push('<?xml version="1.0" encoding="UTF-8" standalone="yes"?>',
        '<Tagging> <TagSet>');
    if (objectTags && Object.keys(objectTags).length > 0) {
        Object.keys(objectTags).forEach(key => {
            xml.push(`<Tag><Key>${escapeForXml(key)}</Key>` +
            `<Value>${escapeForXml(objectTags[key])}</Value></Tag>`);
        });
    }
    xml.push('</TagSet> </Tagging>');
    return xml.join('');
}

/** parseTagFromQuery - Parse and validate x-amz-tagging header (URL query
* parameter encoded), returning callback with object tags : { key: value}
* @param tagQuery - tag(s) URL query parameter encoded
* @return - calls callback with tags object on success, error
* on failure
*/
export function parseTagFromQuery(tagQuery: string) {
    const tagsResult = {};
    const pairs = tagQuery.split('&');
    let key: string;
    let value: string;
    let emptyTag = 0;
    if (pairs.length === 0) {
        return tagsResult;
    }
    for (let i = 0; i < pairs.length; i++) {
        const pair = pairs[i];
        if (!pair) {
            emptyTag++;
            continue;
        }
        const pairArray = pair.split('=');
        if (pairArray.length !== 2) {
            return errorInvalidArgument();
        }
        try {
            key = decodeURIComponent(pairArray[0]);
            value = decodeURIComponent(pairArray[1]);
        } catch (err) {
            return errorInvalidArgument();
        }
        if (!key) {
            return errorInvalidArgument();
        }
        const errorResult = _validator.validateKeyValue(key, value);
        if (errorResult instanceof Error) {
            return errorResult;
        }
        tagsResult[key] = value;
    }
    // return InvalidArgument error if using the same key multiple times
    if (pairs.length - emptyTag > Object.keys(tagsResult).length) {
        return errorInvalidArgument();
    }
    if (Object.keys(tagsResult).length > 50) {
        return errorBadRequestLimit50();
    }
    return tagsResult;
}
