const async = require('async');
const MetadataFileClient =
    require('../../storage/metadata/file/MetadataFileClient');
const mdClient = new MetadataFileClient({
    host: 's3-metadata',
    port: '9993',
});
const { loadOverlayVersion, parseServiceCredentials } = require('./utils');

const serviceName = process.argv[2];
if (serviceName === undefined) {
    throw new Error('Missing service name (e.g., clueso)');
}
const tokenKey = 'auth/zenko/remote-management-token';

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
            const creds = parseServiceCredentials(conf, instanceAuth,
                serviceName);
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
