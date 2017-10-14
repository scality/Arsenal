'use strict'; // eslint-disable-line strict


const checkIPinRangeOrMatch = require('../../ipCheck').checkIPinRangeOrMatch;
const handleWildcards = require('./wildcards.js').handleWildcards;
const checkArnMatch = require('./checkArnMatch.js');
const conditions = {};

/**
 * findConditionKey finds the value of a condition key based on requestContext
 * @param {string} key - condition key name
 * @param {RequestContext} requestContext - info sent with request
 * @return {string} condition key value
 */
conditions.findConditionKey = (key, requestContext) => {
    // TODO: Consider combining with findVariable function if no benefit
    // to keeping separate
    const headers = requestContext.getHeaders();
    const query = requestContext.getQuery();
    const requesterInfo = requestContext.getRequesterInfo();

    const map = new Map();
    // Possible AWS Condition keys (http://docs.aws.amazon.com/IAM/latest/
    // UserGuide/reference_policies_elements.html#AvailableKeys)

    // aws:CurrentTime – Used for date/time conditions
    // (see Date Condition Operators).
    map.set('aws:CurrentTime', new Date().toISOString());
    // aws:EpochTime – Used for date/time conditions
    // (see Date Condition Operators).
    map.set('aws:EpochTime', Date.now().toString());
    // aws:TokenIssueTime – Date/time that temporary security
    // credentials were issued (see Date Condition Operators).
    // Only present in requests that are signed using temporary security
    // credentials.
    map.set('aws:TokenIssueTime', requestContext.getTokenIssueTime());
    // aws:MultiFactorAuthPresent – Used to check whether MFA was used
    // (see Boolean Condition Operators).
    // Note: This key is only present if MFA was used. So, the following
    // will not work:
        //     "Condition" :
        //     { "Bool" : { "aws:MultiFactorAuthPresent" : false } }
    // Instead use:
        //     "Condition" :
        //     { "Null" : { "aws:MultiFactorAuthPresent" : true } }
    map.set('aws:MultiFactorAuthPresent',
        requestContext.getMultiFactorAuthPresent());
    // aws:MultiFactorAuthAge – Used to check how many seconds since
    // MFA credentials were issued. If MFA was not used,
    // this key is not present
    map.set('aws:MultiFactorAuthAge', requestContext.getMultiFactorAuthAge());
    // aws:principaltype states whether the principal is an account,
    // user, federated, or assumed role
    // Note: Docs for conditions have "PrincipalType" but simulator
    // and docs for variables have lowercase
    map.set('aws:principaltype', requesterInfo.principaltype);
    // aws:Referer – Used to check who referred the client browser to
    // the address the request is being sent to. Only supported by some
    // services, such as S3. Value comes from the referer header in the
    // HTTPS request made to AWS.
    map.set('aws:referer', headers.referer);
    // aws:SecureTransport – Used to check whether the request was sent
    // using SSL (see Boolean Condition Operators).
    map.set('aws:SecureTransport',
        requestContext.getSslEnabled() ? 'true' : 'false');
    // aws:SourceArn – Used check the source of the request,
    // using the ARN of the source. N/A here.
    map.set('aws:SourceArn', undefined);
    // aws:SourceIp – Used to check the requester's IP address
    // (see IP Address Condition Operators)
    map.set('aws:SourceIp', requestContext.getRequesterIp());
    // aws:SourceVpc – Used to restrict access to a specific
    // AWS Virtual Private Cloud. N/A here.
    map.set('aws:SourceVpc', undefined);
    // aws:SourceVpce – Used to limit access to a specific VPC endpoint
    // N/A here
    map.set('aws:SourceVpce', undefined);
    // aws:UserAgent – Used to check the requester's client app.
    // (see String Condition Operators)
    map.set('aws:UserAgent', headers['user-agent']);
    // aws:userid – Used to check the requester's unique user ID.
    // (see String Condition Operators)
    map.set('aws:userid', requesterInfo.userid);
    // aws:username – Used to check the requester's friendly user name.
    // (see String Condition Operators)
    map.set('aws:username', requesterInfo.username);
    // Possible condition keys for S3:
    // s3:x-amz-acl is acl request for bucket or object put request
    map.set('s3:x-amz-acl', headers['x-amz-acl']);
    // s3:x-amz-grant-PERMISSION (where permission can be:
    // read, write, read-acp, write-acp or full-control)
    // Value is the value of that header (ex. id of grantee)
    map.set('s3:x-amz-grant-read', headers['x-amz-grant-read']);
    map.set('s3:x-amz-grant-write', headers['x-amz-grant-write']);
    map.set('s3:x-amz-grant-read-acp', headers['x-amz-grant-read-acp']);
    map.set('s3:x-amz-grant-write-acp', headers['x-amz-grant-write-acp']);
    map.set('s3:x-amz-grant-full-control', headers['x-amz-grant-full-control']);
    // s3:x-amz-copy-source is x-amz-copy-source header if applicable on
    // a put object
    map.set('s3:x-amz-copy-source', headers['x-amz-copy-source']);
    // s3:x-amz-metadata-directive is x-amz-metadata-directive header if
    // applicable on a put object copy.  Determines whether metadata will
    // be copied from original object or replaced. Values or "COPY" or
    // "REPLACE".  Default is "COPY"
    map.set('s3:x-amz-metadata-directive', headers['metadata-directive']);
    // s3:x-amz-server-side-encryption -- Used to require that object put
    // use server side encryption.  Value is the encryption algo such as
    // "AES256"
    map.set('s3:x-amz-server-side-encryption',
        headers['x-amz-server-side-encryption']);
    // s3:x-amz-storage-class -- x-amz-storage-class header value
    // (STANDARD, etc.)
    map.set('s3:x-amz-storage-class', headers['x-amz-storage-class']);
    // s3:VersionId -- version id of object
    map.set('s3:VersionId', query.versionId);
    // s3:LocationConstraint -- Used to restrict creation of bucket
    // in certain region.  Only applicable for CreateBucket
    map.set('s3:LocationConstraint', requestContext.getLocationConstraint());
    // s3:delimiter is delimiter for listing request
    map.set('s3:delimiter', query.delimiter);
    // s3:max-keys is max-keys for listing request
    map.set('s3:max-keys', query['max-keys']);
    // s3:prefix is prefix for listing request
    map.set('s3:prefix', query.prefix);
    // s3 auth v4 additional condition keys
    // (See http://docs.aws.amazon.com/AmazonS3/latest/API/
    // bucket-policy-s3-sigv4-conditions.html)
    // s3:signatureversion -- Either "AWS" for v2 or
    // "AWS4-HMAC-SHA256" for v4
    map.set('s3:signatureversion', requestContext.getSignatureVersion());
    // s3:authType -- Method of authentication: either "REST-HEADER",
    // "REST-QUERY-STRING" or "POST"
    map.set('s3:authType', requestContext.getAuthType());
    // s3:signatureAge is the length of time, in milliseconds,
    // that a signature is valid in an authenticated request.  So,
    // can use this to limit the age to less than 7 days
    map.set('s3:signatureAge', requestContext.getSignatureAge());
    // s3:x-amz-content-sha256 - Valid value is "UNSIGNED-PAYLOAD"
    // so can use this in a deny policy to deny any requests that do not
    // have a signed payload
    map.set('s3:x-amz-content-sha256', headers['x-amz-content-sha256']);
    // s3:ObjLocationConstraint is the location constraint set for an
    // object on a PUT request using the "x-amz-meta-scal-location-constraint"
    // header
    map.set('s3:ObjLocationConstraint',
        headers['x-amz-meta-scal-location-constraint']);
    map.set('sts:ExternalId', requestContext.getRequesterExternalId());
    map.set('iam:PolicyArn', requestContext.getPolicyArn());
    return map.get(key);
};


// Wildcards are allowed in certain string comparison and arn comparisons
// Permitted in StringLike, StringNotLike, ArnLike and ArnNotLike
// This restriction almost matches up with where variables can be used in
// conditions so converting ${*}, ${?} and ${$} as part of the wildcard
// transformation instead of the variable substitution works
// (except for the StringEquals, StringNotEquals, ArnEquals and
// ArnNotEquals conditions where wildcards
// not allowed but variables are allowed).  For those 4 operators, we switch
// out ${*}, ${?} and ${$} in the convertConditionOperator function.
function convertSpecialChars(string) {
    function characterMap(char) {
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
 * @param {string | array} time - value or values to be converted
 * @return {string | array} converted value or values
 */
function convertToEpochTime(time) {
    function convertSingle(item) {
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
 * @param {string} operator - condition operator
 * Possible Condition Operators:
 * (http://docs.aws.amazon.com/IAM/latest/UserGuide/
 * reference_policies_elements.html)
 * @return {boolean} true if condition passes and false if not
 */
conditions.convertConditionOperator = operator => {
    // Policy Validator checks that the condition operator
    // is only one of these strings so should not have undefined
    // or security issue with object assignment
    const operatorMap = {
        StringEquals: function stringEquals(key, value) {
            return value.some(item => {
                const swtichedOutChars = convertSpecialChars(item);
                return swtichedOutChars === key;
            });
        },
        StringNotEquals: function stringNotEquals(key, value) {
            // eslint-disable-next-line new-cap
            return !operatorMap.StringEquals(key, value);
        },
        StringEqualsIgnoreCase: function stringEqualsIgnoreCase(key, value) {
            const lowerKey = key.toLowerCase();
            return value.some(item => {
                const swtichedOutChars = convertSpecialChars(item);
                return swtichedOutChars.toLowerCase() === lowerKey;
            });
        },
        StringNotEqualsIgnoreCase:
            function stringNotEqualsIgnoreCase(key, value) {
                // eslint-disable-next-line new-cap
                return !operatorMap.StringEqualsIgnoreCase(key, value);
            },
        StringLike: function stringLike(key, value) {
            return value.some(item => {
                const wildItem = handleWildcards(item);
                const wildRegEx = new RegExp(wildItem);
                return wildRegEx.test(key);
            });
        },
        StringNotLike: function stringNotLike(key, value) {
            // eslint-disable-next-line new-cap
            return !operatorMap.StringLike(key, value);
        },
        NumericEquals: function numericEquals(key, value) {
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
        NumericNotEquals: function numericNotEquals(key, value) {
            // eslint-disable-next-line new-cap
            return !operatorMap.NumericEquals(key, value);
        },
        NumericLessThan: function lessThan(key, value) {
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
        NumericLessThanEquals: function lessThanOrEquals(key, value) {
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
        NumericGreaterThan: function greaterThan(key, value) {
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
        NumericGreaterThanEquals: function greaterThanOrEquals(key, value) {
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
        DateEquals: function dateEquals(key, value) {
            const epochKey = convertToEpochTime(key);
            const epochValues = convertToEpochTime(value);
            // eslint-disable-next-line new-cap
            return operatorMap.NumericEquals(epochKey, epochValues);
        },
        DateNotEquals: function dateNotEquals(key, value) {
            const epochKey = convertToEpochTime(key);
            const epochValues = convertToEpochTime(value);
            // eslint-disable-next-line new-cap
            return operatorMap.NumericNotEquals(epochKey, epochValues);
        },
        DateLessThan: function dateLessThan(key, value) {
            const epochKey = convertToEpochTime(key);
            const epochValues = convertToEpochTime(value);
            // eslint-disable-next-line new-cap
            return operatorMap.NumericLessThan(epochKey, epochValues);
        },
        DateLessThanEquals: function dateLessThanEquals(key, value) {
            const epochKey = convertToEpochTime(key);
            const epochValues = convertToEpochTime(value);
            // eslint-disable-next-line new-cap
            return operatorMap.NumericLessThanEquals(epochKey, epochValues);
        },
        DateGreaterThan: function dateGreaterThan(key, value) {
            const epochKey = convertToEpochTime(key);
            const epochValues = convertToEpochTime(value);
            // eslint-disable-next-line new-cap
            return operatorMap.NumericGreaterThan(epochKey, epochValues);
        },
        DateGreaterThanEquals: function dateGreaterThanEquals(key, value) {
            const epochKey = convertToEpochTime(key);
            const epochValues = convertToEpochTime(value);
            // eslint-disable-next-line new-cap
            return operatorMap.NumericGreaterThanEquals(epochKey, epochValues);
        },
        Bool: function bool(key, value) {
            // Tested with policy validator and it just appears to be a string
            // comparison (can send in values other than true or false)
            // eslint-disable-next-line new-cap
            return operatorMap.StringEquals(key, value);
        },
        BinaryEquals: function binaryEquals(key, value) {
            const base64Key = Buffer.from(key, 'utf8').toString('base64');
            return value.some(item => item === base64Key);
        },
        BinaryNotEquals: function binaryNotEquals(key, value) {
            // eslint-disable-next-line new-cap
            return !operatorMap.BinaryEquals(key, value);
        },
        IpAddress: function ipAddress(key, value) {
            return value.some(item => checkIPinRangeOrMatch(item, key));
        },
        NotIpAddress: function notIpAddress(key, value) {
            // eslint-disable-next-line new-cap
            return !operatorMap.IpAddress(key, value);
        },
        // Note that ARN operators are for comparing a source ARN
        // against a given value (such as an EC2 instance) so N/A here.
        ArnEquals: function ArnEquals(key, value) {
            // eslint-disable-next-line new-cap
            return operatorMap.StringEquals(key, value);
        },
        ArnNotEquals: function ArnNotEquals(key, value) {
            // eslint-disable-next-line new-cap
            return !operatorMap.StringEquals(key, value);
        },
        ArnLike: function ArnLike(key, value) {
            // ARN format:
            // arn:partition:service:region:namespace:relative-id
            const requestArnArr = key.split(':');
            // Pull just the relative id because there is no restriction that it
            // does not contain ":"
            const requestRelativeId = requestArnArr.slice(5).join(':');
            return value.some(policyArn => checkArnMatch(policyArn,
                requestRelativeId, requestArnArr, false));
        },
        ArnNotLike: function ArnNotLike(key, value) {
            // eslint-disable-next-line new-cap
            return !operatorMap.ArnLike(key, value);
        },
        Null: function nullOperator(key, value) {
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
};


module.exports = conditions;
