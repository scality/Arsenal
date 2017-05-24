'use strict'; // eslint-disable-line strict

const handleWildcardInResource =
    require('./wildcards.js').handleWildcardInResource;
/**
 * Checks whether an ARN from a request matches an ARN in a policy
 * to compare against each portion of the ARN from the request
 * @param {string} policyArn - arn from policy
 * @param {string} requestRelativeId - last part of the arn from the request
 * @param {[string]} requestArnArr - all parts of request arn split on ":"
 * @param {boolean} caseSensitive - whether the comparison should be
 * case sensitive
 * @return {boolean} true if match, false if not
 */
function checkArnMatch(policyArn, requestRelativeId, requestArnArr,
    caseSensitive) {
    let regExofArn = handleWildcardInResource(policyArn);
    regExofArn = caseSensitive ? regExofArn : regExofArn.toLowerCase();
    // The relativeId is the last part of the ARN (for instance, a bucket and
    // object name in S3)
    // Join on ":" in case there were ":" in the relativeID at the end
    // of the arn
    const policyRelativeId = caseSensitive ? regExofArn.slice(5).join(':') :
        regExofArn.slice(5).join(':').toLowerCase();
    const policyRelativeIdRegEx = new RegExp(policyRelativeId);
    // Check to see if the relative-id matches first since most likely
    // to diverge.  If not a match, the resource is not applicable so return
    // false
    if (!policyRelativeIdRegEx.test(requestRelativeId)) {
        return false;
    }
    // Check the other parts of the ARN to make sure they match.  If not,
    // return false.
    for (let j = 0; j < 5; j ++) {
        const segmentRegEx = new RegExp(regExofArn[j]);
        const requestSegment = caseSensitive ? requestArnArr[j] :
            requestArnArr[j].toLowerCase();
        const policyArnArr = policyArn.split(':');
        // We want to allow an empty account ID for utapi service ARNs to not
        // break compatibility.
        if (j === 4 && policyArnArr[2] === 'utapi' && policyArnArr[4] === '') {
            continue;
        } else if (!segmentRegEx.test(requestSegment)) {
            return false;
        }
    }
    // If there were matches on all parts of the ARN, return true
    return true;
}

module.exports = checkArnMatch;
