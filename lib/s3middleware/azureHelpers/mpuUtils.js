const crypto = require('crypto');

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


module.exports = azureMpuUtils;
