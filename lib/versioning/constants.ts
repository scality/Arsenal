export enum BucketVersioningFormat {
    V0 = 'v0',
    V0MIG = 'v0mig',
    V0V1 = 'v0v1',
    V1MIG = 'v1mig',
    V1 = 'v1',
};

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
        current: BucketVersioningFormat.V1,
        v0: BucketVersioningFormat.V0,
        v0mig: BucketVersioningFormat.V0MIG,
        v0v1: BucketVersioningFormat.V0V1,
        v1mig: BucketVersioningFormat.V1MIG,
        v1: BucketVersioningFormat.V1,
    },
    ExternalNullVersionId: 'null', 
};
