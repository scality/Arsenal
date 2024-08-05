# AWS KMS connector

Allow to use AWS KMS backend for encryption of objects. It currently only support AK+SK for authentication.
mTLS can also be used to add extra security.

## Configuration

Configuration is done using the configuration file or environment variables. A Mix of both can be used, the configuration file takes precedence over environment variables.
Environment variables are the same as the ones used by the AWS CLI prefixed with "KMS_" (in order to scope them to the KMS module).

The following parameters are supported:

| config file         | env variable                                     | Description
|---------------------|--------------------------------------------------|------------
| kmsAWS.region       | KMS_AWS_REGION or KMS_AWS_DEFAULT_REGION         | AWS region tu use
| kmsAWS.endpoint     | KMS_AWS_ENDPOINT_URL_KMS or KMS_AWS_ENDPOINT_URL | Endpoint URL
| kmsAWS.ak           | KMS_AWS_ACCESS_KEY_ID                            | Credentials, Access Key
| kmsAWS.sk           | KMS_AWS_SECRET_ACCESS_KEY                        | Credentials, Secret Key
| kmsAWS.tls          |                                                  | TLS configuration (Object, see below)

The TLS configuration is can contain the following attributes:

| config file         | Description
|---------------------|--------------------------------------------------
| rejectUnauthorized  | false to disable TLS certificates checks (useful in development, DON'T disable in production)
| minVersion          | min TLS version, One of 'TLSv1.3', 'TLSv1.2', 'TLSv1.1', or 'TLSv1' (see https://nodejs.org/api/tls.html#tlscreatesecurecontextoptions)
| maxVersion          | max TLS version, One of 'TLSv1.3', 'TLSv1.2', 'TLSv1.1', or 'TLSv1' (see https://nodejs.org/api/tls.html#tlscreatesecurecontextoptions)
| ca                  | filename or array of filenames containing CA(s)
| cert                | filename or array of filenames containing certificate(s)
| key                 | filename or array of filenames containing private key(s)

All TLS attributes conform to their nodejs definition. See https://nodejs.org/api/tls.html#tlsconnectoptions and https://nodejs.org/api/tls.html#tlscreatesecurecontextoptions.

Configuration example:
```json
    "kmsAWS": {
        "region": "us-east-1",
        "endpoint": "https://kms.us-east-1.amazonaws.com",
        "ak": "xxxxxxx",
        "sk": "xxxxxxx"
    },
```

With TLS configuration:
```json
    "kmsAWS": {
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
