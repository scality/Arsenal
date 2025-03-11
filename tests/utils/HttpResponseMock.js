const http = require('http');
const { EventEmitter } = require('events');
const { Writable } = require('stream');

/**
 * Basic response mock to catch response values.
 *
 * CAUTION: not all methods and fields are implemented.
 *
 * @see https://nodejs.org/api/http.html#class-httpserverresponse
 */
class HttpResponseMock extends Writable {
    constructor() {
        super();
        EventEmitter.call(this);
        this.statusCode = null;
        this.statusMessage = null;
        this._headers = {};
        this._body = null;
        this.writable = true;
        this.destroyed = false;
    }

    setHeader(key, val) {
        this._headers[key] = val;
    }

    end(data, encoding, callback) {
        if (!this.writable) {
            if (typeof data === 'function') data();
            return;
        }

        if (data && typeof data !== 'function') {
            this.write(data, encoding, () => {
                this._finalize(callback);
            });
        } else {
            this._finalize(callback || (typeof data === 'function' ? data : null));
        }
    }

    writeHead(statusCode, statusMessage, headers) {
        this.statusCode = statusCode;
        this.statusMessage = http.STATUS_CODES[statusCode] || statusMessage;
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

    _write(chunk, encoding, callback) {
        if (!this.writable) {
            return callback(new Error('Response is not writable'));
        }
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
        return callback();
    }

    _finalize(callback) {
        this.writable = false;
        this.emit('finish');
        if (callback) {
            callback();
        }
    }

    destroy() {
        this.destroyed = true;
        this.writable = false;
        this.emit('close');
    }
}

module.exports = HttpResponseMock;
