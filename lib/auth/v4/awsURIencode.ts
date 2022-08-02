/*
AWS's URI encoding rules:
URI encode every byte. Uri-Encode() must enforce the following rules:

URI encode every byte except the unreserved characters:
'A'-'Z', 'a'-'z', '0'-'9', '-', '.', '_', and '~'.
The space character is a reserved character and must be
encoded as "%20" (and not as "+").
Each Uri-encoded byte is formed by a '%' and the two-digit
hexadecimal value of the byte.
Letters in the hexadecimal value must be uppercase, for example "%1A".
Encode the forward slash character, '/',
everywhere except in the object key name.
For example, if the object key name is photos/Jan/sample.jpg,
the forward slash in the key name is not encoded.
See http://docs.aws.amazon.com/AmazonS3/latest/API/sig-v4-header-based-auth.html
*/

// converts utf8 character to hex and pads "%" before every two hex digits
function _toHexUTF8(char: string) {
    const hexRep = Buffer.from(char, 'utf8').toString('hex').toUpperCase();
    let res = '';
    hexRep.split('').forEach((v, n) => {
        // pad % before every 2 hex digits
        if (n % 2 === 0) {
            res += '%';
        }
        res += v;
    });
    return res;
}

export default function awsURIencode(
    input: string,
    encodeSlash?: boolean,
    noEncodeStar?: boolean
) {
    const encSlash = encodeSlash === undefined ? true : encodeSlash;
    let encoded = '';
    /**
     * Duplicate query params are not suppported by AWS S3 APIs. These params
     * are parsed as Arrays by Node.js HTTP parser which breaks this method
    */
    if (typeof input !== 'string') {
        return encoded;
    }
    let charArray = Array.from(input);
    for (let i = 0; i < charArray.length; i++) {
        let ch = charArray[i];
        if ((ch >= 'A' && ch <= 'Z') ||
            (ch >= 'a' && ch <= 'z') ||
            (ch >= '0' && ch <= '9') ||
            ch === '_' || ch === '-' ||
            ch === '~' || ch === '.') {
            encoded = encoded.concat(ch);
        } else if (ch === ' ') {
            encoded = encoded.concat('%20');
        } else if (ch === '/') {
            encoded = encoded.concat(encSlash ? '%2F' : ch);
        } else if (ch === '*') {
            encoded = encoded.concat(noEncodeStar ? '*' : '%2A');
        } else {
            if (ch >= '\uD800' && ch <= '\uDBFF') {
                // If this character is a high surrogate peek the next character
                // and join it with this one if the next character is a low
                // surrogate.
                // Otherwise the encoded URI will contain the two surrogates as
                // two distinct UTF-8 sequences which is not valid UTF-8.
                if (i + 1 < input.length) {
                    const ch2 = input.charAt(i + 1);
                    if (ch2 >= '\uDC00' && ch2 <= '\uDFFF') {
                        i++;
                        ch += ch2;
                    }
                }
            }
            encoded = encoded.concat(_toHexUTF8(ch));
        }
    }
    return encoded;
}
