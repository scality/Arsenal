// Ring backend that persists on Sproxyd and offsets on ZK
const async = require('async');
const { pipeline } = require('stream');
const MemoryStream = require('memorystream');
const zlib = require('zlib');
const zookeeper = require('node-zookeeper-client');
const Sproxy = require('sproxydclient');
const werelogs = require('werelogs');

werelogs.configure({
    level: 'info',
    dump: 'error',
});

class PersistRingInterface {

    constructor(params) {
        let zkConnectionString = 'localhost:2181';
        if (params && params.zkConnectionString !== undefined) {
            zkConnectionString = params.zkConnectionString;
        }
        this.zkPath = '/persist-ring-interface';
        if (params && params.zkPath !== undefined) {
            this.zkPath = params.zkPath;
        }
        let spPath = '/proxy/DC1/'; // do not forget "/" at the end !!!
        if (params && params.spPath !== undefined) {
            spPath = params.spPath;
        }
        let spBootstrap = ['localhost:8181'];
        if (params && params.spBootstrap !== undefined) {
            spBootstrap = params.spBootstrap;
        }
        this.reqUid = 'persist-ring-interface-req-uid';
        this.logger = new werelogs.Logger('PersistRingInterface');
        this.zkClient = zookeeper.createClient(zkConnectionString);
        this.zkClient.connect();
        this.zkClient.on('error', err => {
            this.logger.error('error connecting', { err });
        });
        this.zkClient.once('connected', () => {
            this.logger.info('connected');
        });
        this.spClient = new Sproxy({
            bootstrap: spBootstrap,
            path: spPath,
        });
    }

    getZKPath(filterName) {
        return `${this.zkPath}/${filterName}`;
    }

    load(filterName, persistData, cb) {
        this.logger.info(`loading ${filterName}`);
        async.waterfall([
            /*
             * Check of we have an existing Zookeeper node
             */
            next => {
                this.zkClient.getData(
                    this.getZKPath(filterName),
                    (err, data) => {
                        if (err) {
                            if (err.name === 'NO_NODE') {
                                this.logger.info(`${filterName} non-existent`);
                            } else {
                                this.logger.error(`getData ${filterName} error`, { err });
                            }
                            return next(err);
                        }
                        return next(null, data);
                    });
            },
            /*
             * Extract the Sproxyd key from the Zookeeper node.
             * Read the key from Sproxyd.
             */
            (data, next) => {
                const _data = JSON.parse(data.toString());
                this.spClient.get(
                    _data.key,
                    undefined,
                    this.reqUid,
                    (err, stream) => {
                        if (err) {
                            this.logger.error(`sproxyd ${filterName} error`, { err });
                            return next(err);
                        }
                        return next(null, _data, stream);
                    });
            },
            /*
             * Uncompress the stream in memory
             */
            (_data, stream, next) => {
                const ostream = new MemoryStream();
                pipeline(
                    stream,
                    zlib.createGunzip(),
                    ostream,
                    err => {
                        if (err) {
                            this.logger.error(`pipeline ${filterName} error`, { err });
                            return next(err);
                        }
                        return next(null, _data, ostream);
                    });
            },
            /*
             * Load the state from uncompressed stream
             */
            (_data, stream, next) => {
                persistData.loadState(stream, err => {
                    if (err) {
                        this.logger.error(`load ${filterName} error`, { err });
                        return next(err);
                    }
                    this.logger.info(`${filterName} loaded: offset ${_data.offset}`);
                    return next(null, _data);
                });
            }], (err, _data) => {
            if (err) {
                if (err.name === 'NO_NODE') {
                    return cb(null, undefined);
                }
                this.logger.error(`load ${filterName} error`, { err });
                return cb(err);
            }
            return cb(null, _data.offset);
        });
    }

    save(filterName, persistData, offset, cb) {
        this.logger.info(`saving ${filterName} offset ${offset}`);
        async.waterfall([
            /*
             * Save the state in a memory stream
             */
            next => {
                const stream = new MemoryStream();
                persistData.saveState(
                    stream, err => {
                        if (err) {
                            this.logger.error(`save ${filterName} error`, { err });
                            return next(err);
                        }
                        return next(null, stream);
                    });
            },
            /*
             * Compress the state in memory
             */
            (stream, next) => {
                const ostream = new MemoryStream();
                pipeline(
                    stream,
                    zlib.createGzip(),
                    ostream,
                    err => {
                        if (err) {
                            this.logger.error(`pipeline ${filterName} error`, { err });
                            return next(err);
                        }
                        return next(null, ostream);
                    });
            },
            /*
             * Store the state in Sproxyd
             */
            (stream, next) => {
                const parameters = {
                    filterName,
                    namespace: 'persist-ring-interface',
                    owner: 'persist-ring-interface',
                };
                const size = stream._readableState.length;
                this.spClient.put(
                    stream,
                    size,
                    parameters,
                    this.reqUid,
                    (err, key) => {
                        if (err) {
                            this.logger.error(`sproxyd put ${filterName} error`, { err });
                            return next(err);
                        }
                        const newData = {};
                        newData.offset = offset;
                        newData.key = key;
                        return next(null, newData);
                    });
            },
            /*
             * Check if the Zookeeper node exists
             */
            (newData, next) => {
                this.zkClient.exists(
                    this.getZKPath(filterName),
                    (err, stat) => {
                        if (err) {
                            this.logger.error(`exists ${filterName} error`, { err });
                            return next(err);
                        }
                        let doesExist = false;
                        if (stat) {
                            doesExist = true;
                        }
                        return next(null, newData, doesExist);
                    });
            },
            /*
             * If the Zookeeper node exists read it.
             * Else create it.
             */
            (newData, doesExist, next) => {
                if (doesExist) {
                    this.zkClient.getData(
                        this.getZKPath(filterName),
                        (err, _oldData) => {
                            if (err) {
                                this.logger.error(`getData ${filterName} error`, { err });
                                return next(err);
                            }
                            const oldData = JSON.parse(_oldData);
                            return next(null, newData, oldData);
                        });
                } else {
                    this.zkClient.mkdirp(
                        this.getZKPath(filterName),
                        null,
                        err => {
                            if (err) {
                                this.logger.error(`mkdirp ${filterName} error`, { err });
                                return next(err);
                            }
                            return next(null, newData, null);
                        });
                }
            },
            /*
             * Store the context in the Zookeeper node and delete the old sproxyd key.
             */
            (newData, oldData, next) => {
                const _newData = JSON.stringify(newData);
                this.zkClient.setData(
                    this.getZKPath(filterName),
                    Buffer.from(_newData),
                    err => {
                        if (err) {
                            this.logger.error(`setData ${filterName} error`, { err });
                            return cb(err);
                        }
                        this.logger.info(`${filterName} saved: new key ${newData.key} offset ${offset}`);
                        if (oldData) {
                            this.spClient.delete(
                                oldData.key,
                                this.reqUid,
                                err => {
                                    if (err) {
                                        this.logger.error(
                                            `sproxyd del ${filterName} old key ${oldData.key} error`,
                                            { err });
                                        return next(err);
                                    }
                                    return next();
                                });
                        } else {
                            return next();
                        }
                        return undefined;
                    });
            }], err => {
            if (err) {
                this.logger.error(`save ${filterName} error`, { err });
                return cb(err);
            }
            return cb();
        });
    }
}

module.exports = PersistRingInterface;
