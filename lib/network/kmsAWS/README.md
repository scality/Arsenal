# AWS KMS Connector

Allows using AWS KMS backend for object encryption. Currently supports AK+SK
for authentication. mTLS can be used for additional security.

## Configuration

Configuration is done using the configuration file.

Supported parameters:

| Config File        | Description                                                        |
|--------------------|--------------------------------------------------------------------|
| kmsAWS.providerName| **Required**: Friendly name to identify the KMS key provider in MD |
| kmsAWS.region      | **Required**: AWS region to use                                    |
| kmsAWS.endpoint    | Optional: Endpoint URL                                             |
| kmsAWS.ak          | Optional: Credentials, Access Key                                  |
| kmsAWS.sk          | Optional: Credentials, Secret Key                                  |
| kmsAWS.noAwsArn    | Optional (default false): use KeyId instead of KeyArn              |
| kmsAWS.tls         | Optional: TLS configuration (Object, see below)                    |

TLS configuration attributes:

| Config File         | Description                                            |
|---------------------|--------------------------------------------------------|
| rejectUnauthorized  | `false` to disable TLS cert checks (useful in          |
|                     | development, **DON'T** disable in production)          |
| minVersion          | Min TLS version: 'TLSv1.3', 'TLSv1.2', 'TLSv1.1', or   |
|                     | 'TLSv1' (See [Node.js TLS](https://nodejs.org/api/tls) |
| maxVersion          | Max TLS version: 'TLSv1.3', 'TLSv1.2', 'TLSv1.1', or   |
|                     | 'TLSv1' (See [Node.js TLS](https://nodejs.org/api/tls) |
| ca                  | Filename or array of filenames for CA(s)               |
| cert                | Filename or array of filenames for certificate(s)      |
| key                 | Filename or array of filenames for private key(s)      |

All TLS attributes follow Node.js definitions. See
[Node.js TLS Connect Options](https://nodejs.org/api/tls.html#tlsconnectoptions)
and
[Node.js TLS Secure Context](https://nodejs.org/api/tls.html#tlscreatesecurecontextoptions).

### Configuration Example

```json
{
    "kmsAWS": {
        "providerName": "aws",
        "region": "us-east-1",
        "endpoint": "https://kms.us-east-1.amazonaws.com",
        "ak": "xxxxxxx",
        "sk": "xxxxxxx",
        "noAwsArn": true
    }
}
```

With TLS configuration:

```json
    "kmsAWS": {
        "providerName": "aws",
        "region": "us-east-1",
        "endpoint": "https://kms.us-east-1.amazonaws.com",
        "ak": "xxxxxxx",
        "sk": "xxxxxxx",
        "tls": {
            "rejectUnauthorized": false,
            "cert": "mtls.crt.pem",
            "key": "mtls.key.pem",
            "minVersion": "TLSv1.3"
        }
    },
```
