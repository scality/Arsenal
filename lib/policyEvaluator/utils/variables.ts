'use strict'; // eslint-disable-line strict

// FUNCTIONS TO TRANSLATE VARIABLES

// Variables are ONLY used in Resource element and in Condition element
// For Resource Element: variable can appear as the LAST PART of the ARN.
// For Comparison Element: in any condition that involves
// the string operators (StringEquals, StringLike, StringNotLike, etc.)
// or the ARN operators (ArnEquals, ArnLike, etc.).

/**
 * findVariable finds the value of a variable based on the requestContext
 * @param {string} variable - variable name
 * @param {RequestContext} requestContext - info sent with request
 * @return {string} variable value
 */
function findVariable(variable, requestContext) {
    // See http://docs.aws.amazon.com/IAM/latest/UserGuide/
    // reference_policies_variables.html
    const headers = requestContext.getHeaders();
    const query = requestContext.getQuery();
    const requesterInfo = requestContext.getRequesterInfo();

    const map = new Map();
    // aws:CurrentTime can be used for conditions
    // that check the date and time.
    map.set('aws:CurrentTime', new Date().toISOString());
    // aws:EpochTime for use with date/time conditions
    map.set('aws:EpochTime', Date.now());
    // aws:TokenIssueTime is date and time that temp security credentials
    // were issued. can be used with date/time conditions.
    // this key is only available in requests that are signed using
    // temporary security credentials.
    map.set('aws:TokenIssueTime', requestContext.getTokenIssueTime());
    // aws:principaltype states whether the principal is an account,
    // user, federated, or assumed role
    map.set('aws:principaltype', requesterInfo.principaltype);
    // aws:SecureTransport is boolean value that represents whether the
    // request was sent using SSL
    map.set('aws:SecureTransport',
        requestContext.getSslEnabled() ? 'true' : 'false');
    // aws:SourceIp is requester's IP address, for use with IP address
    // conditions
    map.set('aws:SourceIp', requestContext.getRequesterIp());
    // aws:UserAgent is information about the requester's client application
    map.set('aws:UserAgent', headers['user-agent']);
    // aws:userid is unique ID for the current user
    map.set('aws:userid', requesterInfo.userid);
    // aws:username is friendly name of the current user
    map.set('aws:username', requesterInfo.username);
    // ec2:SourceInstanceARN is the Amazon EC2 instance from which the
    // request was made. Present only when the request comes from an Amazon
    // EC2 instance using an IAM role associated with an EC2
    // instance profile. N/A here.
    map.set('ec2:SourceInstanceARN', undefined);
    // s3 - specific:
    // s3:prefix is prefix for listing request
    map.set('s3:prefix', query.prefix);
    // s3:max-keys is max-keys for listing request
    map.set('s3:max-keys', query['max-keys']);
    // s3:x-amz-acl is acl request for bucket or object put request
    map.set('s3:x-amz-acl', query['x-amz-acl']);
    return map.get(variable);
}

/**
 * substituteVariables replaces variable values for variables in the form of
 * ${variablename}
 * @param {string} string potentially containing a variable
 * @param {RequestContext} requestContext - info sent with request
 * @return {string} string with variable values substituted for variables
 */
function substituteVariables(string, requestContext) {
    const arr = string.split('');
    let startOfVariable = arr.indexOf('$');
    while (startOfVariable > -1) {
        if (arr[startOfVariable + 1] !== '{') {
            startOfVariable = arr.indexOf('$', startOfVariable + 1);
            continue;
        }
        const end = arr.indexOf('}', startOfVariable + 1);
        // If there is no end to the variable, we're done looking for
        // substitutions so return
        if (end === -1) {
            return arr.join('');
        }
        const variableContent = arr.slice(startOfVariable + 2, end).join('');
        // If a variable is not one of the known variables or is
        // undefined, leave the original string '${whatever}'.
        // This also means that ${*}, ${?} and ${$} will remain as they are
        // here and will be converted as part of the wildcard transformation
        const value = findVariable(variableContent, requestContext);
        // Length of item being replaced is the variable content plus ${}
        let replacingLength = variableContent.length + 3;
        if (value !== undefined) {
            arr.splice(startOfVariable, replacingLength, value);
            // If we do replace, we are replacing with one array index
            // so use 1 for replacing length in substitutionEnd
            replacingLength = 1;
        }
        const substitutionEnd = startOfVariable + replacingLength;
        startOfVariable = arr.indexOf('$', substitutionEnd);
    }
    return arr.join('');
}

module.exports = substituteVariables;
