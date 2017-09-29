const fs = require('fs');
const glob = require('simple-glob');
const joi = require('joi');
const werelogs = require('werelogs');

const ARN = require('../../models/ARN');

/**
 * Load authentication information from files or pre-loaded account
 * objects
 *
 * @class AuthLoader
 */
class AuthLoader {
    constructor(logApi) {
        this._log = new (logApi || werelogs).Logger('S3');
        this._authData = { accounts: [] };
        // null: unknown validity, true/false: valid or invalid
        this._isValid = null;

        this._joiKeysValidator = joi.array()
            .items({
                access: joi.string().required(),
                secret: joi.string().required(),
            })
            .required();

        const accountsJoi = joi.array()
                .items({
                    name: joi.string().required(),
                    email: joi.string().email().required(),
                    arn: joi.string().required(),
                    canonicalID: joi.string().required(),
                    shortid: joi.string().regex(/^[0-9]{12}$/).required(),
                    keys: this._joiKeysValidator,
                    // backward-compat
                    users: joi.array(),
                })
                .required()
                .unique('arn')
                .unique('email')
                .unique('canonicalID');
        this._joiValidator = joi.object({ accounts: accountsJoi });
    }

    /**
     * add one or more accounts to the authentication info
     *
     * @param {object} authData - authentication data
     * @param {object[]} authData.accounts - array of account data
     * @param {string} authData.accounts[].name - account name
     * @param {string} authData.accounts[].email: email address
     * @param {string} authData.accounts[].arn: account ARN,
     *   e.g. 'arn:aws:iam::123456789012:root'
     * @param {string} authData.accounts[].canonicalID account
     *   canonical ID
     * @param {string} authData.accounts[].shortid account ID number,
     *   e.g. '123456789012'
     * @param {object[]} authData.accounts[].keys array of
     *   access/secret keys
     * @param {object[]} authData.accounts[].keys[].access access key
     * @param {object[]} authData.accounts[].keys[].secret secret key
     * @param {string} [filePath] - optional file path info for
     *   logging purpose
     * @return {undefined}
     */
    addAccounts(authData, filePath) {
        const isValid = this._validateData(authData, filePath);
        if (isValid) {
            this._authData.accounts =
                this._authData.accounts.concat(authData.accounts);
            // defer validity checking when getting data to avoid
            // logging multiple times the errors (we need to validate
            // all accounts at once to detect duplicate values)
            if (this._isValid) {
                this._isValid = null;
            }
        } else {
            this._isValid = false;
        }
    }

    /**
     * add account information from a file
     *
     * @param {string} filePath - file path containing JSON
     *   authentication info (see {@link addAccounts()} for format)
     * @return {undefined}
     */
    addFile(filePath) {
        const authData = JSON.parse(fs.readFileSync(filePath));
        this.addAccounts(authData, filePath);
    }

    /**
     * add account information from a filesystem path
     *
     * @param {string|string[]} globPattern - filesystem glob pattern,
     *   can be a single string or an array of glob patterns. Globs
     *   can be simple file paths or can contain glob matching
     *   characters, like '/a/b/*.json'. The matching files are
     *   individually loaded as JSON and accounts are added. See
     *   {@link addAccounts()} for JSON format.
     * @return {undefined}
     */
    addFilesByGlob(globPattern) {
        const files = glob(globPattern);
        files.forEach(filePath => this.addFile(filePath));
    }

    /**
     * perform validation on authentication info previously
     * loaded. Note that it has to be done on the entire set after an
     * update to catch duplicate account IDs or access keys.
     *
     * @return {boolean} true if authentication info is valid
     *                   false otherwise
     */
    validate() {
        if (this._isValid === null) {
            this._isValid = this._validateData(this._authData);
        }
        return this._isValid;
    }

    /**
     * get authentication info as a plain JS object containing all accounts
     * under the "accounts" attribute, with validation.
     *
     * @return {object|null} the validated authentication data
     *                       null if invalid
     */
    getData() {
        return this.validate() ? this._authData : null;
    }

    _validateData(authData, filePath) {
        const res = joi.validate(authData, this._joiValidator,
                                 { abortEarly: false });
        if (res.error) {
            this._dumpJoiErrors(res.error.details, filePath);
            return false;
        }
        let allKeys = [];
        let arnError = false;
        const validatedAuth = res.value;
        validatedAuth.accounts.forEach(account => {
            // backward-compat: ignore arn if starts with 'aws:' and log a
            // warning
            if (account.arn.startsWith('aws:')) {
                this._log.error(
                    'account must have a valid AWS ARN, legacy examples ' +
                        'starting with \'aws:\' are not supported anymore. ' +
                        'Please convert to a proper account entry (see ' +
                        'examples at https://github.com/scality/S3/blob/' +
                        'master/conf/authdata.json). Also note that support ' +
                        'for account users has been dropped.',
                    { accountName: account.name, accountArn: account.arn,
                      filePath });
                arnError = true;
                return;
            }
            if (account.users) {
                this._log.error(
                    'support for account users has been dropped, consider ' +
                        'turning users into account entries (see examples at ' +
                        'https://github.com/scality/S3/blob/master/conf/' +
                        'authdata.json)',
                    { accountName: account.name, accountArn: account.arn,
                      filePath });
                arnError = true;
                return;
            }
            const arnObj = ARN.createFromString(account.arn);
            if (arnObj.error) {
                this._log.error(
                    'authentication config validation error',
                    { reason: arnObj.error.description,
                      accountName: account.name, accountArn: account.arn,
                      filePath });
                arnError = true;
                return;
            }
            if (!arnObj.isIAMAccount()) {
                this._log.error(
                    'authentication config validation error',
                    { reason: 'not an IAM account ARN',
                      accountName: account.name, accountArn: account.arn,
                      filePath });
                arnError = true;
                return;
            }
            allKeys = allKeys.concat(account.keys);
        });
        if (arnError) {
            return false;
        }
        const uniqueKeysRes = joi.validate(
            allKeys, this._joiKeysValidator.unique('access'));
        if (uniqueKeysRes.error) {
            this._dumpJoiErrors(uniqueKeysRes.error.details, filePath);
            return false;
        }
        return true;
    }

    _dumpJoiErrors(errors, filePath) {
        errors.forEach(err => {
            const logInfo = { item: err.path, filePath };
            if (err.type === 'array.unique') {
                logInfo.reason = `duplicate value '${err.context.path}'`;
                logInfo.dupValue = err.context.value[err.context.path];
            } else {
                logInfo.reason = err.message;
                logInfo.context = err.context;
            }
            this._log.error('authentication config validation error',
                            logInfo);
        });
    }
}

module.exports = AuthLoader;
