'use strict'; // eslint-disable-line strict
/* eslint new-cap: "off" */

const KMIP = require('../../../lib/network/kmip');

const kmip = new KMIP();

module.exports = [
    KMIP.Message([
        KMIP.Structure('Request Message', [
            KMIP.Structure('Request Header', [
                KMIP.Structure('Protocol Version', [
                    KMIP.Integer('Protocol Version Major', 1),
                    KMIP.Integer('Protocol Version Minor', 3),
                ]),
                KMIP.Integer('Maximum Response Size', 256),
                KMIP.Integer('Batch Count', 1),
            ]),
            KMIP.Structure('Batch Item', [
                KMIP.Enumeration('Operation', 'Query'),
                KMIP.Structure('Request Payload', [
                    KMIP.Enumeration('Query Function', 'Query Operations'),
                    KMIP.Enumeration('Query Function', 'Query Objects'),
                ]),
            ]),
        ]),
    ]),
    KMIP.Message([
        KMIP.Structure('Request Message', [
            KMIP.Structure('Request Header', [
                KMIP.Structure('Protocol Version', [
                    KMIP.Integer('Protocol Version Major', 1),
                    KMIP.Integer('Protocol Version Minor', 2),
                ]),
                KMIP.Integer('Maximum Response Size', 2048),
                KMIP.Boolean('Asynchronous Indicator', false),
                KMIP.Integer('Batch Count', 3),
                KMIP.ByteString('Asynchronous Correlation Value',
                                Buffer.from('Arrggg...', 'utf8')),
            ]),
            KMIP.Structure('Batch Item', [
                KMIP.Enumeration('Operation', 'Query'),
                KMIP.ByteString('Unique Batch Item ID',
                                Buffer.from('foo', 'utf8')),
                KMIP.Structure('Request Payload', [
                    KMIP.Enumeration('Query Function', 'Query Operations'),
                    KMIP.Enumeration('Query Function', 'Query Objects'),
                    KMIP.Enumeration('Query Function',
                                     'Query Server Information'),
                    KMIP.Enumeration('Query Function', 'Query Profiles'),
                    KMIP.Enumeration('Query Function', 'Query Capabilities'),
                    KMIP.Enumeration('Query Function',
                                     'Query Application Namespaces'),
                    KMIP.Enumeration('Query Function', 'Query Extension List'),
                    KMIP.Enumeration('Query Function', 'Query Extension Map'),
                    KMIP.Enumeration('Query Function',
                                     'Query Attestation Types'),
                    KMIP.Enumeration('Query Function', 'Query RNGs'),
                    KMIP.Enumeration('Query Function', 'Query Validations'),
                    KMIP.Enumeration('Query Function',
                                     'Query Client Registration Methods'),
                ]),
            ]),
            KMIP.Structure('Batch Item', [
                KMIP.Enumeration('Operation', 'Discover Versions'),
                KMIP.ByteString('Unique Batch Item ID',
                                Buffer.from('bar', 'utf8')),
                KMIP.Structure('Request Payload', [
                    KMIP.Structure('Protocol Version', [
                        KMIP.Integer('Protocol Version Major', 2),
                        KMIP.Integer('Protocol Version Minor', 0),
                    ]),
                    KMIP.Structure('Protocol Version', [
                        KMIP.Integer('Protocol Version Major', 1),
                        KMIP.Integer('Protocol Version Minor', 4),
                    ]),
                    KMIP.Structure('Protocol Version', [
                        KMIP.Integer('Protocol Version Major', 1),
                        KMIP.Integer('Protocol Version Minor', 3),
                    ]),
                    KMIP.Structure('Protocol Version', [
                        KMIP.Integer('Protocol Version Major', 1),
                        KMIP.Integer('Protocol Version Minor', 2),
                    ]),
                    KMIP.Structure('Protocol Version', [
                        KMIP.Integer('Protocol Version Major', 1),
                        KMIP.Integer('Protocol Version Minor', 1),
                    ]),
                    KMIP.Structure('Protocol Version', [
                        KMIP.Integer('Protocol Version Major', 1),
                        KMIP.Integer('Protocol Version Minor', 0),
                    ]),
                ]),
            ]),
            KMIP.Structure('Batch Item', [
                KMIP.Enumeration('Operation', 'Create'),
                KMIP.ByteString('Unique Batch Item ID',
                                Buffer.from('baz', 'utf8')),
                KMIP.Structure('Request Payload', [
                    KMIP.Enumeration('Object Type', 'Symmetric Key'),
                    KMIP.Structure('Template-Attribute', [
                        KMIP.Attribute('TextString', 'x-Name', 's3-thekey'),
                        KMIP.Attribute('Enumeration', 'Cryptographic Algorithm',
                                       'AES'),
                        KMIP.Attribute('Integer', 'Cryptographic Length', 256),
                        KMIP.Attribute('Integer', 'Cryptographic Usage Mask',
                                       kmip.encodeMask(
                                           'Cryptographic Usage Mask',
                                           ['Encrypt', 'Decrypt'])),
                        KMIP.Attribute('Date-Time', 'Activation Date',
                                       new Date),
                    ]),
                ]),
            ]),
        ]),
    ]),
];
