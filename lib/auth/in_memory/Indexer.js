/**
 * Class that provides an internal indexing over the simple data provided by
 * the authentication configuration file for the memory backend. This allows
 * accessing the different authentication entities through various types of
 * keys.
 *
 * @class Indexer
 */
class Indexer {
    /**
     * @constructor
     * @param {object} authdata - the authentication config file's data
     * @param {object[]} authdata.accounts - array of account objects
     * @param {string=} authdata.accounts[].name - account name
     * @param {string} authdata.accounts[].email - account email
     * @param {string} authdata.accounts[].arn - IAM resource name
     * @param {string} authdata.accounts[].canonicalID - account canonical ID
     * @param {string} authdata.accounts[].shortid - short account ID
     * @param {object[]=} authdata.accounts[].keys - array of key objects
     * @param {string} authdata.accounts[].keys[].access - access key
     * @param {string} authdata.accounts[].keys[].secret - secret key
     * @return {undefined}
     */
    constructor(authdata) {
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

        this._build(authdata);
    }

    _indexAccount(account) {
        const accountData = {
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

    _build(authdata) {
        authdata.accounts.forEach(account => {
            this._indexAccount(account);
        });
    }

    /**
     * This method returns the account associated to a canonical ID.
     *
     * @param {string} canId - The canonicalId of the account
     * @return {Object} account - The account object
     * @return {Object} account.arn - The account's ARN
     * @return {Object} account.canonicalID - The account's canonical ID
     * @return {Object} account.shortid - The account's internal shortid
     * @return {Object} account.accountDisplayName - The account's display name
     * @return {Object} account.email - The account's lowercased email
     */
    getEntityByCanId(canId) {
        return this.accountsBy.canId[canId];
    }

    /**
     * This method returns the entity (either an account or a user) associated
     * to a canonical ID.
     *
     * @param {string} key - The accessKey of the entity
     * @return {Object} entity - The entity object
     * @return {Object} entity.arn - The entity's ARN
     * @return {Object} entity.canonicalID - The canonical ID for the entity's
     *                                       account
     * @return {Object} entity.shortid - The entity's internal shortid
     * @return {Object} entity.accountDisplayName - The entity's account
     *                                              display name
     * @return {Object} entity.IAMDisplayName - The user's display name
     *                                          (if the entity is an user)
     * @return {Object} entity.email - The entity's lowercased email
     */
    getEntityByKey(key) {
        return this.accountsBy.accessKey[key];
    }

    /**
     * This method returns the entity (either an account or a user) associated
     * to an email address.
     *
     * @param {string} email - The email address
     * @return {Object} entity - The entity object
     * @return {Object} entity.arn - The entity's ARN
     * @return {Object} entity.canonicalID - The canonical ID for the entity's
     *                                       account
     * @return {Object} entity.shortid - The entity's internal shortid
     * @return {Object} entity.accountDisplayName - The entity's account
     *                                              display name
     * @return {Object} entity.IAMDisplayName - The user's display name
     *                                          (if the entity is an user)
     * @return {Object} entity.email - The entity's lowercased email
     */
    getEntityByEmail(email) {
        const lowerCasedEmail = email.toLowerCase();
        return this.accountsBy.email[lowerCasedEmail];
    }

    /**
    * This method returns the secret key associated with the entity.
    * @param {Object} entity - the entity object
    * @param {string} accessKey - access key
    * @returns {string} secret key
    */
    getSecretKey(entity, accessKey) {
        return entity.keys
            .filter(kv => kv.access === accessKey)[0].secret;
    }

    /**
    * This method returns the account display name associated with the entity.
    * @param {Object} entity - the entity object
    * @returns {string} account display name
    */
    getAcctDisplayName(entity) {
        return entity.accountDisplayName;
    }
}

module.exports = Indexer;
