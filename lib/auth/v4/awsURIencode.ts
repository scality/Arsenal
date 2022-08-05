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
    /**
     * Duplicate query params are not suppported by AWS S3 APIs. These params
     * are parsed as Arrays by Node.js HTTP parser which breaks this method
     */
     if (typeof input !== 'string') {
        return '';
    }

    // precalc slash and star based on configs
    const slash = encodeSlash === undefined || encodeSlash ? '%2F' : '/';
    const star = noEncodeStar !== undefined && noEncodeStar ? '*' : '%2A';
    const encoded: string[] = [];

    const charArray = Array.from(input);
    for (const ch of charArray) {
        switch (true) {
            case ch >= 'A' && ch <= 'Z':
            case ch >= 'a' && ch <= 'z':
            case ch >= '0' && ch <= '9':
            case ch === '-':
            case ch === '_':
            case ch === '~':
            case ch === '.':
                encoded.push(ch);
                break;
            case ch === '/':
                encoded.push(slash);
                break;
            case ch === '*':
                encoded.push(star);
                break;
            case ch === ' ':
                encoded.push('%20');
                break;
            default:
                encoded.push(_toHexUTF8(ch));
                break;
        }
    }
    return encoded.join('');
}
