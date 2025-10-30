/**
 * ObjectMD Minification Utility
 * 
 * This module provides utilities to minify ObjectMD metadata for storage efficiency
 * in MongoDB. It reduces field names to shorter keys and removes default values.
 */

import { ObjectMDData } from '../../../models/ObjectMD';

// Feature flag environment variable
const ENABLE_OBJECTMD_MINIFICATION = process.env.ENABLE_OBJECTMD_MINIFICATION === 'true';

/**
 * Mapping between full ObjectMD field names and their minified versions
 */
const FIELD_MAPPING: Record<string, string> = {
    'owner-display-name': 'o',
    'owner-id': 'd',
    'cache-control': 'cc',
    'content-disposition': 'cd',
    'content-language': 'cl',
    'content-encoding': 'ce',
    'creation-time': 'ct',
    'last-modified': 'm',
    'expires': 'ex',
    'content-length': 'l',
    'content-type': 't',
    'content-md5': '5',
    'x-amz-version-id': 'av',
    'x-amz-server-version-id': 'sv',
    'x-amz-restore': 'ar',
    'archive': 'ah',
    'x-amz-storage-class': 'sc',
    'x-amz-server-side-encryption': 'se',
    'x-amz-server-side-encryption-aws-kms-key-id': 'sk',
    'x-amz-server-side-encryption-customer-algorithm': 'sa',
    'x-amz-website-redirect-location': 'wr',
    'x-amz-scal-transition-in-progress': 'tp',
    'x-amz-scal-transition-time': 'tt',
    'azureInfo': 'az',
    'acl': 'a',
    'key': 'k',
    'location': 'lc',
    'isNull': 'n',
    'isNull2': 'n2',
    'nullVersionId': 'nv',
    'nullUploadId': 'nu',
    'isDeleteMarker': 'dm',
    'versionId': 'v',
    'uploadId': 'u',
    'legalHold': 'lh',
    'retentionMode': 'rm',
    'retentionDate': 'rd',
    'tags': 'tg',
    'replicationInfo': 'r',
    'dataStoreName': 'ds',
    'originOp': 'p',
    'microVersionId': 'mv',
    'deleted': 'dl',
    'isPHD': 'ph',
    'bucketOwnerId': 'bo',
    'md-model-version': 'e',
};

/**
 * Reverse mapping for expansion (minified -> full field names)
 */
const REVERSE_FIELD_MAPPING: Record<string, string> = Object.entries(FIELD_MAPPING)
    .reduce((acc, [key, value]) => {
        acc[value] = key;
        return acc;
    }, {} as Record<string, string>);

/**
 * Nested field mappings for complex objects
 */
const NESTED_MAPPINGS = {
    acl: {
        'Canned': 'c',
        'FULL_CONTROL': 'f',
        'WRITE_ACP': 'w',
        'READ': 'r',
        'READ_ACP': 'ra',
    },
    replicationInfo: {
        'status': 's',
        'backends': 'b',
        'content': 'c',
        'destination': 'd',
        'storageClass': 'sc',
        'role': 'r',
        'storageType': 'st',
        'dataStoreVersionId': 'dv',
        'isNFS': 'n',
    },
};

const NESTED_REVERSE_MAPPINGS = {
    a: Object.entries(NESTED_MAPPINGS.acl).reduce((acc, [k, v]) => {
        acc[v] = k;
        return acc;
    }, {} as Record<string, string>),
    r: Object.entries(NESTED_MAPPINGS.replicationInfo).reduce((acc, [k, v]) => {
        acc[v] = k;
        return acc;
    }, {} as Record<string, string>),
};

/**
 * Default values for ObjectMD fields
 */
const DEFAULT_VALUES: Partial<Record<keyof ObjectMDData, any>> = {
    'owner-display-name': '',
    'cache-control': '',
    'content-disposition': '',
    'content-encoding': '',
    'expires': '',
    'content-type': '',
    'x-amz-version-id': 'null',
    'x-amz-server-version-id': '',
    'x-amz-storage-class': 'STANDARD',
    'x-amz-server-side-encryption': '',
    'x-amz-server-side-encryption-aws-kms-key-id': '',
    'x-amz-server-side-encryption-customer-algorithm': '',
    'x-amz-website-redirect-location': '',
    'location': null,
    'isNull': undefined,
    'isNull2': undefined,
    'nullVersionId': undefined,
    'nullUploadId': undefined,
    'isDeleteMarker': undefined,
    'versionId': undefined,
    'uploadId': undefined,
    'tags': {},
    'dataStoreName': '',
    'deleted': undefined,
    'isPHD': undefined,
};

/**
 * Default ACL structure
 */
const DEFAULT_ACL = {
    Canned: 'private',
    FULL_CONTROL: [],
    WRITE_ACP: [],
    READ: [],
    READ_ACP: [],
};

/**
 * Default replication info structure
 */
const DEFAULT_REPLICATION_INFO = {
    status: '',
    backends: [],
    content: [],
    destination: '',
    storageClass: '',
    role: '',
    storageType: '',
    dataStoreVersionId: '',
    isNFS: undefined,
};

/**
 * Check if a value equals the default value for a field
 */
function isDefaultValue(field: string, value: any): boolean {
    if (field === 'acl') {
        return isDefaultACL(value);
    }
    if (field === 'replicationInfo') {
        return isDefaultReplicationInfo(value);
    }
    if (field === 'tags') {
        return !value || (typeof value === 'object' && Object.keys(value).length === 0);
    }
    
    const defaultValue = DEFAULT_VALUES[field];
    if (defaultValue === undefined && value === undefined) {
        return true;
    }
    
    return JSON.stringify(value) === JSON.stringify(defaultValue);
}

/**
 * Check if ACL equals default ACL
 */
function isDefaultACL(acl: any): boolean {
    if (!acl) return true;
    return JSON.stringify(acl) === JSON.stringify(DEFAULT_ACL);
}

/**
 * Check if replication info equals default
 */
function isDefaultReplicationInfo(info: any): boolean {
    if (!info) return true;
    
    // Check if all fields are default
    return info.status === '' &&
           (!info.backends || info.backends.length === 0) &&
           (!info.content || info.content.length === 0) &&
           info.destination === '' &&
           (!info.storageClass || info.storageClass === '') &&
           (!info.role || info.role === '') &&
           (!info.storageType || info.storageType === '') &&
           (!info.dataStoreVersionId || info.dataStoreVersionId === '') &&
           (!info.isNFS || info.isNFS === undefined);
}

/**
 * Minify nested ACL object
 */
function minifyACL(acl: any): any {
    const minified: any = {};
    for (const [key, value] of Object.entries(acl)) {
        const minKey = NESTED_MAPPINGS.acl[key] || key;
        minified[minKey] = value;
    }
    return minified;
}

/**
 * Expand nested ACL object
 */
function expandACL(acl: any): any {
    const expanded: any = {};
    for (const [key, value] of Object.entries(acl)) {
        const fullKey = NESTED_REVERSE_MAPPINGS.a[key] || key;
        expanded[fullKey] = value;
    }
    return expanded;
}

/**
 * Minify nested replication info object
 */
function minifyReplicationInfo(info: any): any {
    const minified: any = {};
    for (const [key, value] of Object.entries(info)) {
        const minKey = NESTED_MAPPINGS.replicationInfo[key] || key;
        minified[minKey] = value;
    }
    return minified;
}

/**
 * Expand nested replication info object
 */
function expandReplicationInfo(info: any): any {
    const expanded: any = {};
    for (const [key, value] of Object.entries(info)) {
        const fullKey = NESTED_REVERSE_MAPPINGS.r[key] || key;
        expanded[fullKey] = value;
    }
    return expanded;
}

/**
 * Minify ObjectMD data by:
 * 1. Removing fields with default values
 * 2. Shortening field names to single/few characters
 * 
 * @param data - The ObjectMD data to minify
 * @returns Minified object
 */
export function minifyObjectMD(data: ObjectMDData): any {
    if (!ENABLE_OBJECTMD_MINIFICATION) {
        return data;
    }

    const minified: any = {};

    for (const [field, value] of Object.entries(data)) {
        // Skip undefined values
        if (value === undefined) {
            continue;
        }

        // Skip default values
        if (isDefaultValue(field, value)) {
            continue;
        }

        // Get minified field name
        const minField = FIELD_MAPPING[field] || field;

        // Handle nested objects
        if (field === 'acl') {
            minified[minField] = minifyACL(value);
        } else if (field === 'replicationInfo') {
            minified[minField] = minifyReplicationInfo(value);
        } else {
            minified[minField] = value;
        }
    }

    return minified;
}

/**
 * Expand minified ObjectMD data back to full format
 * 
 * @param minified - The minified ObjectMD data
 * @returns Expanded ObjectMD data with defaults restored
 */
export function expandObjectMD(minified: any): ObjectMDData {
    if (!ENABLE_OBJECTMD_MINIFICATION) {
        return minified;
    }

    // Start with default values
    const expanded: any = {
        'owner-display-name': '',
        'owner-id': '',
        'cache-control': '',
        'content-disposition': '',
        'content-encoding': '',
        'expires': '',
        'content-length': 0,
        'content-type': '',
        'content-md5': '',
        'content-language': undefined,
        'creation-time': undefined,
        'x-amz-version-id': 'null',
        'x-amz-server-version-id': '',
        'x-amz-storage-class': 'STANDARD',
        'x-amz-server-side-encryption': '',
        'x-amz-server-side-encryption-aws-kms-key-id': '',
        'x-amz-server-side-encryption-customer-algorithm': '',
        'x-amz-website-redirect-location': '',
        'x-amz-scal-transition-in-progress': undefined,
        'acl': { ...DEFAULT_ACL },
        'key': '',
        'location': null,
        'azureInfo': undefined,
        'isNull': undefined,
        'isNull2': undefined,
        'nullVersionId': undefined,
        'nullUploadId': undefined,
        'isDeleteMarker': undefined,
        'versionId': undefined,
        'uploadId': undefined,
        'tags': {},
        'replicationInfo': { ...DEFAULT_REPLICATION_INFO },
        'dataStoreName': '',
        'originOp': '',
        'deleted': undefined,
        'isPHD': undefined,
    };

    // Expand minified fields
    for (const [minField, value] of Object.entries(minified)) {
        // Get full field name
        const fullField = REVERSE_FIELD_MAPPING[minField] || minField;

        // Handle nested objects
        if (minField === 'a') {
            expanded['acl'] = expandACL(value);
        } else if (minField === 'r') {
            expanded['replicationInfo'] = expandReplicationInfo(value);
        } else {
            expanded[fullField] = value;
        }
    }

    return expanded as ObjectMDData;
}

/**
 * Check if minification is enabled
 */
export function isMinificationEnabled(): boolean {
    return ENABLE_OBJECTMD_MINIFICATION;
}

/**
 * Prepare ObjectMD for storage (minify if enabled)
 * Returns an object with either 'v' (minified) or 'value' (full) field
 */
export function prepareForStorage(data: ObjectMDData): { v?: any; value?: any } {
    if (ENABLE_OBJECTMD_MINIFICATION) {
        return { v: minifyObjectMD(data) };
    }
    return { value: data };
}

/**
 * Prepare ObjectMD from storage (expand if needed)
 * Handles both 'v' (minified) and 'value' (full) fields
 */
export function prepareFromStorage(doc: any): ObjectMDData | undefined {
    if (!doc) {
        return undefined;
    }

    // Check if using minified format (v field)
    if (doc.hasOwnProperty('v')) {
        return expandObjectMD(doc.v);
    }
    
    // Fall back to full format (value field)
    if (doc.hasOwnProperty('value')) {
        return doc.value;
    }

    return undefined;
}

/**
 * Get the value field name based on minification setting
 */
export function getValueFieldName(): 'v' | 'value' {
    return ENABLE_OBJECTMD_MINIFICATION ? 'v' : 'value';
}

