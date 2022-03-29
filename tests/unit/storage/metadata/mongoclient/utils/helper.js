const basicMD = {
    'content-length': 0,
    'key': '',
    'versionId': '',
    'replicationInfo': {
        backends: [], // site, status
    },
    'dataStoreName': 'mongotest',
};

function generateMD(objKey, size, versionId, repBackends) {
    const retMD = JSON.parse(JSON.stringify(basicMD));
    retMD.key = objKey;
    retMD['content-length'] = size;
    retMD.versionId = versionId;
    if (repBackends && Array.isArray(repBackends)) {
        retMD.replicationInfo.backends.push(...repBackends);
    }
    return retMD;
}

module.exports = {
    generateMD,
};
