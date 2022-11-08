export const VersioningConstants = {
    VersionId: {
        Separator: '\0',
    },
    DbPrefixes: {
        Master: '\x7fM',
        Version: '\x7fV',
        Replay: '\x7fR',
    },
    BucketVersioningKeyFormat: {
        current: 'v1',
        v0: 'v0',
        v0mig: 'v0mig',
        v0v1: 'v0v1',
        v1mig: 'v1mig',
        v1: 'v1',
    },
    ExternalNullVersionId: 'null',
};
