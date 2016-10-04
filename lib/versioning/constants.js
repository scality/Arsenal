module.exports.VersioningConstants = {
    SpecialBuckets: [
        'users..bucket',
        'metastore',
        'mpuShadowBucket',
    ],
    VERSIONING_AFFIXES: {
        MASTER_VERSION_PREFIX: 'A|',
        OTHER_VERSION_PREFIX: 'V|',
        SEPARATOR: '|',
    },
    ATTR_VERSION_ID: 'x-scal-version-id',
    ATTR_VERSION_VECTOR: 'x-scal-version-vector',
    ATTR_DELETE_MARKER: 'x-scal-deleted',
    X_AMZ_VERSION_ID: 'x-amz-version-id', // legacy: amz's version attribute
};
