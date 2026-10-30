import { notificationArnPrefix } from '../constants';

/**
 * Bucket notification destinations, as CloudServer and backbeat read them.
 *
 * A destination ARN has six fields,
 * arn:scality:bucketnotif:<region>:<account>:<name>. A tenant destination
 * carries the 12-digit account of its owner, an empty region, and a name in the
 * grammar of IAM group and policy names, which excludes '|' and '*'. A global
 * destination has an empty account (arn:scality:bucketnotif:::target1); its
 * ARN is read as before tenant destinations existed, with any region and any
 * non-empty name, so that stored global ARNs stay valid. An ARN with an account
 * follows the tenant rules: before tenant destinations, readers used only the
 * name field, so a stored ARN with an account now reads as a tenant destination
 * or as null, and each caller decides how to treat it.
 *
 * ARN.createFromString does not read these ARNs: its list of services leaves
 * out bucketnotif, and widening it would change what it answers to its current
 * callers.
 */

export type Destination = {
    /** owner account of a tenant destination, null for a global destination */
    accountId: string | null;
    name: string;
};

export const nameMaxLength = 128;

export const namePattern = /^[\w+=,.@ -]+$/;

const arnPrefix = notificationArnPrefix.split(':');

const accountIdPattern = /^[0-9]{12}$/;

/**
 * Check a destination name
 * @param name - destination name
 * @return - true if the name has 1 to 128 allowed characters
 */
export function isValidName(name: unknown): boolean {
    return typeof name === 'string' && name.length <= nameMaxLength && namePattern.test(name);
}

/**
 * Parse a destination ARN
 * @param arn - destination ARN
 * @return - the owner account and the name, or null if the value is not a
 *  valid destination ARN; each caller picks its own answer to null
 */
export function parseArn(arn: unknown): Destination | null {
    if (typeof arn !== 'string') {
        return null;
    }
    const fields = arn.split(':');
    if (fields.length !== 6 || arnPrefix.some((field, i) => fields[i] !== field)) {
        return null;
    }
    const [, , , region, accountId, name] = fields;
    if (accountId === '') {
        return name === '' ? null : { accountId: null, name };
    }
    if (!accountIdPattern.test(accountId) || region !== '' || !isValidName(name)) {
        return null;
    }
    return { accountId, name };
}

/**
 * Tell a global destination from a tenant one
 * @param destination - parsed destination ARN
 * @return - true if the destination has no owner account
 */
export function isGlobal(destination: Destination): boolean {
    return destination.accountId === null;
}
