const AuthLoader = require('./AuthLoader');

/**
 * @deprecated please use {@link AuthLoader} class instead
 *
 * @param {object} authdata - the authentication config file's data
 * @param {werelogs.API} logApi - object providing a constructor function
 *                                for the Logger object
 * @return {boolean} true on erroneous data
 *                   false on success
 */
function validateAuthConfig(authdata, logApi) {
    const authLoader = new AuthLoader(logApi);
    authLoader.addAccounts(authdata);
    return !authLoader.validate();
}

module.exports = validateAuthConfig;
