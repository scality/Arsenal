'use strict'; // eslint-disable-line strict

module.exports = [

    /* Invalid type */

    Buffer.from('2100000000000000', 'hex'),
    Buffer.from('2100000b00000000', 'hex'),

    /* Structure */
    // too short
    Buffer.from('42', 'hex'),
    Buffer.from('4200', 'hex'),
    Buffer.from('420078', 'hex'),
    Buffer.from('42007801', 'hex'),
    Buffer.from('4200780100', 'hex'),
    Buffer.from('420078010000', 'hex'),
    Buffer.from('4200780100000001', 'hex'),
    Buffer.from('420078010000000100', 'hex'),
    Buffer.from('4200780100000008', 'hex'),
    Buffer.from('420078010000000800', 'hex'),
    Buffer.from('42007801000000080000', 'hex'),
    Buffer.from('4200780100000008000000', 'hex'),
    Buffer.from('420078010000000800000000', 'hex'),
    Buffer.from('4200780100000010', 'hex'),

    /* Integer */
    // too short
    Buffer.from('4200780200000004', 'hex'),
    Buffer.from('420078020000000400', 'hex'),
    Buffer.from('42007802000000040000', 'hex'),
    Buffer.from('4200780200000004000000', 'hex'),
    // invalid length for the type
    Buffer.from('42007802000000080000000000000000', 'hex'),
    Buffer.from('42007802000000020000000000000000', 'hex'),
    Buffer.from('42007802000000000000000000000000', 'hex'),

    /* Long Integer */
    // too short
    Buffer.from('4200780300000008', 'hex'),
    Buffer.from('420078030000000810', 'hex'),
    Buffer.from('42007803000000081000', 'hex'),
    Buffer.from('4200780300000008100000', 'hex'),
    Buffer.from('420078030000000810000000', 'hex'),
    Buffer.from('42007803000000081000000000', 'hex'),
    Buffer.from('4200780300000008100000000000', 'hex'),
    Buffer.from('420078030000000810000000000000', 'hex'),
    // 53bit overflow
    Buffer.from('42007803000000081000000000000000', 'hex'),
    Buffer.from('4200780300000008ffffffffffffffff', 'hex'),
    // invalid length for the type
    Buffer.from('420078030000000400000001', 'hex'),
    Buffer.from('42007803000000100000000000000000100000000000000000', 'hex'),

    /* Big Integer */
    // too short
    Buffer.from('4200780400000001', 'hex'),
    Buffer.from('420078040000000200', 'hex'),

    /* Enumeration */
    // too short
    Buffer.from('4200740500000004', 'hex'),
    Buffer.from('4200740500000004000000', 'hex'),
    // invalid length for the type
    Buffer.from('42007405000000020000', 'hex'),
    Buffer.from('4200740500000006000000000000', 'hex'),
    // non existing tag and enum value with invalid length
    Buffer.from('45007405000000020000', 'hex'),
    Buffer.from('4500740500000006000000000000', 'hex'),

    /* Boolean */
    // too short
    Buffer.from('4200740600000008', 'hex'),
    Buffer.from('420074060000000800', 'hex'),
    Buffer.from('42007406000000080000', 'hex'),
    Buffer.from('4200740600000008000000', 'hex'),
    Buffer.from('420074060000000800000000', 'hex'),
    Buffer.from('42007406000000080000000000', 'hex'),
    Buffer.from('4200740600000008000000000000', 'hex'),
    // invalid length
    Buffer.from('420074060000000400000000', 'hex'),
    Buffer.from('420074060000001000000000000000000000000000000000', 'hex'),

    /* TextString */
    // too short
    Buffer.from('4200740700000008', 'hex'),
    Buffer.from('420074070000000800', 'hex'),
    Buffer.from('42007407000000080000', 'hex'),
    Buffer.from('4200740700000008000000', 'hex'),
    Buffer.from('420074070000000800000000', 'hex'),
    Buffer.from('42007407000000080000000000', 'hex'),
    Buffer.from('4200740700000008000000000000', 'hex'),

    /* ByteString */
    // too short
    Buffer.from('4200740800000008', 'hex'),
    Buffer.from('420074080000000800', 'hex'),
    Buffer.from('42007408000000080000', 'hex'),
    Buffer.from('4200740800000008000000', 'hex'),
    Buffer.from('420074080000000800000000', 'hex'),
    Buffer.from('42007408000000080000000000', 'hex'),
    Buffer.from('4200740800000008000000000000', 'hex'),

    /* Date-Time */
    // too short
    Buffer.from('4200740900000008', 'hex'),
    Buffer.from('420074090000000800', 'hex'),
    Buffer.from('42007409000000080000', 'hex'),
    Buffer.from('4200740900000008000000', 'hex'),
    Buffer.from('420074090000000800000000', 'hex'),
    Buffer.from('42007409000000080000000000', 'hex'),
    Buffer.from('4200740900000008000000000000', 'hex'),
    // invalid length
    Buffer.from('420074090000000400000000', 'hex'),
    Buffer.from('420074090000001000000000000000000000000000000000', 'hex'),

    /* Interval */
    // too short
    Buffer.from('4200780a00000004', 'hex'),
    Buffer.from('4200780a0000000400', 'hex'),
    Buffer.from('4200780a000000040000', 'hex'),
    Buffer.from('4200780a00000004000000', 'hex'),
    // invalid length for the type
    Buffer.from('4200780a000000080000000000000000', 'hex'),
    Buffer.from('4200780a000000020000000000000000', 'hex'),
    Buffer.from('4200780a000000000000000000000000', 'hex'),
];
