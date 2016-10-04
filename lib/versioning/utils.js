const VSConst = require('./constants').VersioningConstants;

const masterVersionPrefixLength =
    VSConst.VERSIONING_AFFIXES.MASTER_VERSION_PREFIX.length;
const otherVersionPrefixLength =
    VSConst.VERSIONING_AFFIXES.OTHER_VERSION_PREFIX.length;
const SEP = VSConst.VERSIONING_AFFIXES.SEPARATOR;
module.exports.VersioningUtils = {
    /* eslint-disable no-param-reassign */

    // using explicit encode and decode functions for version object to enable
    // future extensions, such as attatching external information to the string
    // value from request instead of having to parse and stringify the value
    // Example: "prefixlen_{prefix}{value_from_request}"
    encodeVersion: version => JSON.stringify(version),
    decodeVersion: version => JSON.parse(version),
    // generic attribute getter/settter to manipulate the value's attributes,
    // helping us from restricting ourselves to hardcoding arbitrary attributes
    // eslint-disable-next-line no-param-reassignment
    setattr: (version, attr, value) => { version[attr] = value; },
    getattr: (version, attr) => version[attr],
    // specific attribute getters/setters
    setts: (version, ts) => { version[VSConst.ATTR_VERSION_ID] = ts; },
    getts: version => version[VSConst.ATTR_VERSION_ID],
    setvv: (version, vv) => { version[VSConst.ATTR_VERSION_VECTOR] = vv; },
    getvv: version => version[VSConst.ATTR_VERSION_VECTOR],
    setdm: (version, dm) => { version[VSConst.ATTR_DELETE_MARKER] = dm; },
    getdm: version => version[VSConst.ATTR_DELETE_MARKER],
    // more verbose
    setVersionId: (version, versionId) => {
        version[VSConst.ATTR_VERSION_ID] = versionId;
    },
    getVersionId: version => version[VSConst.ATTR_VERSION_ID],
    setVersionVector: (version, versionVector) => {
        version[VSConst.ATTR_VERSION_VECTOR] = versionVector;
    },
    getVersionVector: version => version[VSConst.ATTR_VERSION_VECTOR],
    setDeleteMarker: (version, deleteMarker) => {
        version[VSConst.ATTR_DELETE_MARKER] = deleteMarker;
    },
    getDeleteMarker: version => version[VSConst.ATTR_DELETE_MARKER],
    isDeleteMarker: version => version[VSConst.ATTR_DELETE_MARKER],
    // functions to manipulate the versioning keys
    getObjectNameFromMasterKey: masterKey =>
        masterKey.slice(masterVersionPrefixLength),
    getObjectNameFromVersionKey: versionKey => {
        const indexOfVersionId = versionKey.lastIndexOf(SEP);
        return versionKey.slice(otherVersionPrefixLength, indexOfVersionId);
    },
    getObjectNameAndVersionIdFromVersionKey: versionKey => {
        const indexOfVersionId = versionKey.lastIndexOf(SEP);
        const objectName =
            versionKey.slice(otherVersionPrefixLength, indexOfVersionId);
        const versionId = versionKey.slice(indexOfVersionId + 1);
        return { objectName, versionId };
    },
    /* eslint-enable no-param-reassign */
};
