const async = require('async');

const errors = require('../../lib/errors');
const RedisClient = require('../../lib/metrics/RedisClient');
const StatsModel = require('../../lib/metrics/StatsModel');
const INTERVAL = 300; // 5 minutes
const EXPIRY = 86400; // 24 hours
const THROUGHPUT_EXPIRY = 900; // 15 minutes
const isTest = process.env.CI === 'true';

class Metrics {
    constructor(config, logger) {
        const { redisConfig, validSites, internalStart } = config;
        this._logger = logger;
        this._redisClient = new RedisClient(redisConfig, this._logger);
        // Redis expiry increased by an additional interval so we can reference
        // the immediate older data for average throughput calculation
        this._statsClient = new StatsModel(this._redisClient, INTERVAL, EXPIRY);
        this._validSites = validSites;
        this._internalStart = internalStart;
    }

    /**
     * Query StatsClient for all ops given
     * @param {array} ops - array of redis key names to query
     * @param {string} site - site name or '*' wildcard
     * @param {string} bucketName - the name of the bucket
     * @param {string} objectKey - the object key name
     * @param {string} versionId - the object version ID
     * @param {function} cb - callback(err, res)
     * @return {undefined}
     */
    _queryStats(ops, site, bucketName, objectKey, versionId, cb) {
        return async.map(ops, (op, done) => {
            const hasGlobalKey = this._hasGlobalKey(op);
            if (site === 'all') {
                const queryString = hasGlobalKey ? `*:${op}` : `*:${op}:*`;
                return this._redisClient.scan(queryString, undefined,
                (err, res) => {
                    if (err) {
                        // escalate error to log later
                        return done({
                            message: `Redis error: ${err.message}`,
                            type: errors.InternalError,
                            method: 'Metrics._queryStats',
                        });
                    }
                    if (hasGlobalKey) {
                        return this._statsClient.getAllGlobalStats(res,
                            this._logger, done);
                    }
                    const allKeys = res.map(key => {
                        const arr = key.split(':');
                        // Remove the "requests:<timestamp>" and process
                        return arr.slice(0, arr.length - 2).join(':');
                    });
                    const reducedKeys = [...new Set(allKeys)];

                    return this._statsClient.getAllStats(this._logger,
                        reducedKeys, done);
                });
            }
            // Query only a single given site or storage class
            // First, validate the site or storage class
            if (!this._validSites.includes(site)) {
                // escalate error to log later
                return done({
                    message: 'invalid site name provided',
                    type: errors.RouteNotFound,
                    method: 'Metrics._queryStats',
                });
            }
            let queryString;
            if (bucketName && objectKey && versionId) {
                queryString =
                    `${site}:${bucketName}:${objectKey}:${versionId}:${op}`;
            } else {
                queryString = `${site}:${op}`;
            }
            if (hasGlobalKey) {
                return this._redisClient.get(queryString, (err, res) => {
                    if (err) {
                        return done({
                            message: `Redis error: ${err.message}`,
                            type: errors.InternalError,
                            method: 'Metrics._queryStats',
                        });
                    }
                    return done(null, { requests: [res || 0] });
                });
            }
            return this._statsClient.getStats(this._logger, queryString, done);
        }, cb);
    }

    /**
     * Determines whether the Redis op uses a global counter or interval key.
     * @param {String} op - The Redis operation
     * @return {Boolean} true if a global counter, false otherwise
     */
    _hasGlobalKey(op) {
        if (isTest) {
            return op.includes('test:bb:bytespending') ||
                op.includes('test:bb:opspending');
        }
        return op.includes('bb:crr:bytespending') ||
            op.includes('bb:crr:opspending');
    }

    /**
     * Get data points which are the keys used to query Redis
     * @param {object} details - route details from lib/backbeat/routes.js
     * @param {array} data - provides already fetched data in order of
     *   dataPoints mentioned for each route in lib/backbeat/routes.js. This can
     *   be undefined.
     * @param {function} cb - callback(error, data), where data returns
     *   data stored in Redis.
     * @return {array} dataPoints array defined in lib/backbeat/routes.js
     */
    _getData(details, data, cb) {
        if (!data) {
            const { dataPoints, site, bucketName, objectKey,
                versionId } = details;
            return this._queryStats(dataPoints, site, bucketName, objectKey,
                versionId, cb);
        }
        return cb(null, data);
    }

    /**
     * Uptime of server based on this._internalStart up to max of expiry
     * @param {number} expiry - max expiry
     * @return {number} uptime of server up to expiry time
     */
    _getMaxUptime(expiry) {
        let secondsSinceStart = (Date.now() - this._internalStart) / 1000;
        // allow only a minimum value of 1 for uptime
        if (secondsSinceStart < 1) {
            secondsSinceStart = 1;
        }
        return secondsSinceStart < expiry ? secondsSinceStart : expiry;
    }

    /**
     * Get replication backlog in ops count and size in bytes
     * @param {object} details - route details from lib/backbeat/routes.js
     * @param {function} cb - callback(error, data)
     * @param {array} data - optional field providing already fetched data in
     *   order of dataPoints mentioned for each route in lib/backbeat/routes.js
     * @return {undefined}
     */
    getBacklog(details, cb, data) {
        this._getData(details, data, (err, res) => {
            if (err && err.type) {
                this._logger.error('error getting metric: backlog', {
                    origin: err.method,
                    method: 'Metrics.getBacklog',
                });
                return cb(err.type.customizeDescription(err.message));
            }
            if (err || res.length !== details.dataPoints.length) {
                this._logger.error('error getting metrics: backlog', {
                    method: 'Metrics.getBacklog',
                });
                return cb(errors.InternalError);
            }
            const uptime = this._getMaxUptime(EXPIRY);
            const numOfIntervals = Math.ceil(uptime / INTERVAL);
            const [ops, opsDone, bytes, bytesDone] = res.map(r => (
                r.requests.slice(0, numOfIntervals).reduce((acc, i) =>
                    acc + i, 0)
            ));

            let opsBacklog = ops - opsDone;
            if (opsBacklog < 0) opsBacklog = 0;
            let bytesBacklog = bytes - bytesDone;
            if (bytesBacklog < 0) bytesBacklog = 0;
            const response = {
                backlog: {
                    description: 'Number of incomplete replication ' +
                        'operations (count) and number of incomplete bytes ' +
                        'transferred (size)',
                    results: {
                        count: opsBacklog,
                        size: bytesBacklog,
                    },
                },
            };
            return cb(null, response);
        });
    }

    /**
     * Get completed replicated stats by ops count and size in bytes
     * @param {object} details - route details from lib/backbeat/routes.js
     * @param {function} cb - callback(error, data)
     * @param {array} data - optional field providing already fetched data in
     *   order of dataPoints mentioned for each route in lib/backbeat/routes.js
     * @return {undefined}
     */
    getCompletions(details, cb, data) {
        this._getData(details, data, (err, res) => {
            if (err && err.type) {
                this._logger.error('error getting metric: completions', {
                    origin: err.method,
                    method: 'Metrics.getCompletions',
                });
                return cb(err.type.customizeDescription(err.message));
            }
            if (err || res.length !== details.dataPoints.length) {
                this._logger.error('error getting metrics: completions', {
                    method: 'Metrics.getCompletions',
                });
                return cb(errors.InternalError);
            }
            const uptime = this._getMaxUptime(EXPIRY);
            const numOfIntervals = Math.ceil(uptime / INTERVAL);
            const [opsDone, bytesDone] = res.map(r => (
                r.requests.slice(0, numOfIntervals).reduce((acc, i) =>
                    acc + i, 0)
            ));

            const response = {
                completions: {
                    description: 'Number of completed replication operations ' +
                        '(count) and number of bytes transferred (size) in ' +
                        `the last ${Math.floor(uptime)} seconds`,
                    results: {
                        count: opsDone,
                        size: bytesDone,
                    },
                },
            };
            return cb(null, response);
        });
    }

    /**
     * Get failed replication stats by ops count and size in bytes
     * @param {object} details - route details from lib/backbeat/routes.js
     * @param {function} cb - callback(error, data)
     * @param {array} data - optional field providing already fetched data in
     *   order of dataPoints mentioned for each route in lib/backbeat/routes.js
     * @return {undefined}
     */
    getFailedMetrics(details, cb, data) {
        this._getData(details, data, (err, res) => {
            if (err && err.type) {
                this._logger.error('error getting metric: failures', {
                    origin: err.emthod,
                    method: 'Metrics.getFailedMetrics',
                });
                return cb(err.type.customizeDescription(err.message));
            }
            if (err || res.length !== details.dataPoints.length) {
                this._logger.error('error getting metrics: failures', {
                    method: 'Metrics.getFailedMetrics',
                });
                return cb(errors.InternalError);
            }
            const uptime = this._getMaxUptime(EXPIRY);
            const numOfIntervals = Math.ceil(uptime / INTERVAL);
            const [opsFail, bytesFail] = res.map(r => (
                r.requests.slice(0, numOfIntervals).reduce((acc, i) =>
                    acc + i, 0)
            ));

            const response = {
                failures: {
                    description: 'Number of failed replication operations ' +
                        '(count) and bytes (size) in the last ' +
                        `${Math.floor(uptime)} seconds`,
                    results: {
                        count: opsFail,
                        size: bytesFail,
                    },
                },
            };
            return cb(null, response);
        });
    }

    /**
     * Get current throughput in ops/sec and bytes/sec up to max of 15 minutes
     * Throughput is the number of units processed in a given time
     * @param {object} details - route details from lib/backbeat/routes.js
     * @param {function} cb - callback(error, data)
     * @param {array} data - optional field providing already fetched data in
     *   order of dataPoints mentioned for each route in lib/backbeat/routes.js
     * @return {undefined}
     */
    getThroughput(details, cb, data) {
        this._getData(details, data, (err, res) => {
            if (err && err.type) {
                this._logger.error('error getting metric: throughput', {
                    origin: err.method,
                    method: 'Metrics.getThroughput',
                });
                return cb(err.type.customizeDescription(err.message));
            }
            if (err) {
                this._logger.error('error getting metrics: throughput', {
                    method: 'Metrics.getThroughput',
                });
                return cb(errors.InternalError);
            }
            const now = new Date();
            const uptime = this._getMaxUptime(THROUGHPUT_EXPIRY);
            const numOfIntervals = Math.ceil(uptime / INTERVAL);
            const [opsThroughput, bytesThroughput] = res.map(r => {
                let total = r.requests.slice(0, numOfIntervals).reduce(
                    (acc, i) => acc + i, 0);

                // if uptime !== THROUGHPUT_EXPIRY, use internal timer and
                // do not include the extra 4th interval
                if (uptime === THROUGHPUT_EXPIRY) {
                    // all intervals apply, including 4th interval
                    const lastInterval =
                        this._statsClient._normalizeTimestamp(now);
                    // in seconds
                    const diff = (now - lastInterval) / 1000;
                    // Get average for last interval depending on time
                    // surpassed so far for newest interval
                    total += ((INTERVAL - diff) / INTERVAL) *
                        r.requests[numOfIntervals];
                }

                // Divide total by uptime to determine data per second
                return (total / uptime);
            });

            const response = {
                throughput: {
                    description: 'Current throughput for replication ' +
                        'operations in ops/sec (count) and bytes/sec (size) ' +
                        `in the last ${Math.floor(uptime)} seconds`,
                    results: {
                        count: opsThroughput.toFixed(2),
                        size: bytesThroughput.toFixed(2),
                    },
                },
            };
            return cb(null, response);
        });
    }

    /**
     * Get current throughput for an object in bytes/sec. Throughput is the
     * number of bytes transferred in a given time.
     * @param {object} details - route details from lib/api/routes.js
     * @param {function} cb - callback(error, data)
     * @return {undefined}
     */
    getObjectThroughput(details, cb) {
        this._getData(details, undefined, (err, res) => {
            if (err && err.type) {
                this._logger.error('error getting metric: object throughput', {
                    origin: err.method,
                    method: 'Metrics.getObjectThroughput',
                });
                return cb(err.type.customizeDescription(err.message));
            }
            if (err) {
                this._logger.error('error getting metrics: object throughput', {
                    method: 'Metrics.getObjectThroughput',
                    error: err.message,
                });
                return cb(errors.InternalError);
            }
            const now = new Date();
            const uptime = this._getMaxUptime(THROUGHPUT_EXPIRY);
            const numOfIntervals = Math.ceil(uptime / INTERVAL);
            const { requests } = res[0]; // Bytes done
            let total = requests.slice(0, numOfIntervals)
                .reduce((acc, i) => acc + i, 0);
            // if uptime !== THROUGHPUT_EXPIRY, use internal timer
            // and do not include the extra 4th interval
            if (uptime === THROUGHPUT_EXPIRY) {
                // all intervals apply, including 4th interval
                const lastInterval =
                    this._statsClient._normalizeTimestamp(now);
                // in seconds
                const diff = (now - lastInterval) / 1000;
                // Get average for last interval depending on time passed so
                // far for newest interval
                total += ((INTERVAL - diff) / INTERVAL) *
                    requests[numOfIntervals];
            }
            // Divide total by timeDisplay to determine data per second
            const response = {
                description: 'Current throughput for object replication in ' +
                    'bytes/sec (throughput)',
                throughput: (total / uptime).toFixed(2),
            };
            return cb(null, response);
        });
    }

    /**
     * Get CRR progress for an object in bytes. Progress is the percentage of
     * the object that has completed replication.
     * @param {object} details - route details from lib/api/routes.js
     * @param {function} cb - callback(error, data)
     * @return {undefined}
     */
    getObjectProgress(details, cb) {
        this._getData(details, undefined, (err, res) => {
            if (err && err.type) {
                this._logger.error('error getting metric: object progress', {
                    origin: err.method,
                    method: 'Metrics.getObjectProgress',
                });
                return cb(err.type.customizeDescription(err.message));
            }
            if (err || res.length !== details.dataPoints.length) {
                this._logger.error('error getting metrics: object progress', {
                    method: 'Metrics.getObjectProgress',
                    error: err.message,
                });
                return cb(errors.InternalError);
            }
            // Find if time since start is less than EXPIRY time
            const uptime = this._getMaxUptime(EXPIRY);
            const numOfIntervals = Math.ceil(uptime / INTERVAL);
            const [totalBytesToComplete, bytesComplete] = res.map(r => (
                r.requests.slice(0, numOfIntervals).reduce((acc, i) =>
                    acc + i, 0)
            ));
            const ratio = totalBytesToComplete === 0 ? 0 :
                bytesComplete / totalBytesToComplete;
            const percentage = (ratio * 100).toFixed();
            const response = {
                description: 'Number of bytes to be replicated ' +
                    '(pending), number of bytes transferred to the ' +
                    'destination (completed), and percentage of the ' +
                    'object that has completed replication (progress)',
                pending: totalBytesToComplete - bytesComplete,
                completed: bytesComplete,
                progress: `${percentage}%`,
            };
            return cb(null, response);
        });
    }

    /**
     * Get pending replication stats by ops count and size in bytes
     * @param {object} details - route details from lib/backbeat/routes.js
     * @param {function} cb - callback(error, data)
     * @param {array} data - optional field providing already fetched data in
     *   order of dataPoints mentioned for each route in lib/backbeat/routes.js
     * @return {undefined}
     */
    getPending(details, cb, data) {
        this._getData(details, data, (err, res) => {
            if (err && err.type) {
                this._logger.error('error getting metric: pending', {
                    origin: err.method,
                    method: 'Metrics.getPending',
                });
                return cb(err.type.customizeDescription(err.message));
            }
            const { dataPoints } = details;
            if (err || res.length !== dataPoints.length) {
                this._logger.error('error getting metrics: pending', {
                    method: 'Metrics.getPending',
                    error: err,
                    dataPoints,
                    res,
                });
                return cb(errors.InternalError
                    .customizeDescription('error getting metrics: pending'));
            }
            const count = Number.parseInt(res[0].requests, 10);
            const size = Number.parseInt(res[1].requests, 10);
            const response = {
                pending: {
                    description: 'Number of pending replication ' +
                        'operations (count) and bytes (size)',
                    results: {
                        count: count < 0 ? 0 : count,
                        size: size < 0 ? 0 : size,
                    },
                },
            };
            return cb(null, response);
        });
    }

    /**
     * Get all metrics
     * @param {object} details - route details from lib/backbeat/routes.js
     * @param {function} cb = callback(error, data)
     * @param {array} data - optional field providing already fetched data in
     *   order of dataPoints mentioned for each route in lib/backbeat/routes.js
     * @return {undefined}
     */
    getAllMetrics(details, cb, data) {
        this._getData(details, data, (err, res) => {
            if (err && err.type) {
                this._logger.error('error getting metric: all', {
                    origin: err.method,
                    method: 'Metrics.getAllMetrics',
                });
                return cb(err.type.customizeDescription(err.message));
            }
            if (err || res.length !== details.dataPoints.length) {
                this._logger.error('error getting metrics: all', {
                    method: 'Metrics.getAllMetrics',
                });
                return cb(errors.InternalError);
            }
            // res = [ ops, ops_done, ops_fail, bytes, bytes_done, bytes_fail,
            // opsPending, bytesPending ]
            return async.parallel([
                done => this.getBacklog({ dataPoints: new Array(4) }, done,
                    [res[0], res[1], res[3], res[4]]),
                done => this.getCompletions({ dataPoints: new Array(2) }, done,
                    [res[1], res[4]]),
                done => this.getFailedMetrics({ dataPoints: new Array(2) },
                    done, [res[2], res[5]]),
                done => this.getThroughput({ dataPoints: new Array(2) }, done,
                    [res[1], res[4]]),
                done => this.getPending({ dataPoints: new Array(2) }, done,
                    [res[6], res[7]]),
            ], (err, results) => {
                if (err) {
                    this._logger.error('error getting metrics: all', {
                        method: 'Metrics.getAllMetrics',
                    });
                    return cb(errors.InternalError);
                }
                const store = Object.assign({}, ...results);
                return cb(null, store);
            });
        });
    }

    /**
     * Close redis client
     * @param {function} cb - callback(error, data)
     * @return {undefined}
     */
    disconnect(cb) {
        return this._redisClient.disconnect(cb);
    }

    /**
     * Retrieve the list of redis client connectiosn
     * @param {function} cb - callback(error, data)
     * @return {undefined}
     */
    listClients(cb) {
        return this._redisClient.listClients(cb);
    }
}

module.exports = Metrics;
