import { legacyLocations } from '../constants';
import escapeForXml from '../s3middleware/escapeForXml';

type CloudServerConfig = any;

export default class BackendInfo {
    _config: CloudServerConfig;
    _requestEndpoint: string;
    _objectLocationConstraint?: string;
    _bucketLocationConstraint?: string;
    _legacyLocationConstraint?: string;

    /**
    * Represents the info necessary to evaluate which data backend to use
    * on a data put call.
    * @constructor
    * @param config - CloudServer config containing list of locations
    * @param objectLocationConstraint - location constraint
    * for object based on user meta header
    * @param bucketLocationConstraint - location
    * constraint for bucket based on bucket metadata
    * @param requestEndpoint - endpoint to which request was made
    * @param legacyLocationConstraint - legacy location constraint
    */
    constructor(
        config: CloudServerConfig,
        objectLocationConstraint: string | undefined,
        bucketLocationConstraint: string | undefined,
        requestEndpoint: string,
        legacyLocationConstraint: string | undefined,
    ) {
        this._config = config;
        this._objectLocationConstraint = objectLocationConstraint;
        this._bucketLocationConstraint = bucketLocationConstraint;
        this._requestEndpoint = requestEndpoint;
        this._legacyLocationConstraint = legacyLocationConstraint;
        return this;
    }

    /**
     * validate proposed location constraint against config
     * @param config - CloudServer config
     * @param locationConstraint - value of user
     * metadata location constraint header or bucket location constraint
     * @param log - werelogs logger
     * @return - true if valid, false if not
     */
    static isValidLocationConstraint(
        config: CloudServerConfig,
        locationConstraint: string | undefined,
        log: RequestLogger,
    ) {
        if (!locationConstraint || !(locationConstraint in config.locationConstraints)) {
            log.trace('proposed locationConstraint is invalid',
                { locationConstraint });
            return false;
        }
        return true;
    }

    /**
     * validate that request endpoint is listed in the restEndpoint config
     * @param config - CloudServer config
     * @param requestEndpoint - request endpoint
     * @param log - werelogs logger
     * @return true if present, false if not
     */
    static isRequestEndpointPresent(
        config: CloudServerConfig,
        requestEndpoint: string,
        log: RequestLogger,
    ) {
        if (!(requestEndpoint in config.restEndpoints)) {
            log.trace('requestEndpoint does not match config restEndpoints',
                { requestEndpoint });
            return false;
        }
        return true;
    }

    /**
     * validate that locationConstraint for request Endpoint matches
     * one config locationConstraint
     * @param config - CloudServer config
     * @param requestEndpoint - request endpoint
     * @param log - werelogs logger
     * @return - true if matches, false if not
     */
    static isRequestEndpointValueValid(
        config: CloudServerConfig,
        requestEndpoint: string,
        log: RequestLogger,
    ) {
        const restEndpoint = config.restEndpoints[requestEndpoint];
        if (!(restEndpoint in config.locationConstraints)) {
            log.trace('the default locationConstraint for request' +
                'Endpoint does not match any config locationConstraint',
            { requestEndpoint });
            return false;
        }
        return true;
    }

    /**
     * validate that s3 server is running with a file or memory backend
     * @param config - CloudServer config
     * @param log - werelogs logger
     * @return - true if running with file/mem backend, false if not
     */
    static isMemOrFileBackend(config: CloudServerConfig, log: RequestLogger) {
        if (config.backends.data === 'mem' || config.backends.data === 'file') {
            log.trace('use data backend for the location', {
                dataBackend: config.backends.data,
                method: 'isMemOrFileBackend',
            });
            return true;
        }
        return false;
    }

    /**
     * validate requestEndpoint against config or mem/file data backend
     * - if there is no match for the request endpoint in the config
     * restEndpoints and data backend is set to mem or file we will use this
     * data backend for the location.
     * - if locationConstraint for request Endpoint does not match
     * any config locationConstraint, we will return an error
     * @param config - CloudServer config
     * @param requestEndpoint - request endpoint
     * @param log - werelogs logger
     * @return - true if valid, false if not
     */
    static isValidRequestEndpointOrBackend(
        config: CloudServerConfig,
        requestEndpoint: string,
        log: RequestLogger,
    ) {
        if (!BackendInfo.isRequestEndpointPresent(config, requestEndpoint,
            log)) {
            return BackendInfo.isMemOrFileBackend(config, log);
        }
        return BackendInfo.isRequestEndpointValueValid(config, requestEndpoint,
            log);
    }

    /**
     * validate controlling BackendInfo Parameter
     * @param config - CloudServer config
     * @param objectLocationConstraint - value of user
     * metadata location constraint header
     * @param bucketLocationConstraint - location
     * constraint from bucket metadata
     * @param requestEndpoint - endpoint of request
     * @param log - werelogs logger
     * @return - location constraint validity
     */
    static controllingBackendParam(
        config: CloudServerConfig,
        objectLocationConstraint: string | undefined,
        bucketLocationConstraint: string | null,
        requestEndpoint: string,
        log: RequestLogger,
    ) {
        if (objectLocationConstraint) {
            if (BackendInfo.isValidLocationConstraint(config,
                objectLocationConstraint, log)) {
                log.trace('objectLocationConstraint is valid');
                return { isValid: true };
            }
            log.trace('objectLocationConstraint is invalid');
            return { isValid: false, description: 'Object Location Error - ' +
            `Your object location "${escapeForXml(objectLocationConstraint)}"` +
            'is not  in your location config - Please update.' };
        }
        if (bucketLocationConstraint) {
            if (BackendInfo.isValidLocationConstraint(config,
                bucketLocationConstraint, log)) {
                log.trace('bucketLocationConstraint is valid');
                return { isValid: true };
            }
            log.trace('bucketLocationConstraint is invalid');
            return { isValid: false, description: 'Bucket Location Error - ' +
            `Your bucket location "${escapeForXml(bucketLocationConstraint)}"` +
            ' is not in your location config - Please update.' };
        }
        const legacyLocationConstraint =
        BackendInfo.getLegacyLocationConstraint(config);
        if (legacyLocationConstraint) {
            log.trace('legacy location is valid');
            return { isValid: true, legacyLocationConstraint };
        }
        if (!BackendInfo.isValidRequestEndpointOrBackend(config,
            requestEndpoint, log)) {
            return { isValid: false, description: 'Endpoint Location Error - ' +
            `Your endpoint "${requestEndpoint}" is not in restEndpoints ` +
            'in your config OR the default location constraint for request ' +
            `endpoint "${escapeForXml(requestEndpoint)}" does not ` +
            'match any config locationConstraint - Please update.' };
        }
        if (BackendInfo.isRequestEndpointPresent(config, requestEndpoint,
            log)) {
            return { isValid: true };
        }
        return { isValid: true, defaultedToDataBackend: true };
    }

    /**
    * Return legacyLocationConstraint
    * @param config CloudServer config
    * @return legacyLocationConstraint;
    */
    static getLegacyLocationConstraint(config: CloudServerConfig) {
        return legacyLocations.find(ll => config.locationConstraints[ll]);
    }

    /**
    * Return objectLocationConstraint
    * @return objectLocationConstraint;
    */
    getObjectLocationConstraint() {
        return this._objectLocationConstraint;
    }

    /**
    * Return bucketLocationConstraint
    * @return bucketLocationConstraint;
    */
    getBucketLocationConstraint() {
        return this._bucketLocationConstraint;
    }

    /**
    * Return requestEndpoint
    * @return requestEndpoint;
    */
    getRequestEndpoint() {
        return this._requestEndpoint;
    }

    /**
    * Return locationConstraint that should be used with put request
    * Order of priority is:
    * (1) objectLocationConstraint,
    * (2) bucketLocationConstraint,
    * (3) legacyLocationConstraint,
    * (4) default locationConstraint for requestEndpoint  if requestEndpoint
    *     is listed in restEndpoints in config.json
    * (5) default data backend
    * @return locationConstraint;
    */
    getControllingLocationConstraint(): string {
        const objectLC = this.getObjectLocationConstraint();
        const bucketLC = this.getBucketLocationConstraint();
        const reqEndpoint = this.getRequestEndpoint();
        if (objectLC) {
            return objectLC;
        }
        if (bucketLC) {
            return bucketLC;
        }
        if (this._legacyLocationConstraint) {
            return this._legacyLocationConstraint;
        }
        if (this._config.restEndpoints[reqEndpoint]) {
            return this._config.restEndpoints[reqEndpoint];
        }
        return this._config.backends.data;
    }
}
