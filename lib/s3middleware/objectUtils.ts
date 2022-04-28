export const getHexMD5 = (base64MD5: WithImplicitCoercion<string>) =>
    Buffer.from(base64MD5, 'base64').toString('hex');

export const getBase64MD5 = (hexMD5: WithImplicitCoercion<string>) =>
    Buffer.from(hexMD5, 'hex').toString('base64');
