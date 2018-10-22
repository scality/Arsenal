/*
    This file contains Backbeat API routes and route details
*/

/**
 * The metrics route model.
 * @param {Object} redisKeys - The Redis keys used for Backbeat metrics
 * @param {Object} locations - Locations by service
 * @param {Array} locations.crr - The list of replication location names
 * @param {Array} locations.ingestion - The list of ingestion location names
 * @return {Array} The array of route objects
 */
function routes(redisKeys, locations) {
    /* eslint-disable no-param-reassign */
    locations.crr = locations.crr || [];
    locations.ingestion = locations.ingestion || [];
    /* eslint-enable no-param-reassign */

    return [
        // Route: /_/healthcheck
        {
            httpMethod: 'GET',
            category: 'healthcheck',
            type: 'basic',
            method: 'getHealthcheck',
            extensions: {},
        },
        // Route: /_/metrics/crr/<location>/pending
        {
            httpMethod: 'GET',
            category: 'metrics',
            type: 'pending',
            extensions: { crr: [...locations.crr, 'all'] },
            method: 'getPending',
            dataPoints: [redisKeys.opsPending, redisKeys.bytesPending],
        },
        // Route: /_/metrics/crr/<location>/backlog
        {
            httpMethod: 'GET',
            category: 'metrics',
            type: 'backlog',
            extensions: { crr: [...locations.crr, 'all'] },
            method: 'getBacklog',
            dataPoints: [redisKeys.opsPending, redisKeys.bytesPending],
        },
        // Route: /_/metrics/crr/<location>/completions
        {
            httpMethod: 'GET',
            category: 'metrics',
            type: 'completions',
            extensions: { crr: [...locations.crr, 'all'] },
            method: 'getCompletions',
            dataPoints: [redisKeys.opsDone, redisKeys.bytesDone],
        },
        // Route: /_/metrics/crr/<location>/failures
        {
            httpMethod: 'GET',
            category: 'metrics',
            type: 'failures',
            extensions: { crr: [...locations.crr, 'all'] },
            method: 'getFailedMetrics',
            dataPoints: [redisKeys.opsFail, redisKeys.bytesFail],
        },
        // Route: /_/metrics/crr/<location>/throughput
        {
            httpMethod: 'GET',
            category: 'metrics',
            type: 'throughput',
            extensions: { crr: [...locations.crr, 'all'] },
            method: 'getThroughput',
            dataPoints: [redisKeys.opsDone, redisKeys.bytesDone],
        },
        // Route: /_/metrics/crr/<location>/all
        {
            httpMethod: 'GET',
            category: 'metrics',
            type: 'all',
            extensions: { crr: [...locations.crr, 'all'] },
            method: 'getAllMetrics',
            dataPoints: [redisKeys.ops, redisKeys.opsDone, redisKeys.opsFail,
                redisKeys.bytes, redisKeys.bytesDone, redisKeys.bytesFail,
                redisKeys.opsPending, redisKeys.bytesPending],
        },
        // Route: /_/metrics/crr/<site>/progress/<bucket>/<key>
        {
            httpMethod: 'GET',
            category: 'metrics',
            type: 'progress',
            level: 'object',
            extensions: { crr: [...locations.crr] },
            method: 'getObjectProgress',
            dataPoints: [redisKeys.objectBytes, redisKeys.objectBytesDone],
        },
        // Route: /_/metrics/crr/<site>/throughput/<bucket>/<key>
        {
            httpMethod: 'GET',
            category: 'metrics',
            type: 'throughput',
            level: 'object',
            extensions: { crr: [...locations.crr] },
            method: 'getObjectThroughput',
            dataPoints: [redisKeys.objectBytesDone],
        },
        // Route: /_/crr/failed?site=<site>&marker=<marker>
        {
            httpMethod: 'GET',
            type: 'all',
            extensions: { crr: ['failed'] },
            method: 'getSiteFailedCRR',
        },
        // Route: /_/crr/failed/<bucket>/<key>/<versionId>
        {
            httpMethod: 'GET',
            type: 'specific',
            extensions: { crr: ['failed'] },
            method: 'getFailedCRR',
        },
        // Route: /_/crr/failed
        {
            httpMethod: 'POST',
            type: 'all',
            extensions: { crr: ['failed'] },
            method: 'retryFailedCRR',
        },
        // Route: /_/monitoring/metrics
        {
            httpMethod: 'GET',
            category: 'monitoring',
            type: 'metrics',
            extensions: {},
            method: 'monitoringHandler',
        },
        // Route: /_/crr/pause/<location>
        // Route: /_/ingestion/pause/<location>
        // Where <location> is an optional field
        {
            httpMethod: 'POST',
            type: 'pause',
            extensions: {
                crr: [...locations.crr, 'all'],
                ingestion: [...locations.ingestion, 'all'],
            },
            method: 'pauseService',
        },
        // Route: /_/crr/resume/<location>
        // Route: /_/ingestion/resume/<location>
        // Route: /_/crr/resume/<location>/schedule
        // Where <location> is an optional field unless "schedule" route
        {
            httpMethod: 'POST',
            type: 'resume',
            extensions: {
                crr: [...locations.crr, 'all'],
                ingestion: [...locations.ingestion, 'all'],
            },
            method: 'resumeService',
        },
        {
            httpMethod: 'DELETE',
            type: 'resume',
            extensions: { crr: [...locations.crr, 'all'] },
            method: 'deleteScheduledResumeService',
        },
        // Route: /_/crr/resume/<location>
        {
            httpMethod: 'GET',
            type: 'resume',
            extensions: { crr: [...locations.crr, 'all'] },
            method: 'getResumeCRRSchedule',
        },
        // Route: /_/crr/status/<location>
        // Route: /_/ingestion/status/<location>
        // Where <location> is an optional field
        {
            httpMethod: 'GET',
            type: 'status',
            extensions: {
                crr: [...locations.crr, 'all'],
                ingestion: [...locations.ingestion, 'all'],
            },
            method: 'getServiceStatus',
        },
    ];
}

module.exports = routes;
