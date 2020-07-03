module.exports.VersioningConstants = {
    VersionId: {
        Separator: '\0',
    },
    DbPrefixes: {
        V1: '\x7f',
        Master: '\x7fM',
        Version: '\x7fV',
    },
    BucketVersioningKeyFormat: {
        current: 'v1',
        v0: 'v0',
        v0mig: 'v0mig',
        v0v1: 'v0v1',
        v1mig: 'v1mig',
        v1: 'v1',
    },
};
