/*
    This file contains all unique details about API routes exposed by Backbeats
    API server.
*/

/**
 * The metrics route model.
 * @param {Object} redisKeys - The Redis keys used for Backbeat metrics
 * @param {Array} allSites - The list of replication site names
 * @return {Array} The array of route objects
 */
function routes(redisKeys, allSites) {
    return [
        {
            httpMethod: 'GET',
            category: 'healthcheck',
            type: 'basic',
            method: 'getHealthcheck',
            extensions: {},
        },
        {
            httpMethod: 'GET',
            category: 'metrics',
            type: 'backlog',
            extensions: { crr: [...allSites, 'all'] },
            method: 'getBacklog',
            dataPoints: [redisKeys.ops, redisKeys.opsDone, redisKeys.bytes,
                redisKeys.bytesDone],
        },
        {
            httpMethod: 'GET',
            category: 'metrics',
            type: 'completions',
            extensions: { crr: [...allSites, 'all'] },
            method: 'getCompletions',
            dataPoints: [redisKeys.opsDone, redisKeys.bytesDone],
        },
        {
            httpMethod: 'GET',
            category: 'metrics',
            type: 'throughput',
            extensions: { crr: [...allSites, 'all'] },
            method: 'getThroughput',
            dataPoints: [redisKeys.opsDone, redisKeys.bytesDone],
        },
        {
            httpMethod: 'GET',
            category: 'metrics',
            type: 'all',
            extensions: { crr: [...allSites, 'all'] },
            method: 'getAllMetrics',
            dataPoints: [redisKeys.ops, redisKeys.opsDone, redisKeys.bytes,
                redisKeys.bytesDone],
        },
        {
            httpMethod: 'GET',
            type: 'all',
            extensions: { crr: ['failed'] },
            method: 'getAllFailedCRR',
        },
        {
            httpMethod: 'GET',
            type: 'specific',
            extensions: { crr: ['failed'] },
            method: 'getFailedCRR',
        },
        {
            httpMethod: 'POST',
            type: 'all',
            extensions: { crr: ['failed'] },
            method: 'retryFailedCRR',
        },
        {
            httpMethod: 'GET',
            category: 'monitoring',
            type: 'metrics',
            extensions: {},
            method: 'monitoringHandler',
        },
    ];
}

module.exports = routes;
