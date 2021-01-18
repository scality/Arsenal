const url = require('url');
const http = require('http');
const https = require('https');
const HttpProxyAgent = require('http-proxy-agent');
const HttpsProxyAgent = require('https-proxy-agent');

const { proxyCompareUrl } = require('../storage/data/external/utils');

const validVerbs = new Set(['HEAD', 'GET', 'POST', 'PUT', 'DELETE']);
const updateVerbs = new Set(['POST', 'PUT']);

module.exports.request = function request(endpoint, options, callback) {
    if (!endpoint || typeof endpoint === 'function') {
        throw new Error('Missing target endpoint');
    }

    let cb;
    let opts = {};
    if (typeof options === 'function') {
        cb = module.exports.once(options);
    } else if (typeof options === 'object') {
        opts = JSON.parse(JSON.stringify(options)); // deep-copy
        if (typeof callback === 'function') {
            cb = module.exports.once(callback);
        }
    }

    if (typeof cb !== 'function') {
        throw new Error('Missing request callback');
    }

    if (!(endpoint instanceof url.URL || typeof endpoint === 'string')) {
        return cb(new Error(`Invalid URI ${endpoint}`));
    }

    if (!opts.method) {
        opts.method = 'GET';
    } else if (!validVerbs.has(opts.method)) {
        return cb(new Error(`Invalid Method ${opts.method}`));
    }

    let reqParams;
    if (typeof endpoint === 'string') {
        try {
           reqParams = new url.URL(endpoint);
        } catch (error) {
            return cb(error);
        }
    } else {
        reqParams = new url.URL(endpoint.href);
    }
    reqParams.method = opts.method;
    reqParams.headers = createHeaders(opts.headers || {});

    let request;
    if (reqParams.protocol === 'http:') {
        request = http;
        const httpProxy = process.env.HTTP_PROXY || process.env.http_proxy;
        if (!proxyCompareUrl(reqParams.hostname) && httpProxy) {
            reqParams.agent = new HttpProxyAgent(new url.URL(httpProxy));
        }
    } else if (reqParams.protocol === 'https:') {
        request = https;
        const httpsProxy = process.env.HTTPS_PROXY || process.env.https_proxy;
        if (!proxyCompareUrl(reqParams.hostname) && httpsProxy) {
            reqParams.agent = new HttpsProxyAgent(new url.URL(httpsProxy));
        }
    } else {
        return cb(new Error(`Invalid Protocol ${reqParams.protocol}`));
    }

    let data;
    if (opts.body) {
        if (typeof opts.body === 'object') {
            data = JSON.stringify(opts.body);
            if (!reqParams.headers['content-type']) {
                reqParams.headers['content-type'] = 'application/json';
            }
        } else {
            data = opts.body;
        }
        reqParams.headers['content-length'] = Buffer.byteLength(data);
    }

    const req = request.request(reqParams);
    req.on('error', cb);
    req.on('response', res => {
        const rawData  = [];
        res.on('data', chunk => { rawData.push(chunk); });
        res.on('end', () => {
            const data = rawData.join('');
            if (res.statusCode >= 400) {
                return cb(new Error(res.statusMessage), res, data);
            }

            if (opts.json && data) {
                try {
                    const parsed = JSON.parse(data);
                    return cb(null, res, parsed);
                } catch (err) {
                    // invalid json response
                    return cb(err, res, null);
                }
            }
            return cb(null, res, data);
        });
    });
    if (data !== undefined && updateVerbs.has(opts.method)) {
        req.write(data);
    }
    req.end();
    return req;
};
