# KMIP codecs

The KMIP protocol is based on the exchange of structured messages between a
client and a server.

About the structure of the messages:

* It is composed of fields and nested fields
* It varies depending on the context of the request and who emits the message.
* It follows the same encoding rules for both the client and the server
* The set of primitive types is the cornerstone of the protocol, the structure
  description is contained within the messages along with the actual payload.
* The set of defined tags is the keystone of the protocol. It permits to
  attribute a meaning to the fields of a structured message.

The role of the codec is twofold.

* To decode a message from a particular encoding, to an abstract
  representation of the KMIP structured messages.
* To encode a message from its abstract representation to the particular
  encoding.

The codecs are not responsible for sending the messages on the wire.
This task is devoted to the transport layer.

## Abstract representation

The primitive data types defined by the protocol are represented internally
as data structures following the form

```javascript
    const abstractKmipField = {
        [tagName]: {
            type,
            value
        }
    };
```

The tag name `tagName` is a string. It is decoded from the tag value
using the KMIP nomenclature and identify the meaning of the field in the message.

The type name `type` is a string and is one of the primitive types
defined by the KMIP protocol. This element of a field also implicitly carries
the information of length for fixed size data types.

The value `value` is decoded from the payload of the KMIP field. This
element carries the length information for varying data types.

## Constructing an abstract Message

```javascript
    const msg = KMIP.Message(content);
```

The static method `KMIP.Message` instanciates an object of the class
`Message`. Message objects wrap the content of the message without
alteration and offer a `lookup` method to search the message for
named fields.

### Structure

```javascript
    const field =
        KMIP.Structure('Request Header', [
            field_1,
            ...,
            field_n,
        ]);
    console.log(field);
    {
        'Request Header': {
            type: 'Structure',
            value: [
                field_1,
                ...,
                field_n
            ]
        }
    }
```

Fields in the array parameter must be provided in the order defined by the
specification for the considered structure name.

### Integer

```javascript
    const field = KMIP.Integer('Protocol Version Minor', 3);
    console.log(field);
    {
        'Protocol Version Minor': {
            type: "Integer",
            value: 3
        }
    }
```

Integers are encoded as four-byte long (32 bit) binary signed numbers in 2's
complement notation, transmitted big-endian.

### LongInteger

```javascript
    const field = KMIP.LongInteger('Usage Limits Total', 10 ** 42);
    console.log(field);
    {
        'Usage Limits Total': {
            type: 'LongInteger',
            value: 1e+42
        }
    }
```

Long Integers are encoded as eight-byte long (64 bit) binary signed numbers in
2's complement notation, transmitted big-endian.

Due to an accuracy limitation of number representation, `LongInteger` values
cannot exceed 2^53. It's expected from the codec to throw an error when
attempting to transcode a LongInteger greater than this value.

### BigInteger

```javascript
    const field = KMIP.BigInteger('Usage Limits Total', value);
    console.log(field);
    {
        'Usage Limits Total': {
            type: 'LongInteger',
            value: <Buffer ab cd ef ...>
        }
    }
```

Big Integers are encoded as a sequence of eight-bit bytes, in two's complement
notation, transmitted big-endian. If the length of the sequence is not a
multiple of eight bytes, then Big Integers SHALL be padded with the minimal
number of leading sign-extended bytes to make the length a multiple of eight
bytes. These padding bytes are part of the Item Value and SHALL be counted in
the Item Length.

### Enumeration

```javascript
    const field = KMIP.Enumeration('Operation', 'Discover Versions');
    console.log(field);
    {
        'Operation': {
            type: 'Enumeration',
            value: 'Discover Versions'
        }
    }
```

### Boolean

```javascript
    const field = KMIP.Boolean('Asynchronous Indicator', false);
    console.log(field);
    {
        'Asynchronous Indicator': {
            type: 'Boolean',
            value: false
        }
    }
```

### TextString

```javascript
    const field = KMIP.TextString('Username', 'alice');
    console.log(field);
    {
        'Username': {
            type: 'TextString',
            value: 'alice'
        }
    }
```

Text Strings are sequences of bytes that encode character values according to
the UTF-8 encoding standard. There SHALL NOT be null-termination at the end of
such strings.

### ByteString

```javascript
    const field = KMIP.ByteString('Asynchronous Correlation Value', buffer);
    console.log(field);
    {
        'Username': {
            type: 'ByteString',
            value: <Buffer ab cd ef ...>
        }
    }
```

Byte Strings are sequences of bytes containing individual unspecified eight-bit
binary values, and are interpreted in the same sequence order.

### DateTime

```javascript
    const field = KMIP.DateTime('Activation Date', new Date);
    console.log(field);
    {
        'Username': {
            type: 'ByteString',
            value: <Date 2019-01-10T20:41:36.914Z>
        }
    }
```

DateTime takes a Date object as its second parameter. The millisecond part of
the date is silently discarded and not sent through the Network.

For this particular example, the 'Activation Date' tag is used for illustration
purpose. This is not the appropriate way to instanciate this attribute value and
the special function `KMIP.Attribute` must be used instead of `KMIP.DateTime`.

### Interval

```javascript
    const field = KMIP.Interval('Lease Time', 42);
    console.log(field);
    {
        'Lease Time': {
            type: "Interval",
            value: 42
        }
    }
```

Intervals are encoded as four-byte long (32 bit) binary unsigned numbers,
transmitted big-endian. They have a resolution of one second.

### Special types

#### Bit Mask

Bit masks are encoded using the `Integer` primitive type relative to an instance
of the KMIP class (e.g. `encodeMask` and `decodemask` are not static class
function but regular methods).

```javascript
    const kmip = new KMIP;
    const mask = ['Encrypt', 'Decrypt'];
    const bitMask = kmip.encodeMask('Cryptographic Usage Mask', mask);
    const decodedMask = kmip.decodeMask('Cryptographic Usage Mask', bitMask);
    assert.deepStrictEqual(decodedMask, mask);
    assert(bitMask === 12);
```

#### Attribute

Attribute names and values are managed in a way that deviates from the general
rule. Particularly when it comes associate the value of an enumeration to its
tag. In the nominal form, the value of an enumeration in a field is retrieved
from the tag of this field. For the case of an Attribute, the tag of the
enumeration is referenced in the `Attribute Name` as a `TextString` and the
encoded enumeration value is stored in the `Attribute value`, hence
disconnecting the value from its tag.

```javascript
    const cryptographicAlgorithm =
        KMIP.Attribute('Enumeration', 'Cryptographic Algorithm', 'AES'),
    const requestPayload =
        KMIP.Structure('Request Payload', [
            KMIP.Enumeration('Object Type', 'Symmetric Key'),
            KMIP.Structure('Template-Attribute', [
                KMIP.Attribute('TextString', 'x-Name', 's3-thekey'),
                cryptographicAlgorithm,
                KMIP.Attribute('Integer', 'Cryptographic Length', 256),
                KMIP.Attribute('Integer', 'Cryptographic Usage Mask',
                               kmip.encodeMask('Cryptographic Usage Mask',
                                               ['Encrypt', 'Decrypt'])),
                KMIP.Attribute('Date-Time', 'Activation Date', new Date),
            ]),
        ]);
    console.log(cryptographicAlgorithm);
    {
        'Attribute': {
            type: 'Structure',
            value: [
                {
                    'Attribute Name': {
                        type: 'TextString',
                        value: 'Cryptographic Algorithm'
                    }
                },
                {
                    'Attribute Value': {
                        type: 'Enumeration'
                        value: 'AES',
                        diversion: 'Cryptographic Algorithm'
                    }
                }
            ]
        }
    }
```

The `diversion` attribute in the `Attribute Value` structure is used by the
codec to identify the `Enumeration` the value relates to.

## Codec Interface

```javascript
class MyCodec {
    /**
     * Construct a new instance of the codec
     */
    constructor() {}

    /**
     * Encode a bitmask
     * @param {String} tagName - name of the bit mask defining tag
     * @param {Array of Strings} value - array of named bits to set in the mask
     * @return {Integer} Integer encoded bitmask
     */
    encodeMask(tagName, value) {}

    /**
     * Decode a bitmask
     * @param {string} tagName - name of the bit mask defining tag
     * @param {Integer} givenMask - bit mask to decode
     * @return {Array of Strings} array of named bits set in the given bit mask
     */
    decodeMask(tagName, givenMask) {}

    /**
     * Encode an abstract message
     * @param {Object} message - Instance of a KMIP.Message
     * @return {Buffer} the encoded message suitable for the transport layer
     */
    encode(message) {}

    /**
     * Decode a raw message, usually received from the transport layer
     * @param {Object} logger - a Logger instance
     * @param {Buffer} rawMessage - the message to decode
     * @return {Object} the decoded message as an instance of KMIP.Message
     */
    decode(logger, rawMessage) {}

    /**
     * Amend the tag nomenclature with a vendor specific extension
     * @param {String} tagName - Name of the tag to record
     * @param {Integer} tagValue - Tag value represented as an integer
     */
    mapExtension(tagName, tagValue) {}
}
```

## Encoding specification links

### TTLV Encoding Baseline Profile

[TTLV Encoding Specification](http://docs.oasis-open.org/kmip/spec/v1.4/os/kmip-spec-v1.4-os.html#_Toc490660911)

### XML Encoding Profile

[XML Encoding Profile Specification](http://docs.oasis-open.org/kmip/profiles/v1.4/csprd01/kmip-profiles-v1.4-csprd01.html#_Toc479342078)

### JSON Encoding Profile

[JSON Encoding Profile Specification](http://docs.oasis-open.org/kmip/profiles/v1.4/csprd01/kmip-profiles-v1.4-csprd01.html#_Toc479342090)
