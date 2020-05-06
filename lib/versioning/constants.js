module.exports.VersioningConstants = {
    VersionId: {
        Separator: '\0',
    },
    DbPrefixes: {
        Master: '\x7fM',
        Version: '\x7fV',
    },
    BucketVersioningKeyFormat: {
        current: 'v0',
        v0: 'v0',
        v0mig: 'v0mig',
        v1mig: 'v1mig',
        v1: 'v1',
    },
};
