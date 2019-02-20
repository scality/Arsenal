'use strict'; // eslint-disable-line

const assert = require('assert');


function _lookup(decodedTTLV, path) {
    const xpath = path.split('/');
    const obj = decodedTTLV;
    let res = [];
    for (let current = xpath.shift(); current; current = xpath.shift()) {
        assert(Array.isArray(obj));
        for (let i = 0; i < obj.length; ++i) {
            const cell = obj[i];
            if (cell[current]) {
                if (xpath.length === 0) {
                    res.push(cell[current].value);
                } else {
                    const intermediate =
                          _lookup(cell[current].value, xpath.join('/'));
                    res = res.concat(intermediate);
                }
            }
        }
    }
    return res;
}

class Message {
    /**
     * Construct a new abstract Message
     * @param {Object} content - the content  of the message
     */
    constructor(content) {
        this.content = content;
    }

    /**
     * Lookup the values corresponding to the provided path
     * @param {String} path - the path in the hierarchy of the values
     *                        of interest
     * @return {Object} - an array of the values matching the provided path
     */
    lookup(path) {
        return _lookup(this.content, path);
    }
}

module.exports = Message;
