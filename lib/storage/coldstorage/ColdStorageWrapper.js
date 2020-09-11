const errors = require('../../errors');

const ColdStorageFileInterface = require('./file/ColdStorageFileInterface');

class ColdStorageWrapper {
    constructor(clientName, params, logger) {
        if (clientName === 'file') {
            this.client = new ColdStorageFileInterface(params, logger);
            this.implName = 'coldstorageFile';
        }
    }

    setup(done) {
        if (this.client.setup) {
            return this.client.setup(done);
        }
        return process.nextTick(done);
    }

    updateAmzStorageClass(bucketName, objName, objMD, storageClass, log, cb) {
        if (this.client.updateAmzStorageClass){
            log.debug('try to update x-amz-storage-class');
            this.client.updateAmzStorageClass(bucketName, objName, objMD, storageClass, log, err => {
                if (err) {
                    log.debug('error from metadata', { implName: this.implName,
                        error: err });
                    return cb(err);
                }
                log.trace('update x-amz-storage-class complete. : ' + storageClass);

                return cb();
            });
        }
    }

    updateRestoreExpiration(bucketName, objName, objMD, log, cb){
        if (this.client.updateRestoreExpiration){
            log.debug('try to update restore enpire-date');
            this.client.updateRestoreExpiration(bucketName, objName, objMD, storageClass, log, err => {
                if (err) {
                    log.debug('error from metadata', { implName: this.implName,
                        error: err });
                    return cb(err);
                }
                log.trace('update restore enpire-date complete. : ' + storageClass);

                return cb();
            });
        }     
    }

    updateRestoreOngoing(bucketName, objName, objMD, updateParam, log, cb){
        if (this.client.updateRestoreOngoing){
            log.debug('try to update restore ongoing-request');
            this.client.updateRestoreOngoing(bucketName, objName, objMD, updateParam, log, err => {
                if (err) {
                    log.debug('error from metadata', { implName: this.implName,
                        error: err });
                    return cb(err);
                }
                log.trace('update restore ongoing-request complete. : ' + updateParam);

                return cb();
            });
        }   
    }
   
    deleteAmzRestore(bucketName, objName, objMD, log, cb){
        if (this.client.deleteAmzRestore){
            log.debug('try to delete x-amz-restore');
            this.client.deleteAmzRestore(bucketName, objName, objMD, log, err => {
                if (err) {
                    log.debug('error from metadata', { implName: this.implName,
                        error: err });
                    return cb(err);
                }
                log.trace('delete x-amz-restore complete.');

                return cb();
            });
        }     
    }


    switch(newClient, cb) {
        this.client = newClient;
        return cb();
    }

    close(cb) {
        if (typeof this.client.close === 'function') {
            return this.client.close(cb);
        }
        return cb();
    }

}

module.exports = ColdStorageWrapper;