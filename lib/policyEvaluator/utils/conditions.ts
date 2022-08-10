import { checkIPinRangeOrMatch } from '../../ipCheck';
import { handleWildcards } from './wildcards';
import checkArnMatch from './checkArnMatch';
import { getTagKeys } from './objectTags';
import RequestContext from '../RequestContext';
import ipaddr from 'ipaddr.js';

/**
 * findConditionKey finds the value of a condition key based on requestContext
 * @param key - condition key name
 * @param requestContext - info sent with request
 * @return condition key value
 */
export function findConditionKey(
    key: string,
    requestContext: RequestContext,
): any {
    // TODO: Consider combining with findVariable function if no benefit
    // to keeping separate
    const headers = requestContext.getHeaders();
    const query = requestContext.getQuery();
    const requesterInfo = requestContext.getRequesterInfo();

    // Possible AWS Condition keys (http://docs.aws.amazon.com/IAM/latest/
    // UserGuide/reference_policies_elements.html#AvailableKeys)
    switch (key) {
    // aws:CurrentTime – Used for date/time conditions
    // (see Date Condition Operators).
    case 'aws:CurrentTime': return new Date().toISOString();
    // aws:EpochTime – Used for date/time conditions
    // (see Date Condition Operators).
    case 'aws:EpochTime': return Date.now().toString();
    // aws:TokenIssueTime – Date/time that temporary security
    // credentials were issued (see Date Condition Operators).
    // Only present in requests that are signed using temporary security
    // credentials.
    case 'aws:TokenIssueTime': return requestContext.getTokenIssueTime();
    // aws:MultiFactorAuthPresent – Used to check whether MFA was used
    // (see Boolean Condition Operators).
    // Note: This key is only present if MFA was used. So, the following
    // will not work:
    //     "Condition" :
    //     { "Bool" : { "aws:MultiFactorAuthPresent" : false } }
    // Instead use:
    //     "Condition" :
    //     { "Null" : { "aws:MultiFactorAuthPresent" : true } }
    case 'aws:MultiFactorAuthPresent': return requestContext.getMultiFactorAuthPresent();
    // aws:MultiFactorAuthAge – Used to check how many seconds since
    // MFA credentials were issued. If MFA was not used,
    // this key is not present
    case 'aws:MultiFactorAuthAge': return requestContext.getMultiFactorAuthAge();
    // aws:principaltype states whether the principal is an account,
    // user, federated, or assumed role
    // Note: Docs for conditions have "PrincipalType" but simulator
    // and docs for variables have lowercase
    case 'aws:principaltype': return requesterInfo.principaltype;
    // aws:Referer – Used to check who referred the client browser to
    // the address the request is being sent to. Only supported by some
    // services, such as S3. Value comes from the referer header in the
    // HTTPS request made to AWS.
    case 'aws:referer': return headers.referer;
    // aws:SecureTransport – Used to check whether the request was sent
    // using SSL (see Boolean Condition Operators).
    case 'aws:SecureTransport': return requestContext.getSslEnabled() ? 'true' : 'false';
    // aws:SourceArn – Used check the source of the request,
    // using the ARN of the source. N/A here.
    case 'aws:SourceArn': return undefined;
    // aws:SourceIp – Used to check the requester's IP address
    // (see IP Address Condition Operators)
    case 'aws:SourceIp': return requestContext.getRequesterIp();
    // aws:SourceVpc – Used to restrict access to a specific
    // AWS Virtual Private Cloud. N/A here.
    case 'aws:SourceVpc': return undefined;
    // aws:SourceVpce – Used to limit access to a specific VPC endpoint
    // N/A here
    case 'aws:SourceVpce': return undefined;
    // aws:UserAgent – Used to check the requester's client app.
    // (see String Condition Operators)
    case 'aws:UserAgent': return headers['user-agent'];
    // aws:userid – Used to check the requester's unique user ID.
    // (see String Condition Operators)
    case 'aws:userid': return requesterInfo.userid;
    // aws:username – Used to check the requester's friendly user name.
    // (see String Condition Operators)
    case 'aws:username': return requesterInfo.username;
    // Possible condition keys for S3:
    // s3:x-amz-acl is acl request for bucket or object put request
    case 's3:x-amz-acl': return headers['x-amz-acl'];
    // s3:x-amz-grant-PERMISSION (where permission can be:
    // read, write, read-acp, write-acp or full-control)
    // Value is the value of that header (ex. id of grantee)
    case 's3:x-amz-grant-read': return headers['x-amz-grant-read'];
    case 's3:x-amz-grant-write': return headers['x-amz-grant-write'];
    case 's3:x-amz-grant-read-acp': return headers['x-amz-grant-read-acp'];
    case 's3:x-amz-grant-write-acp': return headers['x-amz-grant-write-acp'];
    case 's3:x-amz-grant-full-control': return headers['x-amz-grant-full-control'];
    // s3:x-amz-copy-source is x-amz-copy-source header if applicable on
    // a put object
    case 's3:x-amz-copy-source': return headers['x-amz-copy-source'];
    // s3:x-amz-metadata-directive is x-amz-metadata-directive header if
    // applicable on a put object copy.  Determines whether metadata will
    // be copied from original object or replaced. Values or "COPY" or
    // "REPLACE".  Default is "COPY"
    case 's3:x-amz-metadata-directive': return headers['metadata-directive'];
    // s3:x-amz-server-side-encryption -- Used to require that object put
    // use server side encryption.  Value is the encryption algo such as
    // "AES256"
    case 's3:x-amz-server-side-encryption': return headers['x-amz-server-side-encryption'];
    // s3:x-amz-storage-class -- x-amz-storage-class header value
    // (STANDARD, etc.)
    case 's3:x-amz-storage-class': return headers['x-amz-storage-class'];
    // s3:VersionId -- version id of object
    case 's3:VersionId': return query.versionId;
    // s3:LocationConstraint -- Used to restrict creation of bucket
    // in certain region.  Only applicable for CreateBucket
    case 's3:LocationConstraint': return requestContext.getLocationConstraint();
    // s3:delimiter is delimiter for listing request
    case 's3:delimiter': return query.delimiter;
    // s3:max-keys is max-keys for listing request
    case 's3:max-keys': return query['max-keys'];
    // s3:prefix is prefix for listing request
    case 's3:prefix': return query.prefix;
    // s3 auth v4 additional condition keys
    // (See http://docs.aws.amazon.com/AmazonS3/latest/API/
    // bucket-policy-s3-sigv4-conditions.html)
    // s3:signatureversion -- Either "AWS" for v2 or
    // "AWS4-HMAC-SHA256" for v4
    case 's3:signatureversion': return requestContext.getSignatureVersion();
    // s3:authType -- Method of authentication: either "REST-HEADER",
    // "REST-QUERY-STRING" or "POST"
    case 's3:authType': return requestContext.getAuthType();
    // s3:signatureAge is the length of time, in milliseconds,
    // that a signature is valid in an authenticated request.  So,
    // can use this to limit the age to less than 7 days
    case 's3:signatureAge': return requestContext.getSignatureAge();
    // s3:x-amz-content-sha256 - Valid value is "UNSIGNED-PAYLOAD"
    // so can use this in a deny policy to deny any requests that do not
    // have a signed payload
    case 's3:x-amz-content-sha256': return headers['x-amz-content-sha256'];
    // s3:ObjLocationConstraint is the location constraint set for an
    // object on a PUT request using the "x-amz-meta-scal-location-constraint"
    // header
    case 's3:ObjLocationConstraint': return headers['x-amz-meta-scal-location-constraint'];
    case 'sts:ExternalId': return requestContext.getRequesterExternalId();
    case 'iam:PolicyArn': return requestContext.getPolicyArn();
    // s3:ExistingObjectTag - Used to check that existing object tag has
    // specific tag key and value. Extraction of correct tag key is done in CloudServer.
    // On first pass of policy evaluation, CloudServer information will not be included,
    // so evaluation should be skipped
    case 's3:ExistingObjectTag':
        return requestContext.getNeedTagEval()
            ? requestContext.getExistingObjTag() : undefined;
    // s3:RequestObjectTag - Used to limit putting object tags to specific
    // tag key and value. N/A here.
    // Requires information from CloudServer
    // On first pass of policy evaluation, CloudServer information will not be included,
    // so evaluation should be skipped
    case 's3:RequestObjectTagKey':
        return requestContext.getNeedTagEval()
            ? requestContext.getRequestObjTags() : undefined;
    // s3:RequestObjectTagKeys - Used to limit putting object tags specific tag keys.
    // Requires information from CloudServer.
    // On first pass of policy evaluation, CloudServer information will not be included,
    // so evaluation should be skipped
    case 's3:RequestObjectTagKeys':
        return requestContext.getNeedTagEval() && requestContext.getRequestObjTags()
            ? getTagKeys(requestContext.getRequestObjTags()!)
            : undefined;
    default:
        return undefined;
    }
}


// Wildcards are allowed in certain string comparison and arn comparisons
// Permitted in StringLike, StringNotLike, ArnLike and ArnNotLike
// This restriction almost matches up with where variables can be used in
// conditions so converting ${*}, ${?} and ${$} as part of the wildcard
// transformation instead of the variable substitution works
// (except for the StringEquals, StringNotEquals, ArnEquals and
// ArnNotEquals conditions where wildcards
// not allowed but variables are allowed).  For those 4 operators, we switch
// out ${*}, ${?} and ${$} in the convertConditionOperator function.
function convertSpecialChars(string: string) {
    function characterMap(char: string) {
        const map = {
            '${*}': '*',
            '${?}': '?',
            '${$}': '$',
        };
        return map[char];
    }
    return string.replace(/(\$\{\*\})|(\$\{\?\})|(\$\{\$\})/g,
        characterMap);
}

/**
 * convertToEpochTime checks whether epoch or ISO time and converts to epoch
 * if necessary
 * @param time - value or values to be converted
 * @return converted value or values
 */
function convertToEpochTime(time: string): string;
function convertToEpochTime(time: string[]): string[];
function convertToEpochTime(time: string | string[]) {
    function convertSingle(item: string) {
        // If ISO time
        if (item.indexOf(':') > -1) {
            return new Date(item).getTime().toString();
        }
        return item;
    }
    if (!Array.isArray(time)) {
        return convertSingle(time);
    }
    return time.map(single => convertSingle(single));
}


/**
 * convertConditionOperator converts a string operator into a function
 * each function takes a string key and array of values as arguments.
 * Variables in the value are handled before calling this function but
 * wildcards and switching ${$}, ${*} and ${?} are handled here because
 * whether wildcards allowed depends on operator
 * @param operator - condition operator
 * Possible Condition Operators:
 * (http://docs.aws.amazon.com/IAM/latest/UserGuide/
 * reference_policies_elements.html)
 * @return true if condition passes and false if not
 */
export function convertConditionOperator(operator: string): boolean {
    // Policy Validator checks that the condition operator
    // is only one of these strings so should not have undefined
    // or security issue with object assignment
    const operatorMap = {
        StringEquals: function stringEquals(key: string, value: string[]) {
            return value.some(item => {
                const swtichedOutChars = convertSpecialChars(item);
                return swtichedOutChars === key;
            });
        },
        StringNotEquals: function stringNotEquals(key: string, value: string[]) {
            // eslint-disable-next-line new-cap
            return !operatorMap.StringEquals(key, value);
        },
        StringEqualsIgnoreCase: function stringEqualsIgnoreCase(key: string, value: string[]) {
            const lowerKey = key.toLowerCase();
            return value.some(item => {
                const swtichedOutChars = convertSpecialChars(item);
                return swtichedOutChars.toLowerCase() === lowerKey;
            });
        },
        StringNotEqualsIgnoreCase:
            function stringNotEqualsIgnoreCase(key: string, value: string[]) {
                // eslint-disable-next-line new-cap
                return !operatorMap.StringEqualsIgnoreCase(key, value);
            },
        StringLike: function stringLike(key: string | string[], value: string[], prefix?: string) {
            function policyValRegex(testKey: string) {
                return value.some(item => {
                    const wildItem = handleWildcards(item);
                    const wildRegEx = new RegExp(wildItem);
                    return wildRegEx.test(testKey);
                });
            }
            if (Array.isArray(key)) {
                if (prefix === 'ForAnyValue') {
                    return key.some(policyValRegex);
                }
                if (prefix === 'ForAllValues') {
                    return key.every(policyValRegex);
                }
            } else {
                return policyValRegex(key);
            }
        },
        StringNotLike: function stringNotLike(key: string, value: string[]) {
            // eslint-disable-next-line new-cap
            return !operatorMap.StringLike(key, value);
        },
        NumericEquals: function numericEquals(key: string, value: string[]) {
            const numberKey = Number.parseInt(key, 10);
            if (Number.isNaN(numberKey)) {
                return false;
            }
            return value.some(item => {
                const numberItem = Number.parseInt(item, 10);
                if (Number.isNaN(numberItem)) {
                    return false;
                }
                return numberKey === numberItem;
            });
        },
        NumericNotEquals: function numericNotEquals(key: string, value: string[]) {
            // eslint-disable-next-line new-cap
            return !operatorMap.NumericEquals(key, value);
        },
        NumericLessThan: function lessThan(key: string, value: string[]) {
            const numberKey = Number.parseInt(key, 10);
            if (Number.isNaN(numberKey)) {
                return false;
            }
            return value.some(item => {
                const numberItem = Number.parseInt(item, 10);
                if (Number.isNaN(numberItem)) {
                    return false;
                }
                return numberKey < numberItem;
            });
        },
        NumericLessThanEquals: function lessThanOrEquals(key: string, value: string[]) {
            const numberKey = Number.parseInt(key, 10);
            if (Number.isNaN(numberKey)) {
                return false;
            }
            return value.some(item => {
                const numberItem = Number.parseInt(item, 10);
                if (Number.isNaN(numberItem)) {
                    return false;
                }
                return numberKey <= numberItem;
            });
        },
        NumericGreaterThan: function greaterThan(key: string, value: string[]) {
            const numberKey = Number.parseInt(key, 10);
            if (Number.isNaN(numberKey)) {
                return false;
            }
            return value.some(item => {
                const numberItem = Number.parseInt(item, 10);
                if (Number.isNaN(numberItem)) {
                    return false;
                }
                return numberKey > numberItem;
            });
        },
        NumericGreaterThanEquals: function greaterThanOrEquals(key: string, value: string[]) {
            const numberKey = Number.parseInt(key, 10);
            if (Number.isNaN(numberKey)) {
                return false;
            }
            return value.some(item => {
                const numberItem = Number.parseInt(item, 10);
                if (Number.isNaN(numberItem)) {
                    return false;
                }
                return numberKey >= numberItem;
            });
        },
        DateEquals: function dateEquals(key: string, value: string[]) {
            const epochKey = convertToEpochTime(key);
            const epochValues = convertToEpochTime(value);
            // eslint-disable-next-line new-cap
            return operatorMap.NumericEquals(epochKey, epochValues);
        },
        DateNotEquals: function dateNotEquals(key: string, value: string[]) {
            const epochKey = convertToEpochTime(key);
            const epochValues = convertToEpochTime(value);
            // eslint-disable-next-line new-cap
            return operatorMap.NumericNotEquals(epochKey, epochValues);
        },
        DateLessThan: function dateLessThan(key: string, value: string[]) {
            const epochKey = convertToEpochTime(key);
            const epochValues = convertToEpochTime(value);
            // eslint-disable-next-line new-cap
            return operatorMap.NumericLessThan(epochKey, epochValues);
        },
        DateLessThanEquals: function dateLessThanEquals(key: string, value: string[]) {
            const epochKey = convertToEpochTime(key);
            const epochValues = convertToEpochTime(value);
            // eslint-disable-next-line new-cap
            return operatorMap.NumericLessThanEquals(epochKey, epochValues);
        },
        DateGreaterThan: function dateGreaterThan(key: string, value: string[]) {
            const epochKey = convertToEpochTime(key);
            const epochValues = convertToEpochTime(value);
            // eslint-disable-next-line new-cap
            return operatorMap.NumericGreaterThan(epochKey, epochValues);
        },
        DateGreaterThanEquals: function dateGreaterThanEquals(key: string, value: string[]) {
            const epochKey = convertToEpochTime(key);
            const epochValues = convertToEpochTime(value);
            // eslint-disable-next-line new-cap
            return operatorMap.NumericGreaterThanEquals(epochKey, epochValues);
        },
        Bool: function bool(key: string, value: string[]) {
            // Tested with policy validator and it just appears to be a string
            // comparison (can send in values other than true or false)
            // eslint-disable-next-line new-cap
            return operatorMap.StringEquals(key, value);
        },
        BinaryEquals: function binaryEquals(key: string, value: string[]) {
            const base64Key = Buffer.from(key, 'utf8').toString('base64');
            return value.some(item => item === base64Key);
        },
        BinaryNotEquals: function binaryNotEquals(key: string, value: string[]) {
            // eslint-disable-next-line new-cap
            return !operatorMap.BinaryEquals(key, value);
        },
        IpAddress: function ipAddress(key: ipaddr.IPv4 | ipaddr.IPv6, value: string[]) {
            return value.some(item => checkIPinRangeOrMatch(item, key));
        },
        NotIpAddress: function notIpAddress(key: ipaddr.IPv4 | ipaddr.IPv6, value: string[]) {
            // eslint-disable-next-line new-cap
            return !operatorMap.IpAddress(key, value);
        },
        // Note that ARN operators are for comparing a source ARN
        // against a given value (such as an EC2 instance) so N/A here.
        ArnEquals: function ArnEquals(key: string, value: string[]) {
            // eslint-disable-next-line new-cap
            return operatorMap.StringEquals(key, value);
        },
        ArnNotEquals: function ArnNotEquals(key: string, value: string[]) {
            // eslint-disable-next-line new-cap
            return !operatorMap.StringEquals(key, value);
        },
        ArnLike: function ArnLike(key: string, value: string[]) {
            // ARN format:
            // arn:partition:service:region:namespace:relative-id
            const requestArnArr = key.split(':');
            // Pull just the relative id because there is no restriction that it
            // does not contain ":"
            const requestRelativeId = requestArnArr.slice(5).join(':');
            return value.some(policyArn => checkArnMatch(policyArn,
                requestRelativeId, requestArnArr, false));
        },
        ArnNotLike: function ArnNotLike(key: string, value: string[]) {
            // eslint-disable-next-line new-cap
            return !operatorMap.ArnLike(key, value);
        },
        Null: function nullOperator(key: string, value: string[]) {
         // Null is used to check if a condition key is present.
         // The policy statement value should be either true (the key doesn't
         // exist — it is null) or false (the key exists and its value is
         // not null).
            if ((key === undefined || key === null)
                && value[0] === 'true' ||
                (key !== undefined && key !== null)
                && value[0] === 'false') {
                return true;
            }
            return false;
        },
    };
    return operatorMap[operator];
}
