/* eslint dot-notation: "off" */
import KMIPTags from '../tags.json';
import KMIPMessage from '../Message';
import * as werelogs from 'werelogs';

const UINT32_MAX = Math.pow(2, 32);

function _ttlvPadVector(vec: any[]) {
    let length = 0;
    vec.forEach(buf => {
        if (!(buf instanceof Buffer)) {
            throw Error('Not a Buffer');
        }
        length += buf.length;
    });
    const paddingLength = (Math.ceil(length / 8) * 8) - length;
    if (paddingLength > 0) {
        vec.push(Buffer.alloc(paddingLength).fill(0));
    }
    return vec;
}

function _throwError(logger: werelogs.Logger, msg: string, data?: LogDictionary) {
    logger.error(msg, data);
    throw Error(msg);
}

export default function TTLVCodec() {
    if (!new.target) {
        // @ts-ignore
        return new TTLVCodec();
    }

    const TagDecoder = JSON.parse(JSON.stringify(KMIPTags));
    const TagEncoder = {};

    const TypeDecoder = {};
    const TypeEncoder = {};

    const PrimitiveTypes = {
        '01': {
            name: 'Structure',
            decode: (logger, unusedTag, value) => {
                const funcName = 'Structure::decode';
                const length = value.length;
                let i = 0;
                const result: any[] = [];
                let diversion = null;
                while (i < length) {
                    const element = {};
                    const elementTag = value.slice(i, i + 3).toString('hex');
                    const elementType =
                          value.slice(i + 3, i + 4).toString('hex');
                    const elementLength = value.readUInt32BE(i + 4);
                    const property: any = {};
                    if (!TypeDecoder[elementType]) {
                        _throwError(logger,
                            'Unknown element type',
                            { funcName, elementTag, elementType });
                    }
                    const elementValue = value.slice(i + 8,
                        i + 8 + elementLength);
                    if (elementValue.length !== elementLength) {
                        _throwError(logger, 'BUG: Wrong buffer size',
                            { funcName, elementLength,
                                bufferLength: elementValue.length });
                    }
                    property.type = TypeDecoder[elementType].name;
                    property.value = TypeDecoder[elementType]
                        .decode(logger, elementTag, elementValue, diversion);
                    if (diversion) {
                        property.diversion = diversion;
                        diversion = null;
                    }
                    const tagInfo = TagDecoder[elementTag];
                    if (!tagInfo) {
                        logger.debug('Unknown element tag',
                            { funcName, elementTag });
                        property.tag = elementTag;
                        element['Unknown Tag'] = property;
                    } else {
                        element[tagInfo.name] = property;
                        if (tagInfo.name === 'Attribute Name') {
                            if (property.type !== 'TextString') {
                                _throwError(logger,
                                    'Invalide type',
                                    { funcName, type: property.type });
                            }
                            diversion = property.value;
                        }
                    }
                    i += Math.ceil((8 + elementLength) / 8.0) * 8;
                    result.push(element);
                }
                return result;
            },
            encode: (tagName, value) => {
                const tag = Buffer.from(TagEncoder[tagName].value, 'hex');
                const type = Buffer.from(TypeEncoder['Structure'].value, 'hex');
                const length = Buffer.alloc(4);
                let vectorLength = 0;
                let encodedValue: any[] = [];
                value.forEach(item => {
                    Object.keys(item).forEach(key => {
                        const itemTagName = key;
                        const itemType = item[key].type;
                        const itemValue = item[key].value;
                        const itemDiversion = item[key].diversion;
                        if (!TagEncoder[itemTagName]) {
                            throw Error(`Unknown Tag '${itemTagName}'`);
                        }
                        if (!TypeEncoder[itemType]) {
                            throw Error(`Unknown Type '${itemType}'`);
                        }
                        const itemResult: any[] =
                              TypeEncoder[itemType].encode(itemTagName,
                                  itemValue,
                                  itemDiversion);
                        encodedValue = encodedValue
                            .concat(_ttlvPadVector(itemResult));
                    });
                });
                encodedValue = _ttlvPadVector(encodedValue);
                encodedValue.forEach(buf => { vectorLength += buf.length; });
                length.writeUInt32BE(vectorLength);
                return _ttlvPadVector([tag, type, length, ...encodedValue]);
            },
        },
        '02': {
            name: 'Integer',
            decode: (logger, tag, value) => {
                const funcName = 'Integer::decode';
                const fixedLength = 4;
                if (fixedLength !== value.length) {
                    _throwError(logger,
                        'Length mismatch',
                        { funcName, fixedLength,
                            bufferLength: value.length });
                }
                return value.readUInt32BE(0);
            },
            encode: (tagName, value) => {
                const tag = Buffer.from(TagEncoder[tagName].value, 'hex');
                const type = Buffer.from(TypeEncoder['Integer'].value, 'hex');
                const length = Buffer.alloc(4);
                length.writeUInt32BE(4);
                const encodedValue = Buffer.alloc(4);
                encodedValue.writeUInt32BE(value);
                return _ttlvPadVector([tag, type, length, encodedValue]);
            },
        },
        '03': {
            name: 'LongInteger',
            decode: (logger, tag, value) => {
                const funcName = 'LongInteger::decode';
                const fixedLength = 8;
                if (fixedLength !== value.length) {
                    _throwError(logger,
                        'Length mismatch',
                        { funcName, fixedLength,
                            bufferLength: value.length });
                }
                const longUInt = UINT32_MAX * value.readUInt32BE(0) +
                      value.readUInt32BE(4);
                if (longUInt > Number.MAX_SAFE_INTEGER) {
                    _throwError(logger,
                        '53-bit overflow',
                        { funcName, longUInt });
                }
                return longUInt;
            },
            encode: (tagName, value) => {
                const tag = Buffer.from(TagEncoder[tagName].value, 'hex');
                const type =
                      Buffer.from(TypeEncoder['LongInteger'].value, 'hex');
                const length = Buffer.alloc(4);
                length.writeUInt32BE(8);
                const encodedValue = Buffer.alloc(8);
                encodedValue.writeUInt32BE(Math.floor(value / UINT32_MAX), 0);
                encodedValue.writeUInt32BE(value % UINT32_MAX, 4);
                return _ttlvPadVector([tag, type, length, encodedValue]);
            },
        },
        '04': {
            name: 'BigInteger',
            decode: (logger, tag, value) => value,
            encode: (tagName, value) => {
                const tag = Buffer.from(TagEncoder[tagName].value, 'hex');
                const type =
                      Buffer.from(TypeEncoder['BigInteger'].value, 'hex');
                const length = Buffer.alloc(4);
                length.writeUInt32BE(value.length);
                return _ttlvPadVector([tag, type, length, value]);
            },
        },
        '05': {
            name: 'Enumeration',
            decode: (logger, tag, value, diversion) => {
                const funcName = 'Enumeration::decode';
                const fixedLength = 4;
                if (fixedLength !== value.length) {
                    _throwError(logger,
                        'Length mismatch',
                        { funcName, fixedLength,
                            bufferLength: value.length });
                }
                const enumValue = value.toString('hex');
                const actualTag = diversion ? TagEncoder[diversion].value : tag;
                const enumInfo = TagDecoder[actualTag];
                if (!enumInfo ||
                    !enumInfo.enumeration ||
                    !enumInfo.enumeration[enumValue]) {
                    return { tag,
                        value: enumValue,
                        message: 'Unknown enumeration value',
                        diversion,
                    };
                }
                return enumInfo.enumeration[enumValue];
            },
            encode: (tagName, value, diversion) => {
                const tag = Buffer.from(TagEncoder[tagName].value, 'hex');
                const type =
                      Buffer.from(TypeEncoder['Enumeration'].value, 'hex');
                const length = Buffer.alloc(4);
                length.writeUInt32BE(4);
                const actualTag = diversion || tagName;
                const encodedValue =
                      Buffer.from(TagEncoder[actualTag].enumeration[value],
                          'hex');
                return _ttlvPadVector([tag, type, length, encodedValue]);
            },
        },
        '06': {
            name: 'Boolean',
            decode: (logger, tag, value) => {
                const funcName = 'Boolean::decode';
                const fixedLength = 8;
                if (fixedLength !== value.length) {
                    _throwError(logger,
                        'Length mismatch',
                        { funcName, fixedLength,
                            bufferLength: value.length });
                }
                const msUInt = value.readUInt32BE(0);
                const lsUInt = value.readUInt32BE(4);
                return !!(msUInt | lsUInt);
            },
            encode: (tagName, value) => {
                const tag = Buffer.from(TagEncoder[tagName].value, 'hex');
                const type = Buffer.from(TypeEncoder['Boolean'].value, 'hex');
                const length = Buffer.alloc(4);
                length.writeUInt32BE(8);
                const encodedValue = Buffer.alloc(8);
                encodedValue.writeUInt32BE(0, 0);
                encodedValue.writeUInt32BE(value ? 1 : 0, 4);
                return _ttlvPadVector([tag, type, length, encodedValue]);
            },
        },
        '07': {
            name: 'TextString',
            decode: (logger, tag, value) => value.toString('utf8'),
            encode: (tagName, value) => {
                const tag = Buffer.from(TagEncoder[tagName].value, 'hex');
                const type =
                      Buffer.from(TypeEncoder['TextString'].value, 'hex');
                const length = Buffer.alloc(4);
                length.writeUInt32BE(value.length);
                return _ttlvPadVector([tag, type, length,
                    Buffer.from(value, 'utf8')]);
            },
        },
        '08': {
            name: 'ByteString',
            decode: (logger, tag, value) => value,
            encode: (tagName, value) => {
                const tag = Buffer.from(TagEncoder[tagName].value, 'hex');
                const type =
                      Buffer.from(TypeEncoder['ByteString'].value, 'hex');
                const length = Buffer.alloc(4);
                length.writeUInt32BE(value.length);
                return _ttlvPadVector([tag, type, length, value]);
            },
        },
        '09': {
            name: 'Date-Time',
            decode: (logger, tag, value) => {
                const funcName = 'Date-Time::decode';
                const fixedLength = 8;
                if (fixedLength !== value.length) {
                    _throwError(logger,
                        'Length mismatch',
                        { funcName, fixedLength,
                            bufferLength: value.length });
                }
                const d = new Date(0);
                const utcSeconds = UINT32_MAX * value.readUInt32BE(0) +
                      value.readUInt32BE(4);
                if (utcSeconds > Number.MAX_SAFE_INTEGER) {
                    _throwError(logger,
                        '53-bit overflow',
                        { funcName, utcSeconds });
                }
                d.setUTCSeconds(utcSeconds);
                return d;
            },
            encode: (tagName, value) => {
                const tag = Buffer.from(TagEncoder[tagName].value, 'hex');
                const type = Buffer.from(TypeEncoder['Date-Time'].value, 'hex');
                const length = Buffer.alloc(4);
                length.writeUInt32BE(8);
                const encodedValue = Buffer.alloc(8);
                const ts = value.getTime() / 1000;
                encodedValue.writeUInt32BE(Math.floor(ts / UINT32_MAX), 0);
                encodedValue.writeUInt32BE(ts % UINT32_MAX, 4);
                return _ttlvPadVector([tag, type, length, encodedValue]);
            },
        },
        '0a': {
            name: 'Interval',
            decode: (logger, tag, value) => {
                const funcName = 'Interval::decode';
                const fixedLength = 4;
                if (fixedLength !== value.length) {
                    _throwError(logger,
                        'Length mismatch',
                        { funcName, fixedLength,
                            bufferLength: value.length });
                }
                return value.readInt32BE(0);
            },
            encode: (tagName, value) => {
                const tag = Buffer.from(TagEncoder[tagName].value, 'hex');
                const type = Buffer.from(TypeEncoder['Interval'].value, 'hex');
                const length = Buffer.alloc(4);
                length.writeUInt32BE(4);
                const encodedValue = Buffer.alloc(4);
                encodedValue.writeUInt32BE(value);
                return _ttlvPadVector([tag, type, length, encodedValue]);
            },
        },
    };


    /* Construct TagDecoder */
    Object.keys(TagDecoder).forEach(key => {
        const element: any = {};
        element.value = key;
        if (TagDecoder[key]['enumeration']) {
            const enumeration = {};
            Object.keys(TagDecoder[key]['enumeration']).forEach(enumValue => {
                const enumKey = TagDecoder[key]['enumeration'][enumValue];
                enumeration[enumKey] = enumValue;
            });
            element.enumeration = enumeration;
        }
        TagEncoder[TagDecoder[key].name] = element;
    });


    /* Construct TypeDecoder and TypeEncoder */
    Object.keys(PrimitiveTypes).forEach(value => {
        const name = PrimitiveTypes[value].name;
        const encode = PrimitiveTypes[value].encode;
        const decode = PrimitiveTypes[value].decode;
        TypeDecoder[value] = { name, decode };
        TypeEncoder[name] = { value, encode };
    });


    /* Public Methods Definition */
    // @ts-ignore
    this.encodeMask = (tagName, value) => {
        let mask = 0;
        value.forEach(item => {
            const enumValue = TagEncoder[tagName].enumeration[item];
            if (!enumValue) {
                throw Error('Invalid bit name');
            }
            mask |= parseInt(enumValue, 16);
        });
        return mask;
    };

    // @ts-ignore
    this.decodeMask = (tagName, givenMask) => {
        let mask = givenMask;
        const value: any[] = [];
        const tag = TagEncoder[tagName].value;
        Object.keys(TagDecoder[tag].enumeration).forEach(key => {
            const bit = Buffer.from(key, 'hex').readUInt32BE(0);
            if (bit & mask) {
                mask &= ~bit;
                value.push(TagDecoder[tag].enumeration[key]);
            }
        });
        return value;
    };

    // @ts-ignore
    this.decode = (logger, rawMessage) => {
        const messageContent =
              TypeDecoder['01'].decode(logger, null, rawMessage);
        return new KMIPMessage(messageContent);
    };

    // @ts-ignore
    this.encode = message => {
        const value = message.content;
        let result: any[] = [];
        value.forEach(item => {
            Object.keys(item).forEach(key => {
                if (!TagEncoder[key]) {
                    throw Error(`Unknown Tag '${key}'`);
                }
                const type = item[key].type;
                if (!TypeEncoder[type]) {
                    throw Error(`Unknown Type '${type}'`);
                }
                const itemValue = TypeEncoder[type].encode(key,
                    item[key].value,
                    item[key].diversion);
                result = result.concat(_ttlvPadVector(itemValue));
            });
        });
        return Buffer.concat(_ttlvPadVector(result));
    };

    // @ts-ignore
    this.mapExtension = (tagName, tagValue) => {
        const tagValueStr = tagValue.toString(16);
        TagDecoder[tagValueStr] = { name: tagName };
        TagEncoder[tagName] = { value: tagValueStr };
    };

    // @ts-ignore
    return this;
}
