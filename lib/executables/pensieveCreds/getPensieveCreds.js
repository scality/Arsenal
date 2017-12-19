const async = require('async');
const forge = require('node-forge');
const MetadataFileClient =
    require('../../storage/metadata/file/MetadataFileClient');
const mdClient = new MetadataFileClient({
    host: 's3-metadata',
    port: '9993',
});

const serviceName = process.argv[2];
const tokenKey = 'auth/zenko/remote-management-token';

// XXX copy-pasted from Backbeat
function decryptSecret(instanceCredentials, secret) {
    // XXX don't forget to use u.encryptionKeyVersion if present
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


function parseServiceCredentials(conf, auth) {
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

const mdDb = mdClient.openDB(error => {
    if (error) {
        throw error;
    }

    const db = mdDb.openSub('PENSIEVE');
    return async.waterfall([
        cb => db.get('configuration/overlay-version', {}, cb),
        (version, cb) => loadOverlayVersion(db, version, cb),
        (conf, cb) => db.get(tokenKey, {}, (err, instanceAuth) => {
            if (err) {
                return cb(err);
            }
            const creds = parseServiceCredentials(conf, instanceAuth);
            return cb(null, creds);
        }),
    ], (err, creds) => {
        db.disconnect();
        if (err) {
            throw err;
        }
        if (!creds) {
            throw new Error('No credentials found');
        }
        process.stdout.write(`export AWS_ACCESS_KEY_ID="${creds.accessKey}"\n`);
        process.stdout
            .write(`export AWS_SECRET_ACCESS_KEY="${creds.secretKey}"`);
    });
});
