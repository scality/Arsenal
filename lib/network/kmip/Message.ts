import assert from 'assert';

function _lookup(decodedTTLV: any[], path: string) {
    const xpath = path.split('/').filter(word => word.length > 0);
    const canonicalPath = xpath.join('/');
    const obj = decodedTTLV;
    let res: any[] = [];
    assert(Array.isArray(obj));
    for (let current = xpath.shift(); current; current = xpath.shift()) {
        for (let i = 0; i < obj.length; ++i) {
            const cell = obj[i];
            if (cell[current]) {
                if (xpath.length === 0) {
                    /* Skip if the search path has not been
                     * completely consumed yet */
                    res.push(cell[current].value);
                } else {
                    const subPath = xpath.join('/');
                    assert(current.length + 1 + subPath.length ===
                           canonicalPath.length);
                    const intermediate =
                          _lookup(cell[current].value, subPath);
                    res = res.concat(intermediate);
                }
            }
        }
    }
    return res;
}

export default class Message {
    content: any[];

    /**
     * Construct a new abstract Message
     * @param content - the content  of the message
     */
    constructor(content: any[]) {
        this.content = content;
    }

    /**
     * Lookup the values corresponding to the provided path
     * @param path - the path in the hierarchy of the values
     *                        of interest
     * @return - an array of the values matching the provided path
     */
    lookup(path: string) {
        return _lookup(this.content, path);
    }
}
