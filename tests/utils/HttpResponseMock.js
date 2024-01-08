const http = require('http');

/**
 * Basic response mock to catch response values.
 *
 * CAUTION: not all methods and fields are implemented.
 *
 * @see https://nodejs.org/api/http.html#class-httpserverresponse
 */
class HttpResponseMock {
    constructor() {
        this.statusCode = null;
        this.statusMessage = null;
        this._headers = {};
        this._body = null;
    }

    setHeader(key, val) {
        this._headers[key] = val;
    }

    end(data, encoding, callback) {
        let cb = callback;
        if (!cb && typeof data === 'function') {
            cb = data;
            cb();
        } else {
            this.write(data, encoding, callback);
        }
    }

    write(chunk, encoding, callback) {
        let str = chunk;

        if (Buffer.isBuffer(str)) {
            str = str.toString();
        }
        if (str instanceof Uint8Array) {
            str = new TextDecoder().decode(str);
        }
        if (str) {
            this._body = (this._body || '') + str;
        }

        let cb = callback;
        if (!cb && typeof encoding === 'function') {
            cb = encoding;
        }
        if (cb) cb();
    }

    writeHead(statusCode, statusMessage, headers) {
        this.statusCode = statusCode;
        /** AWS uses old HTTP/1.0 statusMessage for 302 Found */
        this.statusMessage = statusCode === 302 ?
            'Moved Temporarily' : http.STATUS_CODES[statusCode];
        let headersObj = headers;

        if (!headersObj && typeof statusMessage === 'object') {
            headersObj = statusMessage;
        }

        if (!headersObj) return;

        if (Array.isArray(headersObj)) {
            // the even-numbered offsets are key values,
            // and the odd-numbered offsets are the associated values.
            for (let i = 0; i < headersObj.length; i += 2) {
                this._headers[headersObj[i]] = headersObj[i + 1];
            }
        } else {
            Object.assign(this._headers, headersObj);
        }
    }

    on() {}
    once() {}
}

module.exports = HttpResponseMock;
