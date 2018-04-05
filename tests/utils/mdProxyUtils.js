'use strict'; // eslint-disable-line strict


class DummyProxyResponse {
    /**
     * Create a new instance of this dummy class
     *
     * This dummy class implements the minimum feature set
     * of the class http.OutgoingMessage suitable for the
     * arsenal.storage.metadata.proxy.BucketdRoutes test
     * without using an actuall http server.
     *
     * @param {function} doneCB - function called once the response is
     *                            ready to be consummed. (err, response, body)
     */
    constructor(doneCB) {
        this.headers = {};
        this.body = null;
        this.endCalled = false;
        this.responseHead = null;
        this.doneCB = doneCB;
    }
    writeHead(statusCode, statusMessage, header) {
        this.responseHead = {
            statusCode,
            statusMessage,
            header,
        };
    }
    write(data) {
        this.body = data;
    }
    end(cb) {
        if (this.endCalled) {
            return;
        }
        this.endCalled = true;
        process.nextTick(() => {
            cb(null);
            this.doneCB(null, this, JSON.parse(this.body));
        });
    }
}

class DummyProxyRequest {
    /**
     * Create a new instance of this dummy class
     *
     * This dummy class implements the minimum feature set
     * of the class http.IncomingMessage suitable for the
     * arsenal.storage.metadata.proxy.BucketdRoutes test
     * without using an actuall http server.
     *
     * @param {object} params - parameter set describing the intended request
     * @param {string} params.method - http method to fake
     * @param {string} params.url - url to fake
     * @param {string} params.body - request body to fake
     * @param {boolean} params.json - if set, assume the body to be a JSON
     *                                value to be serialized
     * @param {object} params.headers - request headers to fake
     */
    constructor(params) {
        this.method = params.method;
        this.url = params.url;
        this.json = params.json;
        this.body = new Buffer(
            this.json ? JSON.stringify(params.body) : (params.body || ''));
        this.headers = params.headers;
        this.socket = {
            remoteAddress: '127.0.0.1',
            remotePort: 32769,
        };
        this.dataConsummed = false;
        this.endCB = null;
    }

    /**
     * bind a callback to a particular event on the request processing
     *
     * @param {string} event - one of 'data', 'end' or 'error'
     * @param {function} callback - a function suitable for the associated event
     * @returns {object} this
     */
    on(event, callback) {
        switch (event) {
        case 'data':
            process.nextTick(() => {
                callback(this.body);
                this.dataConsummed = true;
                if (this.endCB) {
                    this.endCB();
                }
            });
            break;
        case 'end':
            if (!this.dataConsummed) {
                this.endCB = callback;
            } else {
                process.nextTick(() => {
                    callback();
                });
            }
            break;
        case 'error':
            // never happen with this mockup class
            break;
        default:
            process.nextTick(() => callback(new Error(
                `Unsupported DummyProxyRequest.on event '${event}'`)));
        }
        return this;
    }
}

class RequestDispatcher {
    /**
     * Construct a new RequestDispatcher object.
     *
     * This class connects the provided Routes class to a dummy interface
     * that enables tests to perform requests without using an actual http
     * server.
     *
     * @param {object} routes - an instance of a Routes dispatcher class
     */
    constructor(routes) {
        this.routes = routes;
    }

    /**
     * fake a POST request on the associated Routes dispatcher
     *
     * @param {string} path - the path of the object to be posted
     * @param {object} objectMD - the metadata to post for this object
     * @param {function} callback - called once the request has been processed
     *                              with these parameters (err)
     * @returns {undefined}
     */
    post(path, objectMD, callback) {
        this.routes.dispatch(new DummyProxyRequest({
            method: 'POST',
            url: path,
            json: true,
            body: objectMD,
            headers: {},
        }), new DummyProxyResponse(callback));
    }

    /**
     * fake a GET request on the associated Routes dispatcher
     *
     * @param {string} path - the path of the object to be retrieved
     * @param {function} callback - called once the request has been processed
     *                              with these parameters (err, response, body)
     * @returns {undefined}
     */
    get(path, callback) {
        this.routes.dispatch(new DummyProxyRequest({
            method: 'GET',
            url: path,
            json: true,
            body: '',
            headers: {},
        }), new DummyProxyResponse(callback));
    }

    /**
     * fake a DELETE request on the associated Routes dispatcher
     *
     * @param {string} path - the path of the object to be deleted
     * @param {function} callback - called once the request has been processed
     *                              with these parameters (err)
     * @returns {undefined}
     */
    delete(path, callback) {
        this.routes.dispatch(new DummyProxyRequest({
            method: 'DELETE',
            url: path,
            json: true,
            body: '',
            headers: {},
        }), new DummyProxyResponse(callback));
    }
}

module.exports = { RequestDispatcher };
