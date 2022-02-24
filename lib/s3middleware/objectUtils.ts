export const getHexMD5 = (base64MD5) => {
    return Buffer.from(base64MD5, 'base64').toString('hex');
};

export const getBase64MD5 = (hexMD5) => {
    return Buffer.from(hexMD5, 'hex').toString('base64');
};
