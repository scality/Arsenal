/* eslint-disable no-console */
const fs = require('fs');
const { ArgumentParser } = require('argparse');
const BucketdOplogInterface = require('../lib/storage/metadata/oplog/BucketdOplogInterface');
const MongoOplogInterface = require('../lib/storage/metadata/oplog/MongoOplogInterface');
const PersistMemInterface = require('../lib/storage/metadata/oplog/PersistMemInterface');
const PersistFileInterface = require('../lib/storage/metadata/oplog/PersistFileInterface');
const PersistRingInterface = require('../lib/storage/metadata/oplog/PersistRingInterface');

const parser = new ArgumentParser({
    description: 'Oplog CLI tool',
});

parser.add_argument('-v', '--verbose', { action: 'store_true' });
parser.add_argument('-c', '--config-file', { help: 'config file' });
parser.add_argument('--oplog-interface', { help: 'bucketd|mongo' });
parser.add_argument('--persist', { help: 'mem|file|ring' });
parser.add_argument('--bucket', { help: 'bucket' });
parser.add_argument('--start', { action: 'store_true' });

const args = parser.parse_args();

class PersistDataInterface {

    constructor() {
        this.data = null;
    }

    initState(cb) {
        this.data = {};
        return process.nextTick(cb);
    }

    loadState(stream, cb) {
        const chunks = [];
        stream.on('data', chunk => {
            chunks.push(chunk);
        });
        stream.on('end', () => {
            this.data = JSON.parse(Buffer.concat(chunks));
            return process.nextTick(cb);
        });
    }

    saveState(stream, cb) {
        stream.write(JSON.stringify(this.data));
        stream.end();
        return process.nextTick(cb);
    }

    updateState(addQueue, deleteQueue, cb) {
        console.log('addQueue', addQueue, 'deleteQueue', deleteQueue);
        return process.nextTick(cb);
    }
}

let config = {};

if (args.config_file !== undefined) {
    config = JSON.parse(fs.readFileSync(args.config_file, 'utf8'));
}

let persist;
if (args.persist === 'mem') {
    persist = new PersistMemInterface(config.persistMem);
} else if (args.persist === 'file') {
    persist = new PersistFileInterface(config.persistFile);
} else if (args.persist === 'ring') {
    persist = new PersistRingInterface(config.persistRing);
} else {
    console.error(`invalid persist ${args.persist}`);
    process.exit(1);
}

let params = {
    persist,
    persistData: new PersistDataInterface(),
};

let oplogInterface;
if (args.oplog_interface === 'bucketd') {
    params = Object.assign(params, config.bucketdOplog);
    oplogInterface = new BucketdOplogInterface(params);
} else if (args.oplog_interface === 'mongo') {
    params = Object.assign(params, config.mongoOplog);
    oplogInterface = new MongoOplogInterface(params);
} else {
    console.error(`invalid oplog-interface ${args.oplog_interface}`);
    process.exit(1);
}

if (args.start) {
    if (args.bucket === undefined) {
        console.error('please provide bucket');
        process.exit(1);
    }
    oplogInterface.start(
        {
            filterName: args.bucket,
            filterType: 'bucket',
            bucket: {
                bucketName: args.bucket,
            },
        },
        err => {
            if (err) {
                console.error(err);
                process.exit(1);
            }
            console.log('exiting...');
            return;
        });
} else {
    console.error('please provide an option');
    process.exit(1);
}
