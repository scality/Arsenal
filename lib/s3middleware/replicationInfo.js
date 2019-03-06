const { replicationBackends } = require('../constants');

function _getBackend(objectMD, site) {
    const backends = objectMD ? objectMD.replicationInfo.backends : [];
    const backend = backends.find(o => o.site === site);
    // If the backend already exists, just update the status.
    if (backend) {
        return Object.assign({}, backend, { status: 'PENDING' });
    }
    return {
        site,
        status: 'PENDING',
        dataStoreVersionId: '',
    };
}

function _getStorageClasses(rule, replicationEndpoints) {
    if (rule.storageClass) {
        return rule.storageClass.split(',');
    }
    // If no storage class, use the given default endpoint or the sole endpoint
    if (replicationEndpoints.length > 1) {
        const endPoint =
            replicationEndpoints.find(endpoint => endpoint.default);
        return [endPoint.site];
    }
    return [replicationEndpoints[0].site];
}

/**
 * Get replication information
 * @param {Object} rule - applicable replication rule
 * @param {String} rule.storageClass - comma separated list of storage classes
 * @param {Object} replicationConfig - replication config set on bucket metadata
 * @param {Array} content - replication content
 * @param {String} operationType - type of operation to replicate
 * @param {Object} objectMD - object metadata
 * @param {Object} bucketMD - bucket metadata
 * @param {Object} config - config fields by environment
 * @param {Object} config.locationConstraints - location constraints
 * @param {Array} [config.replicationEndpoints] - replication endpoints used if
 *   no storage classes defined on rule. Used by cloudserver
 * @return {Object} replicationInfo
 */
function getReplicationInfoObject(rule, replicationConfig, content,
    operationType, objectMD, bucketMD, config) {
    const { replicationEndpoints } = config;
    const storageTypes = [];
    const backends = [];
    const storageClasses = _getStorageClasses(rule, replicationEndpoints);
    storageClasses.forEach(storageClass => {
        const storageClassName =
              storageClass.endsWith(':preferred_read') ?
              storageClass.split(':')[0] : storageClass;
        const location = config.locationConstraints[storageClassName];
        if (location && replicationBackends[location.type]) {
            storageTypes.push(location.type);
        }
        backends.push(_getBackend(objectMD, storageClassName));
    });
    if (storageTypes.length > 0 && operationType) {
        content.push(operationType);
    }
    return {
        status: 'PENDING',
        backends,
        content,
        destination: replicationConfig.destination,
        storageClass: storageClasses.join(','),
        role: replicationConfig.role,
        storageType: storageTypes.join(','),
        isNFS: bucketMD.isNFS(),
    };
}

module.exports = { getReplicationInfoObject };
