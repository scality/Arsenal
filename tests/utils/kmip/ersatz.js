'use strict'; // eslint-disable-line


const logger = {
    info: () => {},
    debug: () => {},
    warn: () => {},
    error: () => {},
};

/* Fake tls AND socket objects, duck type */
class EchoChannel {
    constructor() {
        this.clogged = false;
        this.eventHandler = {};
        this.deferedSignal = {};
    }

    /* tls object members substitutes */

    connect(port, options, cb) {
        process.nextTick(cb);
        return this;
    }

    on(event, cb) {
        this.eventHandler[event] = cb;
        if (this.deferedSignal[event] &&
            this.deferedSignal[event].length > 0) {
            this.deferedSignal[event].forEach(this.eventHandler[event]);
            this.deferedSignal[event] = undefined;
        }
        return this;
    }

    /* socket object members substitutes */

    cork() {
        return this;
    }

    uncork() {
        return this;
    }

    write(data) {
        if (!this.clogged) {
            return this.emit('data', data);
        }
        return this;
    }

    end() {
        return this.emit('end');
    }

    /* Instrumentation member functions */

    emit(event, data) {
        if (this.eventHandler[event]) {
            this.eventHandler[event](data);
        } else {
            if (!this.deferedSignal[event]) {
                this.deferedSignal[event] = [];
            }
            this.deferedSignal[event].push(data);
        }
        return this;
    }

    clog() {
        this.clogged = true;
        return this;
    }

}

module.exports = { logger, EchoChannel };
