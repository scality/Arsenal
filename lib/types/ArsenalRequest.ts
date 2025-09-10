import * as http from 'http';

/**
 * S3-compatible headers interface that restricts header arrays to only cases
 * where AWS S3 actually supports them (mainly x-amz-meta-* headers).
 */
export interface ArsenalRequestHeaders {
    'authorization'?: string;
    'x-amz-date'?: string;
    'x-amz-content-sha256'?: string;
    'x-amz-security-token'?: string;
    'content-md5'?: string;
    'content-length'?: string;
    'content-type'?: string;
    'host'?: string;
    'date'?: string;
    'proxy_path'?: string;
    'access-control-request-method'?: string;
    [key: `x-amz-meta-${string}`]: string | string[] | undefined;
    [key: string]: string | string[] | undefined;
}

/**
 * Extended HTTP request interface for Arsenal with all custom properties
 * that are added throughout the request processing pipeline.
 * 
 * This interface documents all the custom properties that Arsenal adds to
 * the standard Node.js http.IncomingMessage object during request processing.
 * This is for INCOMING requests to the server.
 */
export interface ArsenalRequest extends Omit<http.IncomingMessage, 'headers'> {
    /** S3-compatible headers */
    headers: ArsenalRequestHeaders;

    /** HTTP method */
    method: 'GET' | 'PUT' | 'POST' | 'DELETE' | 'HEAD' | 'OPTIONS';

    /** Parsed query parameters from the URL */
    query: Record<string, string>;

    /** Namespace for the request (typically 'default') */
    namespace: string;

    /** S3 bucket name extracted from URL path or host header */
    bucketName?: string;

    /** S3 object key extracted from URL path */
    objectKey?: string;

    /** Whether bucket name was extracted from host header (virtual hosted style) */
    gotBucketNameFromHost: boolean;

    /** Parsed host information */
    parsedHost: string;

    /** Parsed path from URL */
    path: string;

    /** 
     * Content length parsed from headers.
     */
    parsedContentLength: number;

    /** 
     * POST indicator - set to empty string for POST requests
     * Added in routePOST.ts
     */
    post?: string;

    /** 
     * MD5 hash of request content, parsed and validated
     * Added in routePUT.ts for PUT requests with content-md5 header
     */
    contentMD5?: string;

    /** Current API method being executed (e.g., 'objectPut', 'bucketGet') */
    apiMethod: string;

    /** Array of all API methods that will be executed for this request */
    apiMethods: string[];

    /** Internal response object reference for streaming operations */
    _response?: http.ServerResponse;

    /** Authorization results from permission checks */
    actionImplicitDenies: boolean;

    /** Account quota information from vault */
    accountQuotas?: {
        quota: number;
        account: string;
    };

    /** Bypass user bucket policies for internal operations */
    bypassUserBucketPolicies?: boolean;

    /** Object lock retention days for compliance */
    objectLockRetentionDays?: number;

    /** Array of finalizer functions to run after API completion */
    finalizerHooks: Array<(err: Error | null, done: Function) => void>;

    /** Resource type for backbeat/metadata operations (e.g., 'expiration', 'api') */
    resourceType?: string;

    /** General resource category for metadata operations (e.g., 'buckets', 'raft_sessions') */
    generalResource?: string;

    /** Specific resource identifier (e.g., bucket names, session IDs) */
    specificResource?: string;

    /** Sub-resource for nested operations */
    subResource?: string;

    /** 
     * Virtual hosted bucket name for GCP requests
     * Added in GCP backend processing
     */
    virtualHostedBucket?: string;
}

/**
 * Extended HTTP client request interface for Arsenal.
 * This is for OUTGOING requests made by Arsenal as a client.
 * Extends http.ClientRequest which has setHeader, getHeader, etc.
 */
export interface ArsenalClientRequest extends http.ClientRequest {
    /** Query parameters for the request */
    query?: Record<string, string>;

    /** S3-compatible headers */
    headers: ArsenalRequestHeaders;
}

export default ArsenalRequest;
