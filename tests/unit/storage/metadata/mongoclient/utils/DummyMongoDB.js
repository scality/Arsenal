const testError = new Error('test error');

class DummyCollection {
    constructor(name, isFail) {
        this.s = {
            name,
        };
        this.fail = isFail;
        this.retQueue = [];
    }

    setReturnValues(retArray) {
        this.retQueue.push(...retArray);
    }

    aggregate() {
        return {
            toArray: cb => {
                if (this.retQueue.length <= 0) {
                    return cb(null, []);
                }
                const retVal = this.retQueue[0];
                this.retQueue = this.retQueue.slice(1);
                if (retVal instanceof Error) {
                    return cb(retVal);
                }
                return cb(null, retVal);
            },
        };
    }

    bulkWrite(cmds, opt, cb) {
        process.stdout.write('mock mongodb.bulkWrite call\n');
        if (this.fail) {
            return cb(testError);
        }
        return cb();
    }

    update(target, doc, opt, cb) {
        process.stdout.write('mock mongodb.update call\n');
        if (this.fail) {
            return cb(testError);
        }
        return cb();
    }

    find() {
        return {
            toArray: cb => {
                if (this.retQueue.length <= 0) {
                    return cb(null, []);
                }
                const retVal = this.retQueue[0];
                this.retQueue = this.retQueue.slice(1);
                if (retVal instanceof Error) {
                    return cb(retVal);
                }
                return cb(null, retVal);
            },
        };
    }

    findOne(query, opt, cb) {
        if (typeof opt === 'function' && cb === undefined) {
            // eslint-disable-next-line no-param-reassign
            cb = opt;
        }
        if (this.retQueue.length <= 0) {
            return cb(null);
        }
        const retVal = this.retQueue[0];
        this.retQueue = this.retQueue.slice(1);
        if (retVal instanceof Error) {
            return cb(retVal);
        }
        return cb(null, retVal);
    }
}

class DummyMongoDB {
    contructor() {
        this.fail = false;
        this.returnQueue = [];
    }

    reset() {
        this.fail = false;
        this.returnQueue = [];
    }

    setReturnValues(retValues) {
        this.returnQueue.push(...retValues);
    }

    collection(name) {
        const c = new DummyCollection(name, this.fail);
        c.setReturnValues(this.returnQueue);
        return c;
    }
}

module.exports = DummyMongoDB;
