const https = require('https');
const http = require('http');
const url = require('url');
const AWS = require('aws-sdk');
const Sproxy = require('sproxydclient');
const Hyperdrive = require('hdclient');
const HttpsProxyAgent = require('https-proxy-agent');

const constants = require('../../constants');
const DataFileBackend = require('./file/DataFileInterface');
const inMemory = require('./in_memory/datastore').backend;
const AwsClient = require('./external/AwsClient');
const AzureClient = require('./external/AzureClient');
const GcpClient = require('./external/GcpClient');
const PfsClient = require('./external/PfsClient');
const backendUtils = require('./external/utils');

function parseLC(config, vault) {
    const clients = {};

    Object.keys(config.locationConstraints).forEach(location => {
        const locationObj = config.locationConstraints[location];
        if (locationObj.type === 'mem') {
            clients[location] = inMemory;
        }
        if (locationObj.type === 'file') {
            clients[location] = new DataFileBackend(config);
        }
        if (locationObj.type === 'scality') {
            if (locationObj.details.connector.sproxyd) {
                clients[location] = new Sproxy({
                    bootstrap: locationObj.details.connector
                    .sproxyd.bootstrap,
                    // Might be undefined which is ok since there is a default
                    // set in sproxydclient if chordCos is undefined
                    chordCos: locationObj.details.connector.sproxyd.chordCos,
                    // Might also be undefined, but there is a default path set
                    // in sproxydclient as well
                    path: locationObj.details.connector.sproxyd.path,
                    // enable immutable optim for all objects
                    immutable: true,
                });
                clients[location].clientType = 'scality';
            } else if (locationObj.details.connector.hdclient) {
                clients[location] = new Hyperdrive.hdcontroller.HDProxydClient(
                    locationObj.details.connector.hdclient);
                clients[location].clientType = 'scality';
            }
        }
        if (locationObj.type === 'aws_s3' || locationObj.type === 'gcp') {
            let connectionAgent;
            const endpoint = locationObj.type === 'gcp' ?
                locationObj.details.gcpEndpoint :
                locationObj.details.awsEndpoint;
            const region = locationObj.details.region;
            const protocol = locationObj.details.https ? 'https' : 'http';
            const sslEnabled = locationObj.details.https === true;
            const signatureVersion = !sslEnabled ? 'v2' : 'v4';
            const pathStyle = locationObj.details.pathStyle;
            // keepalive config
            const httpAgentConfig =
                config.externalBackends[locationObj.type].httpAgent;
           //  max sockets is infinity by default and expressed as null
            if (httpAgentConfig.maxSockets === null) {
                httpAgentConfig.maxSockets = undefined;
            }
            const proxyMatch = backendUtils.proxyCompareUrl(endpoint);
            if (config.outboundProxy.url && !proxyMatch) {
                const options = url.parse(config.outboundProxy.url);
                if (config.outboundProxy.certs) {
                    Object.assign(options, config.outboundProxy.certs);
                    options.secureProxy = true;
                }
                options.keepAlive = httpAgentConfig.keepAlive;
                // whether options.secureProxy is set to true determines
                // https or http proxy
                connectionAgent = new HttpsProxyAgent(options);
            } else {
                connectionAgent = sslEnabled ?
                    new https.Agent(httpAgentConfig) :
                    new http.Agent(httpAgentConfig);
            }
            const httpOptions = { agent: connectionAgent, timeout: 0 };
            const s3Params = {
                endpoint: `${protocol}://${endpoint}`,
                region,
                debug: false,
                // Not implemented yet for streams in node sdk,
                // and has no negative impact if stream, so let's
                // leave it in for future use
                computeChecksums: true,
                httpOptions,
                // needed for encryption
                signatureVersion,
                sslEnabled,
                maxRetries: 0,
                s3ForcePathStyle: pathStyle,
                customUserAgent: constants.productName,
            };
            // users can either include the desired profile name from their
            // ~/.aws/credentials file or include the accessKeyId and
            // secretAccessKey directly in the locationConfig
            if (locationObj.details.credentialsProfile) {
                s3Params.credentials = new AWS.SharedIniFileCredentials({
                    profile: locationObj.details.credentialsProfile });
            } else {
                s3Params.accessKeyId =
                    locationObj.details.credentials.accessKey;
                s3Params.secretAccessKey =
                    locationObj.details.credentials.secretKey;
            }
            const clientConfig = {
                s3Params,
                bucketName: locationObj.details.bucketName,
                bucketMatch: locationObj.details.bucketMatch,
                serverSideEncryption: locationObj.details.serverSideEncryption,
                dataStoreName: location,
                supportsVersioning: locationObj.details.supportsVersioning,
                vault,
            };
            if (locationObj.type === 'gcp') {
                clientConfig.mpuBucket = locationObj.details.mpuBucketName;
            }
            clients[location] = locationObj.type === 'gcp' ?
                new GcpClient(clientConfig) : new AwsClient(clientConfig);
            if (locationObj.type === 'aws_s3') {
                clients[location].setup(() => {});
            }
        }
        if (locationObj.type === 'azure') {
            const azureStorageEndpoint = config.getAzureEndpoint(location);
            const proxyParams =
                backendUtils.proxyCompareUrl(azureStorageEndpoint) ?
                {} : config.outboundProxy;
            const azureStorageCredentials =
                config.getAzureStorageCredentials(location);
            clients[location] = new AzureClient({
                azureStorageEndpoint,
                azureStorageCredentials,
                azureContainerName: locationObj.details.azureContainerName,
                bucketMatch: locationObj.details.bucketMatch,
                dataStoreName: location,
                proxy: proxyParams,
            });
            clients[location].clientType = 'azure';
        }
        if (locationObj.type === 'pfs') {
            const pfsDaemonEndpoint = config.getPfsDaemonEndpoint(location);
            clients[location] = new PfsClient({
                bucketMatch: locationObj.details.bucketMatch,
                dataStoreName: location,
                endpoint: pfsDaemonEndpoint,
            });
            clients[location].clientType = 'pfs';
        }
    });
    return clients;
}

module.exports = parseLC;
