import assert from 'assert';
import * as crypto from 'crypto';
import * as stream from 'stream';
import ResultsCollector from './ResultsCollector';
import SubStreamInterface from './SubStreamInterface';
import * as objectUtils from '../objectUtils';
import MD5Sum from '../MD5Sum';
import errors from '../../errors';

export const splitter = '|';
export const overviewMpuKey = 'azure_mpu';
export const maxSubPartSize = 104857600;
export const zeroByteETag = crypto.createHash('md5').update('').digest('hex');

// TODO: S3C-4657
export const padString = (
    str: number | string,
    category: 'partNumber' | 'subPart' | 'part',
) => {
    const _padFn = {
        left: (str: number | string, padString: string) =>
            `${padString}${str}`.slice(-padString.length),
        right: (str: number | string, padString: string) =>
            `${str}${padString}`.slice(0, padString.length),
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
    const fun = _padFn[direction as 'left' | 'right'];
    return fun(str, padString);
};

// NOTE: If we want to extract the object name from these keys, we will need
// to use a similar method to _getKeyAndUploadIdFromMpuKey since the object
// name may have instances of the splitter used to delimit arguments
export const getMpuSummaryKey = (objectName: string, uploadId: string) =>
    `${objectName}${splitter}${uploadId}`;

export const getBlockId = (
    uploadId: string,
    partNumber: number,
    subPartIndex: number,
) => {
    const paddedPartNumber = padString(partNumber, 'partNumber');
    const paddedSubPart = padString(subPartIndex, 'subPart');
    const blockId = `${uploadId}${splitter}partNumber${paddedPartNumber}` +
        `${splitter}subPart${paddedSubPart}${splitter}`;
    return padString(blockId, 'part');
};

export const getSummaryPartId = (partNumber: number, eTag: string, size: number) => {
    const paddedPartNumber = padString(partNumber, 'partNumber');
    const timestamp = Date.now();
    const summaryKey = `${paddedPartNumber}${splitter}${timestamp}` +
        `${splitter}${eTag}${splitter}${size}${splitter}`;
    return padString(summaryKey, 'part');
};

export const getSubPartInfo = (dataContentLength: number) => {
    const numberFullSubParts =
        Math.floor(dataContentLength / maxSubPartSize);
    const remainder = dataContentLength % maxSubPartSize;
    const numberSubParts = remainder ?
        numberFullSubParts + 1 : numberFullSubParts;
    const lastPartSize = remainder || maxSubPartSize;
    return {
        expectedNumberSubParts: numberSubParts,
        lastPartIndex: numberSubParts - 1,
        lastPartSize,
    };
};

export const getSubPartSize = (
    subPartInfo: { lastPartIndex: number; lastPartSize: number },
    subPartIndex: number,
) => {
    const { lastPartIndex, lastPartSize } = subPartInfo;
    return subPartIndex === lastPartIndex ? lastPartSize : maxSubPartSize;
};

export const getSubPartIds = (
    part: { numberSubParts: number; partNumber: number },
    uploadId: string,
) => [...Array(part.numberSubParts).keys()].map(subPartIndex =>
        getBlockId(uploadId, part.partNumber, subPartIndex));

// TODO Better type this
export const putSinglePart = (
    errorWrapperFn: (first: string, second: string, third: any, log: any, cb: any) => void,
    request: any,
    params: {
        bucketName: string;
        partNumber: number;
        size: number;
        objectKey: string;
        contentMD5: string;
        uploadId: string;
    },
    dataStoreName: string,
    log: RequestLogger,
    cb: any,
) => {
    const { bucketName, partNumber, size, objectKey, contentMD5, uploadId }
        = params;
    const blockId = getBlockId(uploadId, partNumber, 0);
    const passThrough = new stream.PassThrough();
    const options = contentMD5
        ? { useTransactionalMD5: true, transactionalContentMD5: contentMD5 }
        : {};
    request.pipe(passThrough);
    return errorWrapperFn('uploadPart', 'createBlockFromStream',
        [blockId, bucketName, objectKey, passThrough, size, options,
            (err: any | null, result: any) => {
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
                        `Error returned from Azure: ${err.message}`),
                    );
                }
                const md5 = result.headers['content-md5'] || '';
                const eTag = objectUtils.getHexMD5(md5);
                return cb(null, eTag, size);
            }], log, cb);
};

// TODO type this
export const putNextSubPart = (
    errorWrapperFn: any,
    partParams: {
        uploadId: string;
        partNumber: number;
        bucketName: string;
        objectKey: string;
    },
    subPartInfo: { lastPartIndex: number; lastPartSize: number },
    subPartStream: any,
    subPartIndex: number,
    resultsCollector: ResultsCollector,
    log: RequestLogger,
    cb: any,
) => {
    const { uploadId, partNumber, bucketName, objectKey } = partParams;
    const subPartSize = getSubPartSize(
        subPartInfo, subPartIndex);
    const subPartId = getBlockId(uploadId, partNumber,
        subPartIndex);
    resultsCollector.pushOp();
    errorWrapperFn('uploadPart', 'createBlockFromStream',
        [subPartId, bucketName, objectKey, subPartStream, subPartSize,
            {}, err => resultsCollector.pushResult(err, subPartIndex)], log, cb);
};

export const putSubParts = (
    errorWrapperFn: any,
    request: any,
    params: {
        uploadId: string;
        partNumber: number;
        bucketName: string;
        objectKey: string;
        size: number;
    },
    dataStoreName: string,
    log: RequestLogger,
    cb: any,
) => {
    const subPartInfo = getSubPartInfo(params.size);
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
        // check if we have streamed more parts than calculated; should not
        // occur, but do a sanity assertion to detect any coding logic error
        assert.strictEqual(numberSubParts, subPartInfo.expectedNumberSubParts,
            `Fatal error: streamed ${numberSubParts} subparts but ` +
            `expected ${subPartInfo.expectedNumberSubParts} subparts`);
        const totalLength = streamInterface.getTotalBytesStreamed();
        log.trace('successfully put subparts to Azure',
            { numberSubParts, totalLength });
        hashedStream.on('hashed', () => cb(null, hashedStream.completedHash,
            totalLength));

        // in case the hashed event was already emitted before the
        // event handler was registered:
        if (hashedStream.completedHash) {
            hashedStream.removeAllListeners('hashed');
            return cb(null, hashedStream.completedHash, totalLength);
        }
        return undefined;
    });

    const currentStream = streamInterface.getCurrentStream();
    // start first put to Azure before we start streaming the data
    putNextSubPart(errorWrapperFn, params, subPartInfo,
        currentStream, 0, resultsCollector, log, cb);

    request.pipe(hashedStream);
    hashedStream.on('end', () => {
        resultsCollector.enableComplete();
        streamInterface.endStreaming();
    });
    hashedStream.on('data', data => {
        const currentLength = streamInterface.getLengthCounter();
        if (currentLength + data.length > maxSubPartSize) {
            const bytesToMaxSize = maxSubPartSize - currentLength;
            const firstChunk = bytesToMaxSize === 0 ? data :
                data.slice(bytesToMaxSize);
            if (bytesToMaxSize !== 0) {
                // if we have not streamed full subpart, write enough of the
                // data chunk to stream the correct length
                streamInterface.write(data.slice(0, bytesToMaxSize));
            }
            const { nextStream, subPartIndex } =
                streamInterface.transitionToNextStream();
            putNextSubPart(errorWrapperFn, params, subPartInfo,
                nextStream, subPartIndex, resultsCollector, log, cb);
            streamInterface.write(firstChunk);
        } else {
            streamInterface.write(data);
        }
    });
};
