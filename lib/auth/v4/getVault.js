const vaultclient = require('vaultclient');
const Vault = require('../Vault');

const Backend = require('../in_memory/Backend').s3;

function getVault(config, logger) {
    const backend = new Backend(config.authData);
    let client;
    let implName;
    if (config.backends.auth === 'mem') {
        config.on('authdata-update', () => {
            backend.refreshAuthData(config.authData);
        });
        client = backend;
        implName = 'vaultMem';
    } else {
        const { host, port } = config.vaultd;
        implName = 'vault';
        if (config.https) {
            const { key, cert, ca } = config.https;
            logger.info('vaultclient configuration', {
                host,
                port,
                https: true,
            });
            client = new vaultclient.Client(host, port, true, key, cert, ca);
        } else {
            logger.info('vaultclient configuration', {
                host,
                port,
                https: false,
            });
            client = new vaultclient.Client(host, port);
        }
        if (config.log) {
            client.setLoggerConfig({
                level: config.log.logLevel,
                dump: config.log.dumpLevel,
            });
        }
    }
    return new Vault(client, implName);
}

module.exports = {
    getVault,
};
