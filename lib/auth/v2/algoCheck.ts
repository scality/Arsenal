export default function algoCheck(signatureLength: number) {
    let algo: 'sha256' | 'sha1';
    // If the signature sent is 44 characters,
    // this means that sha256 was used:
    // 44 characters in base64
    const SHA256LEN = 44;
    const SHA1LEN = 28;
    if (signatureLength === SHA256LEN) {
        algo = 'sha256';
    }
    if (signatureLength === SHA1LEN) {
        algo = 'sha1';
    }
    // @ts-ignore
    return algo;
}
