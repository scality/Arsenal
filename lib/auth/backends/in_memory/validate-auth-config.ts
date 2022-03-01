import { Logger } from 'werelogs';
import AuthLoader from './AuthLoader';
import { Accounts } from './types';

/**
 * @deprecated please use {@link AuthLoader} class instead
 * @param authdata - the authentication config file's data
 * @param logApi - object providing a constructor function for the Logger object
 * @return true on erroneous data false on success
 */
export default function validateAuthConfig(
    authdata: Accounts,
    logApi?: { Logger: typeof Logger }
) {
    const authLoader = new AuthLoader(logApi);
    authLoader.addAccounts(authdata);
    return !authLoader.validate();
}
