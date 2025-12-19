const werelogs = require('werelogs');

const errorInstances = require('../../../../errors').errorInstances;
const { parseTagFromQuery } = require('../../../../s3middleware/tagging');
const { gcpTaggingPrefix } = require('../../../../constants');

const gcpLogLevel = 'info';
const gcpDumpLevel = 'error';
werelogs.configure({
    level: gcpLogLevel,
    dump: gcpDumpLevel,
});

const logger = new werelogs.Logger('gcpUtil');

function eachSlice(size) {
    this.array = [];
    let partNumber = 1;
    for (let ind = 0; ind < this.length; ind += size) {
        this.array.push({
            Parts: this.slice(ind, ind + size),
            PartNumber: partNumber++,
        });
    }
    return this.array;
}

function getSourceInfo(CopySource) {
    const source =
        CopySource.startsWith('/') ? CopySource.slice(1) : CopySource;
    const sourceArray = source.split(/\/(.+)/);
    const sourceBucket = sourceArray[0];
    const sourceObject = sourceArray[1];
    return { sourceBucket, sourceObject };
}

function getPaddedPartNumber(number) {
    return `000000${number}`.substr(-5);
}

function getPartNumber(number) {
    if (isNaN(number)) {
        return undefined;
    }
    if (typeof number === 'string') {
        return parseInt(number, 10);
    }
    return number;
}

function createMpuKey(key, uploadId, partNumberArg, fileNameArg) {
    let partNumber = partNumberArg;
    let fileName = fileNameArg;

    if (typeof partNumber === 'string' && fileName === undefined) {
        fileName = partNumber;
        partNumber = null;
    }
    const paddedNumber = getPaddedPartNumber(partNumber);
    if (fileName && typeof fileName === 'string') {
        // if partNumber is given, return a "full file path"
        // else return a "directory path"
        return partNumber ? `${key}-${uploadId}/${fileName}/${paddedNumber}` :
            `${key}-${uploadId}/${fileName}`;
    }
    if (partNumber && typeof partNumber === 'number') {
        // filename wasn't passed as an argument. Create default
        return `${key}-${uploadId}/parts/${paddedNumber}`;
    }
    // returns a "directory path"
    return `${key}-${uploadId}/`;
}

function createMpuList(params, level, size) {
    // populate and return a parts list for compose
    const retList = [];
    for (let i = 1; i <= size; ++i) {
        retList.push({
            PartName: createMpuKey(params.Key, params.UploadId, i, level),
            PartNumber: i,
        });
    }
    return retList;
}

function processTagSet(tagSet = []) {
    if (tagSet.length > 10) {
        return errorInstances.BadRequest
            .customizeDescription('Object tags cannot be greater than 10');
    }
    let error = undefined;
    const tagAsMeta = {};
    const taggingDict = {};
    tagSet.every(tag => {
        const { Key: key, Value: value } = tag;
        if (key.length > 128) {
            error = errorInstances.InvalidTag
                .customizeDescription(
                    `The TagKey provided is too long, ${key.length}`);
            return false;
        }
        if (value.length > 256) {
            error = errorInstances.InvalidTag
                .customizeDescription(
                    `The TagValue provided is too long, ${value.length}`);
            return false;
        }
        if (taggingDict[key]) {
            error = errorInstances.InvalidTag
                .customizeDescription(
                    'Cannot provide multiple Tags with the same key');
            return false;
        }
        tagAsMeta[`${gcpTaggingPrefix}${key}`] = value;
        taggingDict[key] = true;
        return true;
    });
    if (error) {
        return error;
    }
    return tagAsMeta;
}

function stripTags(metadata = {}) {
    const retMD = Object.assign({}, metadata);
    Object.keys(retMD).forEach(key => {
        if (key.startsWith(gcpTaggingPrefix)) {
            delete retMD[key];
        }
    });
    return retMD;
}

function retrieveTags(metadata = {}) {
    const retTagSet = [];
    Object.keys(metadata).forEach(key => {
        if (key.startsWith(gcpTaggingPrefix)) {
            retTagSet.push({
                Key: key.slice(gcpTaggingPrefix.length),
                Value: metadata[key],
            });
        }
    });
    return retTagSet;
}

function getHeaderCaseInsensitive(headers, headerName) {
    if (!headers) {
        return undefined;
    }

    const normalized = headerName.toLowerCase();
    if (headers[normalized] !== undefined) {
        return headers[normalized];
    }

    const direct = headers[headerName];
    if (direct !== undefined) {
        return direct;
    }

    for (const key of Object.keys(headers)) {
        if (key.toLowerCase() === normalized) {
            return headers[key];
        }
    }

    return undefined;
}

function getPutTagsMetadata(metadata, tagging = '') {
    let retMetadata = metadata || {};
    retMetadata = stripTags(retMetadata);
    const tagObj = parseTagFromQuery(tagging);
    Object.keys(tagObj).forEach(header => {
        const prefixed = `${gcpTaggingPrefix}${header}`.toLowerCase();
        retMetadata[prefixed] = tagObj[header];
    });
    return retMetadata;
}

function attachHeaderCaptureMiddleware(command, headerName, onValue, options = {}) {
    const { middlewareName, step = 'deserialize' } = options;
    const name = middlewareName || `capture-${headerName.toLowerCase()}`;
    command.middlewareStack.add(
        next => async args => {
            const result = await next(args);
            if (typeof onValue === 'function') {
                const value = getHeaderCaseInsensitive(
                    result.response?.headers,
                    headerName
                );
                onValue(value, result.response?.headers, result);
            }
            return result;
        },
        {
            step,
            name,
        }
    );
}

module.exports = {
    // functions
    eachSlice,
    createMpuKey,
    createMpuList,
    getSourceInfo,
    processTagSet,
    stripTags,
    retrieveTags,
    getPutTagsMetadata,
    getPartNumber,
    getHeaderCaseInsensitive,
    attachHeaderCaptureMiddleware,
    // util objects
    logger,
};
