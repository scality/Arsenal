import * as fs from 'fs';
import glob from 'simple-glob';
import joi from 'joi';
import werelogs from 'werelogs';
import * as types from './types';
import { Account } from './types';

import ARN from '../../../models/ARN';

/** Load authentication information from files or pre-loaded account objects */
export default class AuthLoader {
    #log: werelogs.Logger;
    #authData: { accounts: Account[] };
    #isValid: 'waiting-for-validation' | 'valid' | 'invalid';

    constructor(logApi: { Logger: typeof werelogs.Logger } = werelogs) {
        this.#log = new logApi.Logger('S3');
        this.#authData = { accounts: [] };
        this.#isValid = 'waiting-for-validation';
    }

    /** Add one or more accounts to the authentication info */
    addAccounts(authData: { accounts: Account[] }, filePath?: string) {
        const isValid = this.#isAuthDataValid(authData, filePath);
        if (isValid) {
            this.#authData.accounts = [
                ...this.#authData.accounts,
                ...authData.accounts,
            ];
            // defer validity checking when getting data to avoid
            // logging multiple times the errors (we need to validate
            // all accounts at once to detect duplicate values)
            if (this.#isValid === 'valid') {
                this.#isValid = 'waiting-for-validation';
            }
        } else {
            this.#isValid = 'invalid';
        }
    }

    /**
     * Add account information from a file. Use { legacy: false } as an option
     *  to use the new, Promise-based version.
     *
     * @param filePath - file path containing JSON
     *   authentication info (see {@link addAccounts()} for format)
     */
    addFile(filePath: string, options: { legacy: false }): Promise<void>;
    /** @deprecated Please use Promise-version instead. */
    addFile(filePath: string, options?: { legacy: true }): void;
    addFile(filePath: string, options = { legacy: true }) {
        // On deprecation, remove the legacy part and keep the promises.
        const fn: any = options.legacy ? fs.readFileSync : fs.promises.readFile;
        const temp = fn(filePath, 'utf8') as Promise<string> | string;
        const prom = Promise.resolve(temp).then((data) => {
            const authData = JSON.parse(data);
            this.addAccounts(authData, filePath);
        });
        return options.legacy ? undefined : prom;
    }

    /**
     * Add account information from a filesystem path
     *
     * @param globPattern - filesystem glob pattern,
     *   can be a single string or an array of glob patterns. Globs
     *   can be simple file paths or can contain glob matching
     *   characters, like '/a/b/*.json'. The matching files are
     *   individually loaded as JSON and accounts are added. See
     *   {@link addAccounts()} for JSON format.
     */
    addFilesByGlob(globPattern: string | string[]) {
        // FIXME switch glob to async version
        const files = glob(globPattern);
        files.forEach((filePath) => this.addFile(filePath));
    }

    /**
     * Perform validation on authentication info previously
     * loaded. Note that it has to be done on the entire set after an
     * update to catch duplicate account IDs or access keys.
     */
    validate() {
        if (this.#isValid === 'waiting-for-validation') {
            const isValid = this.#isAuthDataValid(this.#authData);
            this.#isValid = isValid ? 'valid' : 'invalid';
        }
        return this.#isValid === 'valid';
    }

    /**
     * Get authentication info as a plain JS object containing all accounts
     * under the "accounts" attribute, with validation.
     */
    get data() {
        return this.validate() ? this.#authData : null;
    }

    /** backward-compat: ignore arn if starts with 'aws:' and log a warning */
    #isNotLegacyAWSARN(account: Account, filePath?: string) {
        if (account.arn.startsWith('aws:')) {
            const { name: accountName, arn: accountArn } = account;
            this.#log.error(
                'account must have a valid AWS ARN, legacy examples ' +
                    "starting with 'aws:' are not supported anymore. " +
                    'Please convert to a proper account entry (see ' +
                    'examples at https://github.com/scality/S3/blob/' +
                    'master/conf/authdata.json). Also note that support ' +
                    'for account users has been dropped.',
                { accountName, accountArn, filePath }
            );
            return false;
        }
        return true;
    }

    #isValidUsers(account: Account, filePath?: string) {
        if (account.users) {
            const { name: accountName, arn: accountArn } = account;
            this.#log.error(
                'support for account users has been dropped, consider ' +
                    'turning users into account entries (see examples at ' +
                    'https://github.com/scality/S3/blob/master/conf/' +
                    'authdata.json)',
                { accountName, accountArn, filePath }
            );
            return false;
        }
        return true;
    }

    #isValidARN(account: Account, filePath?: string) {
        const arnObj = ARN.createFromString(account.arn);
        const { name: accountName, arn: accountArn } = account;
        if (arnObj instanceof ARN) {
            if (!arnObj.isIAMAccount()) {
                this.#log.error('authentication config validation error', {
                    reason: 'not an IAM account ARN',
                    accountName,
                    accountArn,
                    filePath,
                });
                return false;
            }
        } else {
            this.#log.error('authentication config validation error', {
                reason: arnObj.error.description,
                accountName,
                accountArn,
                filePath,
            });
            return false;
        }
        return true;
    }

    #isAuthDataValid(authData: any, filePath?: string) {
        const options = { abortEarly: true };
        const response = types.validators.accounts.validate(authData, options);
        if (response.error) {
            this.#dumpJoiErrors(response.error.details, filePath);
            return false;
        }
        const validAccounts = response.value.accounts.filter(
            (account: Account) =>
                this.#isNotLegacyAWSARN(account, filePath) &&
                this.#isValidUsers(account, filePath) &&
                this.#isValidARN(account, filePath)
        );
        const areSomeInvalidAccounts =
            validAccounts.length !== response.value.accounts.length;
        if (areSomeInvalidAccounts) {
            return false;
        }
        const keys = validAccounts.flatMap((account) => account.keys);
        const uniqueKeysValidator = types.validators.keys.unique('access');
        const areKeysUnique = uniqueKeysValidator.validate(keys);
        if (areKeysUnique.error) {
            this.#dumpJoiErrors(areKeysUnique.error.details, filePath);
            return false;
        }
        return true;
    }

    #dumpJoiErrors(errors: joi.ValidationErrorItem[], filePath?: string) {
        errors.forEach((err) => {
            const baseLogInfo = { item: err.path, filePath };
            const logInfo = () => {
                if (err.type === 'array.unique') {
                    const reason = `duplicate value '${err.context?.path}'`;
                    const dupValue = err.context?.value[err.context.path];
                    return { ...baseLogInfo, reason, dupValue };
                } else {
                    const reason = err.message;
                    const context = err.context;
                    return { ...baseLogInfo, reason, context };
                }
            };
            this.#log.error(
                'authentication config validation error',
                logInfo()
            );
        });
    }
}
