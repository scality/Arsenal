import { Accounts, Account, Entity } from './types';

/**
 * Class that provides an internal indexing over the simple data provided by
 * the authentication configuration file for the memory backend. This allows
 * accessing the different authentication entities through various types of
 * keys.
 */
export default class Indexer {
    accountsBy: {
        canId: { [id: string]: Entity | undefined },
        accessKey: { [id: string]: Entity | undefined },
        email: { [id: string]: Entity | undefined },
    }

    constructor(authdata?: Accounts) {
        this.accountsBy = {
            canId: {},
            accessKey: {},
            email: {},
        };

        /*
         * This may happen if the application is configured to use another
         * authentication backend than in-memory.
         * As such, we're managing the error here to avoid screwing up there.
         */
        if (!authdata) {
            return;
        }

        this.#build(authdata);
    }

    #indexAccount(account: Account) {
        const accountData: Entity = {
            arn: account.arn,
            canonicalID: account.canonicalID,
            shortid: account.shortid,
            accountDisplayName: account.name,
            email: account.email.toLowerCase(),
            keys: [],
        };
        this.accountsBy.canId[accountData.canonicalID] = accountData;
        this.accountsBy.email[accountData.email] = accountData;
        if (account.keys !== undefined) {
            account.keys.forEach(key => {
                accountData.keys.push(key);
                this.accountsBy.accessKey[key.access] = accountData;
            });
        }
    }

    #build(authdata: Accounts) {
        authdata.accounts.forEach(account => {
            this.#indexAccount(account);
        });
    }

    /** This method returns the account associated to a canonical ID. */
    getEntityByCanId(canId: string): Entity | undefined {
        return this.accountsBy.canId[canId];
    }

    /**
     * This method returns the entity (either an account or a user) associated
     * to a canonical ID.
     * @param {string} key - The accessKey of the entity
     */
    getEntityByKey(key: string): Entity | undefined {
        return this.accountsBy.accessKey[key];
    }

    /**
     * This method returns the entity (either an account or a user) associated
     * to an email address.
     */
    getEntityByEmail(email: string): Entity | undefined {
        const lowerCasedEmail = email.toLowerCase();
        return this.accountsBy.email[lowerCasedEmail];
    }

    /** This method returns the secret key associated with the entity. */
    getSecretKey(entity: Entity, accessKey: string) {
        const keys = entity.keys.filter(kv => kv.access === accessKey);
        return keys[0].secret;
    }

    /** This method returns the account display name associated with the entity. */
    getAcctDisplayName(entity: Entity) {
        return entity.accountDisplayName;
    }
}
