import * as constants from '../constants';

export type AuthInfoType = {
    arn: string;
    canonicalID: string;
    shortid: string;
    email: string;
    accountDisplayName: string;
    IAMdisplayName: string;
};

export type AuthorizationResults = {
    isAllowed: boolean,
    isImplicit: boolean,
    arn: string,
    action: string,
    versionId?: string,
}[];

export type AccountQuota = {
    account: string,
    quota: bigint,
};

export type AccountInfos = {
    accountQuota?: AccountQuota,
};

export type AuthV4Results = {
    userInfo: AuthInfoType,
    authorizationResults?: AuthorizationResults,
    accountQuota: AccountQuota,
};

export type AccountCanonicalInfo = {
    accountId: string;
    canonicalId: string;
    name: string;
}

export type AccountCanonicalInfoResults = {
    message: {
        body: AccountCanonicalInfo[],
    },
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
    authVersion?: string;
    authType?: string;
    accessKey?: string;

    constructor(
        objectFromVault: any,
        authVersion?: string,
        authType?: string,
        accessKey?: string,
    ) {
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
        // SigV4 or SigV2
        this.authVersion = authVersion;
        // QueryString or AuthHeader
        switch (authType) {
        case 'REST-QUERY-STRING':
            this.authType = 'QueryString';
            break;
        case 'query':
            this.authType = 'QueryString';
            break;
        case 'REST-HEADER':
            this.authType = 'AuthHeader';
            break;
        case 'header':
            this.authType = 'AuthHeader';
            break;
        default:
            this.authType = authType;
            break;
        }
        this.accessKey = accessKey;
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
    getAuthVersion() {
        return this.authVersion;
    }
    getAuthType() {
        return this.authType;
    }
    getAccessKey() {
        return this.accessKey;
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
