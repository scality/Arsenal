const objectUtils = {};

objectUtils.getHexMD5 = base64MD5 =>
    Buffer.from(base64MD5, 'base64').toString('hex');

objectUtils.getBase64MD5 = hexMD5 =>
    Buffer.from(hexMD5, 'hex').toString('base64');

module.exports = objectUtils;
