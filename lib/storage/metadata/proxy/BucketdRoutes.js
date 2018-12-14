'use strict'; // eslint-disable-line strict

const errors = require('../../../errors');
const BucketInfo = require('../../../models/BucketInfo');
const { getURIComponents, getRequestBody, sendResponse } = require('./utils');

class BucketdRoutes {
    /**
     * Create a new Bucketd routes instance
     * This class implements the bucketd Metadata protocol and is used in
     * the Metadata Proxy Server to implement this protocol on top of
     * various metadata backends.
     *
     * Implementation note: the adaptations performed in the methods of
     * the class MetadataWrapper are not required in this context.
     * For this reason, the methods of the `client' instance are directly
     * called from this class, somewhat defeating the encapsulation of the
     * wrapper.
     *
     * @param {Arsenal.storage.metadata.MetadataWrapper} metadataWrapper - to
     *              be used as a translation target for the bucketd protocol.
     * @param {werelogs.Logger} logger -
     */
    constructor(metadataWrapper, logger) {
        this._metadataWrapper = metadataWrapper;
        this._logger = logger;
    }

    // Metadata Wrapper's wrapper

    // `attributes' context methods

    _getBucketAttributes(req, res, bucketName, logger) {
        return this._metadataWrapper.client.getBucketAttributes(
            bucketName, logger, (err, data) => {
                if (err) {
                    logger.error('Failed to get bucket attributes',
                                 { bucket: bucketName, error: err });
                    return sendResponse(req, res, logger, err);
                }
                if (data === undefined) {
                    return sendResponse(req, res, logger,
                                        errors.NoSuchBucket);
                }
                return sendResponse(req, res, logger, null,
                                    BucketInfo.fromObj(data).serialize());
            });
    }

    _putBucketAttributes(req, res, bucketName, data, logger) {
        return this._metadataWrapper.client.putBucketAttributes(
            bucketName, BucketInfo.deSerialize(data), logger, err =>
                sendResponse(req, res, logger, err));
    }

    // `bucket' context methods

    _createBucket(req, res, bucketName, data, logger) {
        return this._metadataWrapper.client.createBucket(
            bucketName, BucketInfo.deSerialize(data), logger, err =>
                sendResponse(req, res, logger, err));
    }

    _deleteBucket(req, res, bucketName, logger) {
        return this._metadataWrapper.client.deleteBucket(
            bucketName, logger, err =>
                sendResponse(req, res, logger, err));
    }

    _putObject(req, res, bucketName, objectName, objectValue, params, logger) {
        let parsedValue;
        try {
            parsedValue = JSON.parse(objectValue);
        } catch (err) {
            logger.error('Malformed JSON value', { value: objectValue });
            return sendResponse(req, res, logger, errors.BadRequest);
        }
        return this._metadataWrapper.client.putObject(
            bucketName, objectName, parsedValue,
            params, logger, (err, data) =>
                sendResponse(req, res, logger, err, data));
    }

    _getObject(req, res, bucketName, objectName, params, logger) {
        return this._metadataWrapper.client.getObject(
            bucketName, objectName, params, logger, (err, data) =>
                sendResponse(req, res, logger, err, data));
    }

    _deleteObject(req, res, bucketName, objectName, params, logger) {
        return this._metadataWrapper.client.deleteObject(
            bucketName, objectName, params, logger, (err, data) =>
                sendResponse(req, res, logger, err, data));
    }

    _listObject(req, res, bucketName, params, logger) {
        const listingParameters = params || {};
        if (listingParameters.listingType === undefined) {
            listingParameters.listingType = 'Delimiter';
        }
        if (listingParameters.maxKeys) {
            listingParameters.maxKeys = Number.parseInt(params.maxKeys, 10);
        }
        return this._metadataWrapper.client.listObject(
            bucketName, listingParameters, logger, (err, data) =>
                sendResponse(req, res, logger, err, data));
    }

    // `admin' context methods

    _checkHealth(req, res, logger) {
        return this._metadataWrapper.checkHealth(logger, (err, resp) => {
            if (err) {
                logger.error('Failed the health check', { error: err, method: "_checkHealth" });
                return sendResponse(req, res, logger, err);
            }
            return sendResponse(req, res, logger, undefined, resp);
        });
    }

    _createRequestLogger(req) {
        const uids = req.headers['x-scal-request-uids'];
        const logger = uids === undefined ?
              this._logger.newRequestLogger() :
              this._logger.newRequestLoggerFromSerializedUids(uids);
        logger.trace('new request', { method: req.method, url: req.url });
        return logger;
    }

    // Internal routes

    /**
     * Handle routes related to operations on bucket attributes
     *
     * @param {http.IncomingMessage} req - request being processed
     * @param {http.OutgoingMessage} res - response associated to the request
     * @param {object} uriComponents -
     * @param {werelogs.Logger} logger -
     * @return {undefined}
     */
    _attributesRoutes(req, res, uriComponents, logger) {
        if (uriComponents.bucketName === undefined) {
            logger.error('Missing bucket name for attributes route',
                         { uriComponents });
            return sendResponse(req, res, logger, errors.BadRequest);
        }
        switch (req.method) {
        case 'GET':
            return this._getBucketAttributes(
                req, res,
                uriComponents.bucketName, logger, (err, attrs) =>
                    sendResponse(req, res, logger, err, attrs));
        case 'POST':
            return getRequestBody(logger, req, (err, body) => {
                if (err) {
                    return sendResponse(req, res, logger, err);
                }
                return this._putBucketAttributes(
                    req, res,
                    uriComponents.bucketName, body, logger, err =>
                        sendResponse(req, res, logger, err));
            });
        default:
            return sendResponse(req, res, logger, errors.RouteNotFound);
        }
    }

    /**
     * Handle routes related to operations on buckets
     *
     * @param {http.IncomingMessage} req - request being processed
     * @param {http.OutgoingMessage} res - response associated to the request
     * @param {object} uriComponents - URI breakdown of the request to process
     * @param {string} uriComponents.namespace - Select the control plane with
     *                                           `_' or the data plane with
     *                                           `default'.
     * @param {string} uriComponents.context - Targets the bucket itself with
     *                                         `attributes' or the content of
     *                                         the bucket with `bucket'.
     * @param {string} uriComponents.bucketName - The name of the bucket
     * @param {string} uriComponents.objectName - the key of the object in the
     *                                            bucket
     * @param {werelogs.Logger} logger -
     * @return {undefined}
     */
    _bucketRoutes(req, res, uriComponents, logger) {
        if (uriComponents.bucketName === undefined) {
            logger.error('Missing bucket name for bucket route',
                         { uriComponents });
            return sendResponse(req, res, logger, errors.BadRequest);
        }
        switch (req.method) {
        case 'GET':
            return this._listObject(req, res,
                                    uriComponents.bucketName,
                                    uriComponents.options,
                                    logger);
        case 'DELETE':
            return this._deleteBucket(req, res,
                                      uriComponents.bucketName, logger);
        case 'POST':
            return getRequestBody(logger, req, (err, body) => {
                if (err) {
                    return sendResponse(req, res, logger, err);
                }
                return this._createBucket(req, res,
                                          uriComponents.bucketName,
                                          body, logger);
            });
        default:
            return sendResponse(req, res, logger, errors.RouteNotFound);
        }
    }

    /**
     * Handle routes related to operations on objects
     *
     * @param {http.IncomingMessage} req - request being processed
     * @param {http.OutgoingMessage} res - response associated to the request
     * @param {object} uriComponents -
     * @param {werelogs.Logger} logger -
     * @return {undefined}
     */
    _objectRoutes(req, res, uriComponents, logger) {
        if (uriComponents.bucketName === undefined) {
            logger.error('Missing bucket name for bucket route',
                         { uriComponents });
            return sendResponse(req, res, logger, errors.BadRequest);
        }
        switch (req.method) {
        case 'GET':
            return this._getObject(req, res,
                                   uriComponents.bucketName,
                                   uriComponents.objectName,
                                   uriComponents.options,
                                   logger);
        case 'DELETE':
            return this._deleteObject(req, res,
                                      uriComponents.bucketName,
                                      uriComponents.objectName,
                                      uriComponents.options,
                                      logger);
        case 'POST':
            return getRequestBody(logger, req, (err, body) =>
                                  this._putObject(req, res,
                                                  uriComponents.bucketName,
                                                  uriComponents.objectName,
                                                  body,
                                                  uriComponents.options,
                                                  logger));
        default:
            return sendResponse(req, res, logger, errors.RouteNotFound);
        }
    }

    /**
     * Handle default routes. e.g. URI starting with /default/
     * (or anything excepted an underscore)
     *
     * @param {http.IncomingMessage} req - request being processed
     * @param {http.OutgoingMessage} res - response associated to the request
     * @param {object} uriComponents -
     * @param {werelogs.Logger} logger -
     * @return {undefined}
     */
    _defaultRoutes(req, res, uriComponents, logger) {
        switch (uriComponents.context) {
        case 'leader':
        case 'informations':
        case 'parallel':
            logger.trace(`${uriComponents.context} operation`);
            return sendResponse(req, res, logger, errors.NotImplemented);
        case 'metadataInformation':
            return sendResponse(req, res, logger, undefined,
                                '{"metadataVersion":2}');
        case 'bucket':
            logger.trace(`${uriComponents.context} operation`);
            if (uriComponents.objectName) {
                return this._objectRoutes(req, res, uriComponents, logger);
            }
            return this._bucketRoutes(req, res, uriComponents, logger);
        case 'attributes':
            logger.trace(`${uriComponents.context} operation`);
            return this._attributesRoutes(req, res, uriComponents, logger);
        default:
            logger.error('invalid URI', { uriComponents });
            return sendResponse(req, res, logger, errors.RouteNotFound);
        }
    }

    /**
     * Handle admin routes. e.g. URI starting with /_/
     *
     * @param {http.IncomingMessage} req - request being processed
     * @param {http.OutgoingMessage} res - response associated to the request
     * @param {object} uriComponents -
     * @param {werelogs.Logger} logger -
     * @return {undefined}
     */
    _adminRoutes(req, res, uriComponents, logger) {
        switch (uriComponents.context) {
        case 'healthcheck':
            return this._checkHealth(req, res, logger);
        default:
            return sendResponse(req, res, logger, errors.NotImplemented);
        }
    }

    // The route dispatching method

    /**
     * dispatch the HTTP request to the appropriate handling function.
     *
     * @param {http.IncomingMessage} req - request being processed
     * @param {http.OutgoingMessage} res - response associated to the request
     * @return {undefined}
     */
    dispatch(req, res) {
        const adminNamespace = '_';
        const logger = this._createRequestLogger(req);
        const uriComponents = getURIComponents(req.url, logger);
        if (!uriComponents) {
            return sendResponse(req, res, logger, errors.BadRequest);
        }
        switch (uriComponents.namespace) {
        case adminNamespace:
            return this._adminRoutes(req, res, uriComponents, logger);
        default: // coincidently matches the `default' literal namespace as well
            return this._defaultRoutes(req, res, uriComponents, logger);
        }
    }
}

module.exports = BucketdRoutes;
