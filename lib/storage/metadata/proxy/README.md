# Metatada Proxy Server

## Design goals

## Design choices

## Implementation details

## How to run the proxy server

```js
const werelogs = require('werelogs');
const MetadataWrapper = require('arsenal')
                            .storage.metadata.MetadataWrapper;
const Server = require('arsenal')
                            .storage.metadata.proxy.Server;

const logger = new werelogs.Logger('MetadataProxyServer',
                                   'debug', 'debug');
const metadataWrapper = new MetadataWrapper('mem', {},
                                            null, logger);
const server = new Server(metadataWrapper,
                          {
                              port: 9001,
                              workers: 1,
                          },
                          logger);
server.start(() => {
    logger.info('Metadata Proxy Server successfully started. ' +
                `Using the ${metadataWrapper.implName} backend`);
});

```