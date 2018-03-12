const forge = require('node-forge');

function decryptSecret(instanceCredentials, secret) {
    const privateKey = forge.pki.privateKeyFromPem(
        instanceCredentials.privateKey);
    const encryptedSecretKey = forge.util.decode64(secret);
    return privateKey.decrypt(encryptedSecretKey, 'RSA-OAEP', {
        md: forge.md.sha256.create(),
    });
}

function loadOverlayVersion(db, version, cb) {
    db.get(`configuration/overlay/${version}`, {}, (err, val) => {
        if (err) {
            return cb(err);
        }
        return cb(null, JSON.parse(val));
    });
}

function parseServiceCredentials(conf, auth, serviceName) {
    const instanceAuth = JSON.parse(auth);
    const serviceAccount = (conf.users || []).find(
        u => u.accountType === `service-${serviceName}`);
    if (!serviceAccount) {
        return undefined;
    }
    return {
        accessKey: serviceAccount.accessKey,
        secretKey: decryptSecret(instanceAuth, serviceAccount.secretKey),
    };
}

module.exports = {
    decryptSecret,
    loadOverlayVersion,
    parseServiceCredentials,
};
