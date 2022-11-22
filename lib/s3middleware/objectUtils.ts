export const getMD5Buffer = (base64MD5: WithImplicitCoercion<string> | Uint8Array) =>
    base64MD5 instanceof Uint8Array ? base64MD5 : Buffer.from(base64MD5, 'base64')

export const getHexMD5 = (base64MD5: WithImplicitCoercion<string> | Uint8Array) =>
    getMD5Buffer(base64MD5).toString('hex');

export const getBase64MD5 = (hexMD5: WithImplicitCoercion<string>) =>
    Buffer.from(hexMD5, 'hex').toString('base64');
