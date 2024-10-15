/* eslint-disable @typescript-eslint/no-require-imports */

const async = require('async');
const werelogs = require('werelogs');
const constants = require('../../../constants');

/* eslint-disable camelcase */
const backendHealth = {
    aws_s3: {
        response: undefined,
        time: 0,
    },
    azure: {
        response: undefined,
        time: 0,
    },
    gcp: {
        response: undefined,
        time: 0,
    },
};
/* eslint-enable camelcase */

const logger = new werelogs.Logger('MultipleBackendGateway');

const utils = {
    createLogger(reqUids) {
        return reqUids ?
            logger.newRequestLoggerFromSerializedUids(reqUids) :
            logger.newRequestLogger();
    },
    logHelper(log, level, description, error, dataStoreName, backendType) {
        const { message, name, requestId, extendedRequestId } = error;
        log[level](description, {
            error: message,
            errorName: name,
            dataStoreName,
            backendType,
            extRequestId: requestId,
            extExtendedRequestId: extendedRequestId,
        });
    },
    // take off the 'x-amz-meta-'
    trimXMetaPrefix(obj) {
        const newObj = {};
        const metaObj = obj || {};
        Object.keys(metaObj).forEach(key => {
            const newKey = key.substring(11);
            newObj[newKey] = metaObj[key];
        });
        return newObj;
    },
    removeQuotes(word) {
        return word.slice(1, -1);
    },
    skipMpuPartProcessing(completeObjData) {
        const backendType = completeObjData.dataStoreType;
        if (constants.mpuMDStoredExternallyBackend[backendType]) {
            return true;
        }
        return false;
    },

    /**
     * checkAzureBackendMatch - checks that the external backend location for
     * two data objects is the same and is Azure
     * @param {array} objectDataOne - data of first object to compare
     * @param {object} objectDataTwo - data of second object to compare
     * @return {boolean} - true if both data backends are Azure, false if not
     */
    checkAzureBackendMatch(objectDataOne, objectDataTwo) {
        if (objectDataOne.dataStoreType === 'azure' &&
        objectDataTwo.dataStoreType === 'azure') {
            return true;
        }
        return false;
    },

    /**
     * externalBackendCopy - Server side copy should only be allowed:
     * 1) if source object and destination object are both on aws, both
     * on azure, or both on gcp
     * 2) if azure to azure, must be the same storage account since Azure
     * copy outside of an account is async
     * 3) if the source bucket is not an encrypted bucket and the
     * destination bucket is not an encrypted bucket (unless the copy
     * is all within the same bucket).
     * @param {object} config - CloudServer config
     * @param {string} locationConstraintSrc - location constraint of the source
     * @param {string} locationConstraintDest - location constraint of the
     * destination
     * @param {object} sourceBucketMD - metadata of the source bucket
     * @param {object} destBucketMD - metadata of the destination bucket
     * @return {boolean} - true if copying object from one
     * externalbackend to the same external backend and for Azure if it is the
     * same account since Azure copy outside of an account is async
     */
    externalBackendCopy(config, locationConstraintSrc, locationConstraintDest,
        sourceBucketMD, destBucketMD) {
        const sourceBucketName = sourceBucketMD.getName();
        const destBucketName = destBucketMD.getName();
        const isSameBucket = sourceBucketName === destBucketName;
        const bucketsNotEncrypted = destBucketMD.getServerSideEncryption()
            === sourceBucketMD.getServerSideEncryption() &&
            sourceBucketMD.getServerSideEncryption() === null;
        const sourceLocationConstraintType =
            config.getLocationConstraintType(locationConstraintSrc);
        const locationTypeMatch =
            config.getLocationConstraintType(locationConstraintSrc) ===
            config.getLocationConstraintType(locationConstraintDest);
        return locationTypeMatch && (isSameBucket || bucketsNotEncrypted) &&
            (sourceLocationConstraintType === 'aws_s3' ||
            sourceLocationConstraintType === 'gcp' ||
            (sourceLocationConstraintType === 'azure' &&
            config.isSameAzureAccount(locationConstraintSrc,
                locationConstraintDest)));
    },

    checkExternalBackend(clients, locations, type, flightCheckOnStartUp,
        externalBackendHealthCheckInterval, cb) {
        const checkStatus = backendHealth[type] || {};
        if (locations.length === 0) {
            return process.nextTick(cb, null, []);
        }
        if (!flightCheckOnStartUp && checkStatus.response &&
        Date.now() - checkStatus.time < externalBackendHealthCheckInterval) {
            return process.nextTick(cb, null, checkStatus.response);
        }
        let locationsToCheck;
        if (flightCheckOnStartUp) {
            // check all locations if flight check on start up
            locationsToCheck = locations;
        } else {
            const randomLocation = locations[Math.floor(Math.random() *
                locations.length)];
            locationsToCheck = [randomLocation];
        }
        return async.mapLimit(locationsToCheck, 5, (location, next) => {
            const client = clients[location];
            client.healthcheck(location, next, flightCheckOnStartUp);
        }, (err, results) => {
            if (err) {
                return cb(err);
            }
            if (!flightCheckOnStartUp) {
                checkStatus.response = results;
                checkStatus.time = Date.now();
            }
            return cb(null, results);
        });
    },
    translateAzureMetaHeaders(metaHeaders, tags) {
        const translatedMetaHeaders = {};
        if (tags) {
            // tags are passed as string of format 'key1=value1&key2=value2'
            const tagObj = {};
            const tagArr = tags.split('&');
            tagArr.forEach(keypair => {
                const equalIndex = keypair.indexOf('=');
                const key = keypair.substring(0, equalIndex);
                tagObj[key] = keypair.substring(equalIndex + 1);
            });
            translatedMetaHeaders.tags = JSON.stringify(tagObj);
        }
        if (metaHeaders) {
            Object.keys(metaHeaders).forEach(headerName => {
                const translated = headerName.substring(11).replace(/-/g, '_');
                translatedMetaHeaders[translated] = metaHeaders[headerName];
            });
        }
        return translatedMetaHeaders;
    },
    /**
     * proxyCompareUrl - compares request endpoint to urls in NO_PROXY env var
     * @param {string} endpoint - url of request
     * @return {bool} true if request endpoint matches no proxy, false if not
     */
    proxyCompareUrl(endpoint) {
        const noProxy = process.env.NO_PROXY || process.env.no_proxy;
        if (!noProxy) {
            return false;
        }
        // noProxy env var is a comma separated list of urls not to proxy
        const noProxyList = noProxy.split(',');
        if (noProxyList.includes(endpoint)) {
            return true;
        }
        const epArr = endpoint.split('.');
        // reverse array to make comparison easier
        epArr.reverse();
        let match = false;
        for (let j = 0; j < noProxyList.length; j++) {
            const urlArr = noProxyList[j].split('.');
            urlArr.reverse();
            for (let i = 0; i < epArr.length; i++) {
                if (epArr[i] === urlArr[i]) {
                    match = true;
                } else if (urlArr[i] === '*' && i === (urlArr.length - 1)) {
                    // if first char of url is '*', remaining endpoint matches
                    match = true;
                    break;
                } else if (urlArr[i] === '' && i === (urlArr.length - 1)) {
                    // if first char of url is '.', it is treated as wildcard
                    match = true;
                    break;
                } else if (urlArr[i] === '*') {
                    match = true;
                } else if (epArr[i] !== urlArr[i]) {
                    match = false;
                    break;
                }
            }
            // if endpoint matches noProxy element, stop checking
            if (match) {
                break;
            }
        }
        // if endpoint matches, request should not be proxied
        if (match) {
            return true;
        }
        return false;
    },
};

module.exports = utils;
