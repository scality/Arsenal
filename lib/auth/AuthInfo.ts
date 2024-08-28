import * as constants from '../constants';

export type AuthInfoType = {
    arn: string;
    canonicalID: string;
    shortid: string;
    email: string;
    accountDisplayName: string;
    IAMdisplayName: string;
};

/**
 * Class containing requester's information received from Vault
 * @param {object} info from Vault including arn, canonicalID,
 * shortid, email, accountDisplayName and IAMdisplayName (if applicable)
 * @return {AuthInfo} an AuthInfo instance
 */
export default class AuthInfo {
    arn: string;
    canonicalID: string;
    shortid: string;
    email: string;
    accountDisplayName: string;
    IAMdisplayName: string;

    constructor(objectFromVault: any) {
        // amazon resource name for IAM user (if applicable)
        this.arn = objectFromVault.arn;
        // account canonicalID
        this.canonicalID = objectFromVault.canonicalID;
        // shortid for account (also contained in ARN)
        this.shortid = objectFromVault.shortid;
        // email for account or user as applicable
        this.email = objectFromVault.email;
        // display name for account
        this.accountDisplayName = objectFromVault.accountDisplayName;
        // display name for user (if applicable)
        this.IAMdisplayName = objectFromVault.IAMdisplayName;
    }
    getArn() {
        return this.arn;
    }
    getCanonicalID() {
        return this.canonicalID;
    }
    getShortid() {
        return this.shortid;
    }
    getEmail() {
        return this.email;
    }
    getAccountDisplayName() {
        return this.accountDisplayName;
    }
    getIAMdisplayName() {
        return this.IAMdisplayName;
    }
    // Check whether requester is an IAM user versus an account
    isRequesterAnIAMUser() {
        return !!this.IAMdisplayName;
    }
    isRequesterPublicUser() {
        return this.canonicalID === constants.publicId;
    }
    isRequesterAServiceAccount() {
        return this.canonicalID.startsWith(
            `${constants.zenkoServiceAccount}/`);
    }
    isRequesterThisServiceAccount(serviceName: string) {
        const computedCanonicalID = `${constants.zenkoServiceAccount}/${serviceName}`;
        return this.canonicalID === computedCanonicalID;
    }
}
