const assert = require('assert');

class ColdStorageFileInterface {

    updateAmzStorageClass(bucketName, objName, objMD, storageClass, log, cb) {

        log.debug('does not support updateAmzStorageClass', {
            implName: this.implName,
        });
        return cb(errors.NotImplemented);
    }

    updateRestoreExpiration(bucketName, objName, objMD, requestParam, log, cb){
        log.debug('does not support updateRestoreExpiration', {
            implName: this.implName,
        });
        return cb(errors.NotImplemented);
    }

    updateRestoreOngoing(bucketName, objName, objMD, requestParam, log, cb){
        log.debug('does not support updateRestoreOngoing', {
            implName: this.implName,
        });
        return cb(errors.NotImplemented);
    }

    deleteAmzRestore(bucketName, objName, objMD, log, cb){
        log.debug('does not support deleteAmzRestore', {
            implName: this.implName,
        });
        return cb(errors.NotImplemented);
    }

}

module.exports = ColdStorageFileInterface;