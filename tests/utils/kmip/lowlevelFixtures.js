'use strict'; // eslint-disable-line strict
/* eslint new-cap: "off" */

const KMIP = require('../../../lib/network/kmip').default;

module.exports = [
    {
        operation: 'Query',
        payload: () => [
            KMIP.Enumeration('Query Function', 'Query Operations'),
            KMIP.Enumeration('Query Function', 'Query Objects'),
        ],
    },
    {
        operation: 'Query',
        payload: () => [
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
        ],
    },
    {
        operation: 'Discover Versions',
        payload: () => [
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
        ],
    },
    {
        operation: 'Create',
        payload: kmip => [
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
        ],
    },
];
