function markerFilterMPU(allMarkers, array) {
    const { keyMarker, uploadIdMarker } = allMarkers;

    // 1. if the item key matches the keyMarker and an uploadIdMarker exists,
    // find the first uploadId in the array that is alphabetically after
    // uploadIdMarker
    // 2. if the item key does not match the keyMarker, find the first uploadId
    // in the array that is alphabetically after keyMarker
    const firstUnfilteredIndex = array.findIndex(
        item => (uploadIdMarker && item.key === keyMarker ?
             item.uploadId > uploadIdMarker :
             item.key > keyMarker));
    return firstUnfilteredIndex !== -1 ? array.slice(firstUnfilteredIndex) : [];
}

function prefixFilter(prefix, array) {
    for (let i = 0; i < array.length; i++) {
        if (array[i].indexOf(prefix) !== 0) {
            array.splice(i, 1);
            i--;
        }
    }
    return array;
}

function isKeyInContents(responseObject, key) {
    return responseObject.Contents.some(val => val.key === key);
}

module.exports = {
    markerFilterMPU,
    prefixFilter,
    isKeyInContents,
};
