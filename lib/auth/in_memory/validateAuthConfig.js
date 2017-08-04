const werelogs = require('werelogs');

function _incr(count) {
    if (count !== undefined) {
        return count + 1;
    }
    return 1;
}

/**
 * This function ensures that the field `name` inside `container` is of the
 * expected `type` inside `obj`. If any error is found, an entry is added into
 * the error collector object.
 *
 * @param {object} data - the error collector object
 * @param {string} container - the name of the entity that contains
 *                             what we're checking
 * @param {string} name - the name of the entity we're checking for
 * @param {string} type - expected typename of the entity we're checking
 * @param {object} obj - the object we're checking the fields of
 * @return {boolean} true if the type is Ok and no error found
 *                   false if an error was found and reported
 */
function _checkType(data, container, name, type, obj) {
    if ((type === 'array' && !Array.isArray(obj[name]))
        || (type !== 'array' && typeof obj[name] !== type)) {
        data.errors.push({
            txt: 'property is not of the expected type',
            obj: {
                entity: container,
                property: name,
                type: typeof obj[name],
                expectedType: type,
            },
        });
        return false;
    }
    return true;
}

/**
 * This function ensures that the field `name` inside `obj` which is a
 * `container`. If any error is found, an entry is added into the error
 * collector object.
 *
 * @param {object} data - the error collector object
 * @param {string} container - the name of the entity that contains
 *                             what we're checking
 * @param {string} name - the name of the entity we're checking for
 * @param {string} type - expected typename of the entity we're checking
 * @param {object} obj - the object we're checking the fields of
 * @return {boolean} true if the field exists and type is Ok
 *                   false if an error was found and reported
 */
function _checkExists(data, container, name, type, obj) {
    if (obj[name] === undefined) {
        data.errors.push({
            txt: 'missing property in auth entity',
            obj: {
                entity: container,
                property: name,
            },
        });
        return false;
    }
    return _checkType(data, container, name, type, obj);
}

function _checkUser(data, userObj) {
    if (_checkExists(data, 'User', 'arn', 'string', userObj)) {
        // eslint-disable-next-line no-param-reassign
        data.arns[userObj.arn] = _incr(data.arns[userObj.arn]);
    }
    if (_checkExists(data, 'User', 'email', 'string', userObj)) {
        // eslint-disable-next-line no-param-reassign
        data.emails[userObj.email] = _incr(data.emails[userObj.email]);
    }
    if (_checkExists(data, 'User', 'keys', 'array', userObj)) {
        userObj.keys.forEach(keyObj => {
            // eslint-disable-next-line no-param-reassign
            data.keys[keyObj.access] = _incr(data.keys[keyObj.access]);
        });
    }
}

function _checkAccount(data, accountObj, checkSas) {
    if (_checkExists(data, 'Account', 'email', 'string', accountObj)) {
        // eslint-disable-next-line no-param-reassign
        data.emails[accountObj.email] = _incr(data.emails[accountObj.email]);
    }
    if (_checkExists(data, 'Account', 'arn', 'string', accountObj)) {
        // eslint-disable-next-line no-param-reassign
        data.arns[accountObj.arn] = _incr(data.arns[accountObj.arn]);
    }
    if (_checkExists(data, 'Account', 'canonicalID', 'string', accountObj)) {
        // eslint-disable-next-line no-param-reassign
        data.canonicalIds[accountObj.canonicalID] =
            _incr(data.canonicalIds[accountObj.canonicalID]);
    }
    if (checkSas &&
        _checkExists(data, 'Account', 'sasToken', 'string', accountObj)) {
        // eslint-disable-next-line no-param-reassign
        data.sasTokens[accountObj.sasToken] =
            _incr(data.sasTokens[accountObj.sasToken]);
    }

    if (accountObj.users) {
        if (_checkType(data, 'Account', 'users', 'array', accountObj)) {
            accountObj.users.forEach(userObj => _checkUser(data, userObj));
        }
    }

    if (accountObj.keys) {
        if (_checkType(data, 'Account', 'keys', 'array', accountObj)) {
            accountObj.keys.forEach(keyObj => {
                // eslint-disable-next-line no-param-reassign
                data.keys[keyObj.access] = _incr(data.keys[keyObj.access]);
            });
        }
    }
}

function _dumpCountError(property, obj, log) {
    let count = 0;
    Object.keys(obj).forEach(key => {
        if (obj[key] > 1) {
            log.error('property should be unique', {
                property,
                value: key,
                count: obj[key],
            });
            ++count;
        }
    });
    return count;
}

function _dumpErrors(checkData, log) {
    let nerr = _dumpCountError('CanonicalID', checkData.canonicalIds, log);
    nerr += _dumpCountError('Email', checkData.emails, log);
    nerr += _dumpCountError('ARN', checkData.arns, log);
    nerr += _dumpCountError('AccessKey', checkData.keys, log);
    nerr += _dumpCountError('SAS Token', checkData.sasTokens, log);

    if (checkData.errors.length > 0) {
        checkData.errors.forEach(msg => {
            log.error(msg.txt, msg.obj);
        });
    }

    if (checkData.errors.length === 0 && nerr === 0) {
        return false;
    }

    log.fatal('invalid authentication config file (cannot start)');

    return true;
}

/**
 * @param {object} authdata - the authentication config file's data
 * @param {werelogs.API} logApi - object providing a constructor function
 *                                for the Logger object
 * @param {(boolean|null)} checkSas - whether to check Azure SAS for ea. account
 * @return {boolean} true on erroneous data
 *                   false on success
 */
function validateAuthConfig(authdata, logApi, checkSas) {
    const checkData = {
        errors: [],
        emails: [],
        arns: [],
        canonicalIds: [],
        keys: [],
        sasTokens: [],
    };
    const log = new (logApi || werelogs).Logger('S3');


    if (authdata.accounts === undefined) {
        checkData.errors.push({
            txt: 'no "accounts" array defined in Auth config',
        });
        return _dumpErrors(checkData, log);
    }

    authdata.accounts.forEach(account => {
        _checkAccount(checkData, account, checkSas);
    });

    return _dumpErrors(checkData, log);
}

module.exports = validateAuthConfig;
