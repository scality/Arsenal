module.exports = {
    auth: require('./lib/auth/auth'),
    constants: require('./lib/constants'),
    db: require('./lib/db'),
    errors: require('./lib/errors.js'),
    shuffle: require('./lib/shuffle'),
    stringHash: require('./lib/stringHash'),
    https: {
        ciphers: require('./lib/https/ciphers.js'),
        dhparam: require('./lib/https/dh2048.js'),
    },
    algorithms: {
        list: {
            Basic: require('./lib/algos/list/basic').List,
            Delimiter: require('./lib/algos/list/delimiter').Delimiter,
            DelimiterVersions: require('./lib/algos/list/delimiterVersions')
                .DelimiterVersions,
            DelimiterMaster: require('./lib/algos/list/delimiterMaster')
                .DelimiterMaster,
            MPU: require('./lib/algos/list/MPU').MultipartUploads,
        },
    },
    policies: {
        evaluators: require('./lib/policyEvaluator/evaluator.js'),
        validateUserPolicy: require('./lib/policy/policyValidator')
            .validateUserPolicy,
        RequestContext: require('./lib/policyEvaluator/RequestContext.js'),
    },
    Clustering: require('./lib/Clustering'),
    testing: {
        matrix: require('./lib/testing/matrix.js'),
    },
    versioning: {
        VersioningConstants: require('./lib/versioning/constants.js')
            .VersioningConstants,
        VersioningUtils: require('./lib/versioning/utils.js').VersioningUtils,
    },
    network: {
        http: {
            server: require('./lib/network/webserver'),
        },
    },
};
