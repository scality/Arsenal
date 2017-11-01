const crypto = require('crypto');
const stream = require('stream');

const ResultsCollector = require('./ResultsCollector');
const SubStreamInterface = require('./SubStreamInterface');
const objectUtils = require('../objectUtils');
const MD5Sum = require('../MD5Sum');
const errors = require('../../errors');

const azureMpuUtils = {};

azureMpuUtils.splitter = '|';
azureMpuUtils.overviewMpuKey = 'azure_mpu';
azureMpuUtils.maxSubPartSize = 104857600;
azureMpuUtils.zeroByteETag = crypto.createHash('md5').update('').digest('hex');


azureMpuUtils.padString = (str, category) => {
    const _padFn = {
        left: (str, padString) =>
            `${padString}${str}`.substr(-padString.length),
        right: (str, padString) =>
            `${str}${padString}`.substr(0, padString.length),
    };
    // It's a little more performant if we add pre-generated strings for each
    // type of padding we want to apply, instead of using string.repeat() to
    // create the padding.
    const padSpec = {
        partNumber: {
            padString: '00000',
            direction: 'left',
        },
        subPart: {
            padString: '00',
            direction: 'left',
        },
        part: {
            padString:
            '%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%',
            direction: 'right',
        },
    };
    const { direction, padString } = padSpec[category];
    return _padFn[direction](str, padString);
};

// NOTE: If we want to extract the object name from these keys, we will need
// to use a similar method to _getKeyAndUploadIdFromMpuKey since the object
// name may have instances of the splitter used to delimit arguments
azureMpuUtils.getMpuSummaryKey = (objectName, uploadId) =>
    `${objectName}${azureMpuUtils.splitter}${uploadId}`;

azureMpuUtils.getBlockId = (uploadId, partNumber, subPartIndex) => {
    const paddedPartNumber = azureMpuUtils.padString(partNumber, 'partNumber');
    const paddedSubPart = azureMpuUtils.padString(subPartIndex, 'subPart');
    const splitter = azureMpuUtils.splitter;
    const blockId = `${uploadId}${splitter}partNumber${paddedPartNumber}` +
        `${splitter}subPart${paddedSubPart}${splitter}`;
    return azureMpuUtils.padString(blockId, 'part');
};

azureMpuUtils.getSummaryPartId = (partNumber, eTag, size) => {
    const paddedPartNumber = azureMpuUtils.padString(partNumber, 'partNumber');
    const timestamp = Date.now();
    const splitter = azureMpuUtils.splitter;
    const summaryKey = `${paddedPartNumber}${splitter}${timestamp}` +
        `${splitter}${eTag}${splitter}${size}${splitter}`;
    return azureMpuUtils.padString(summaryKey, 'part');
};

azureMpuUtils.getSubPartInfo = dataContentLength => {
    const numberFullSubParts =
        Math.floor(dataContentLength / azureMpuUtils.maxSubPartSize);
    const remainder = dataContentLength % azureMpuUtils.maxSubPartSize;
    const numberSubParts = remainder ?
        numberFullSubParts + 1 : numberFullSubParts;
    const lastPartSize = remainder || azureMpuUtils.maxSubPartSize;
    return {
        lastPartIndex: numberSubParts - 1,
        lastPartSize,
    };
};

azureMpuUtils.getSubPartSize = (subPartInfo, subPartIndex) => {
    const { lastPartIndex, lastPartSize } = subPartInfo;
    return subPartIndex === lastPartIndex ?
        lastPartSize : azureMpuUtils.maxSubPartSize;
};

azureMpuUtils.getSubPartIds = (part, uploadId) =>
    [...Array(part.numberSubParts).keys()].map(subPartIndex =>
        azureMpuUtils.getBlockId(uploadId, part.partNumber, subPartIndex));

azureMpuUtils.putSinglePart = (errorWrapperFn, request, params, dataStoreName,
log, cb) => {
    const { bucketName, partNumber, size, objectKey, contentMD5, uploadId }
        = params;
    const totalSubParts = 1;
    const blockId = azureMpuUtils.getBlockId(uploadId, partNumber, 0);
    const passThrough = new stream.PassThrough();
    const options = {};
    if (contentMD5) {
        options.useTransactionalMD5 = true;
        options.transactionalContentMD5 = contentMD5;
    }
    request.pipe(passThrough);
    return errorWrapperFn('uploadPart', 'createBlockFromStream',
        [blockId, bucketName, objectKey, passThrough, size, options,
        (err, result) => {
            if (err) {
                log.error('Error from Azure data backend uploadPart',
                    { error: err.message, dataStoreName });
                if (err.code === 'ContainerNotFound') {
                    return cb(errors.NoSuchBucket);
                }
                if (err.code === 'InvalidMd5') {
                    return cb(errors.InvalidDigest);
                }
                if (err.code === 'Md5Mismatch') {
                    return cb(errors.BadDigest);
                }
                return cb(errors.InternalError.customizeDescription(
                    `Error returned from Azure: ${err.message}`)
                );
            }
            const eTag = objectUtils.getHexMD5(result.headers['content-md5']);
            return cb(null, eTag, totalSubParts, size);
        }], log, cb);
};

azureMpuUtils.putNextSubPart = (errorWrapperFn, partParams, subPartInfo,
subPartStream, subPartIndex, resultsCollector, log, cb) => {
    const { uploadId, partNumber, bucketName, objectKey } = partParams;
    const subPartSize = azureMpuUtils.getSubPartSize(
        subPartInfo, subPartIndex);
    const subPartId = azureMpuUtils.getBlockId(uploadId, partNumber,
        subPartIndex);
    resultsCollector.pushOp();
    errorWrapperFn('uploadPart', 'createBlockFromStream',
        [subPartId, bucketName, objectKey, subPartStream, subPartSize,
        {}, err => resultsCollector.pushResult(err, subPartIndex)], log, cb);
};

azureMpuUtils.putSubParts = (errorWrapperFn, request, params,
dataStoreName, log, cb) => {
    const subPartInfo = azureMpuUtils.getSubPartInfo(params.size);
    const resultsCollector = new ResultsCollector();
    const hashedStream = new MD5Sum();
    const streamInterface = new SubStreamInterface(hashedStream);
    log.trace('data length is greater than max subpart size;' +
        'putting multiple parts');

    resultsCollector.on('error', (err, subPartIndex) => {
        log.error(`Error putting subpart to Azure: ${subPartIndex}`,
            { error: err.message, dataStoreName });
        streamInterface.stopStreaming(request);
        if (err.code === 'ContainerNotFound') {
            return cb(errors.NoSuchBucket);
        }
        return cb(errors.InternalError.customizeDescription(
            `Error returned from Azure: ${err}`));
    });

    resultsCollector.on('done', (err, results) => {
        if (err) {
            log.error('Error putting last subpart to Azure',
                { error: err.message, dataStoreName });
            if (err.code === 'ContainerNotFound') {
                return cb(errors.NoSuchBucket);
            }
            return cb(errors.InternalError.customizeDescription(
                `Error returned from Azure: ${err}`));
        }
        const numberSubParts = results.length;
        const totalLength = streamInterface.getTotalBytesStreamed();
        log.trace('successfully put subparts to Azure',
            { numberSubParts, totalLength });
        hashedStream.on('hashed', () => cb(null, hashedStream.completedHash,
            numberSubParts, totalLength));

        // in case the hashed event was already emitted before the
        // event handler was registered:
        if (hashedStream.completedHash) {
            hashedStream.removeAllListeners('hashed');
            return cb(null, hashedStream.completedHash, numberSubParts,
                totalLength);
        }
        return undefined;
    });

    const currentStream = streamInterface.getCurrentStream();
    // start first put to Azure before we start streaming the data
    azureMpuUtils.putNextSubPart(errorWrapperFn, params, subPartInfo,
        currentStream, 0, resultsCollector, log, cb);

    request.pipe(hashedStream);
    hashedStream.on('end', () => {
        resultsCollector.enableComplete();
        streamInterface.endStreaming();
    });
    hashedStream.on('data', data => {
        const currentLength = streamInterface.getLengthCounter();
        if (currentLength + data.length > azureMpuUtils.maxSubPartSize) {
            const bytesToMaxSize = azureMpuUtils.maxSubPartSize - currentLength;
            const firstChunk = bytesToMaxSize === 0 ? data :
                data.slice(bytesToMaxSize);
            if (bytesToMaxSize !== 0) {
                // if we have not streamed full subpart, write enough of the
                // data chunk to stream the correct length
                streamInterface.write(data.slice(0, bytesToMaxSize));
            }
            const { nextStream, subPartIndex } =
                streamInterface.transitionToNextStream();
            azureMpuUtils.putNextSubPart(errorWrapperFn, params, subPartInfo,
                nextStream, subPartIndex, resultsCollector, log, cb);
            streamInterface.write(firstChunk);
        } else {
            streamInterface.write(data);
        }
    });
};


module.exports = azureMpuUtils;
