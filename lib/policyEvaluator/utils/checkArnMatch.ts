import LRUCache from '../../algos/cache/LRUCache';
import { handleWildcards } from './wildcards';
import { policyArnAllowedEmptyAccountId } from '../../constants';

// Compiled matchers are pure functions of the policy arn, so the cache
// needs no invalidation; the LRU cap bounds the cardinality introduced
// by policy-variable substitution (per-request values in the policy arn).
const ARN_MATCHER_CACHE_ENTRIES = 10000;
const arnMatcherCache = new LRUCache(ARN_MATCHER_CACHE_ENTRIES);

// A wildcard-free portion translates to a fully-escaped, anchored regExp,
// so testing it is equivalent to comparing for string equality: keep the
// literal value and skip the regExp construction entirely.
type PortionMatcher = { literal: string } | { regExp: RegExp };

type ArnMatcher = {
    relativeId: PortionMatcher;
    segments: PortionMatcher[];
    skipAccountIdCheck: boolean;
};

// '*' and '?' are AWS wildcards; '${' starts the ${*}/${?}/${$} literal
// escapes that handleWildcards rewrites - all of these need the regExp path.
// Compiled once at module load; no 'g' flag, so test() is stateless.
const WILDCARD_RE = /[*?]|\$\{/;

function hasWildcards(portion: string): boolean {
    return WILDCARD_RE.test(portion);
}

function compileArnMatcher(policyArn: string): ArnMatcher {
    const policyArnArr = policyArn.split(':');
    // The relativeId is the last part of the ARN (for instance, a bucket and
    // object name in S3)
    // Join on ":" in case there were ":" in the relativeID at the end
    // of the arn
    let relativeId: PortionMatcher;
    if (policyArnArr.length === 6 && !hasWildcards(policyArnArr[5])) {
        relativeId = { literal: policyArnArr[5] };
    } else {
        // Translate the joined relative-id as one anchored unit so an embedded
        // ':' (legal in S3 keys) matches; <6-portion ARNs have none, match any.
        const source = policyArnArr.length >= 6 ? handleWildcards(policyArnArr.slice(5).join(':')) : '';
        relativeId = { regExp: new RegExp(source) };
    }
    const segments: PortionMatcher[] = [];
    for (let j = 0; j < 5; j++) {
        const portion = policyArnArr[j];
        segments.push(
            portion !== undefined && !hasWildcards(portion)
                ? { literal: portion }
                : { regExp: new RegExp(portion && handleWildcards(portion)) },
        );
    }
    // We want to allow an empty account ID for utapi and SUR service ARNs to not
    // break compatibility.
    const skipAccountIdCheck = policyArnAllowedEmptyAccountId.includes(policyArnArr[2]) && policyArnArr[4] === '';
    return { relativeId, segments, skipAccountIdCheck };
}

function portionMatches(matcher: PortionMatcher, value: string): boolean {
    return 'literal' in matcher ? matcher.literal === value : matcher.regExp.test(value);
}

/**
 * Checks whether an ARN from a request matches an ARN in a policy
 * to compare against each portion of the ARN from the request.
 * The comparison is case-sensitive, as on AWS.
 * @param policyArn - arn from policy
 * @param requestRelativeId - last part of the arn from the request
 * @param requestArnArr - all parts of request arn split on ":"
 * @return true if match, false if not
 */
export default function checkArnMatch(
    policyArn: string,
    requestRelativeId: string,
    requestArnArr: string[],
): boolean {
    let matcher: ArnMatcher = arnMatcherCache.get(policyArn);
    if (matcher === undefined) {
        matcher = compileArnMatcher(policyArn);
        arnMatcherCache.add(policyArn, matcher);
    }
    // Check to see if the relative-id matches first since most likely
    // to diverge.  If not a match, the resource is not applicable so return
    // false
    if (!portionMatches(matcher.relativeId, requestRelativeId)) {
        return false;
    }
    // Check the other parts of the ARN to make sure they match.  If not,
    // return false.
    for (let j = 0; j < 5; j++) {
        if (j === 4 && matcher.skipAccountIdCheck) {
            continue;
        }
        if (!portionMatches(matcher.segments[j], requestArnArr[j])) {
            return false;
        }
    }
    // If there were matches on all parts of the ARN, return true
    return true;
}
