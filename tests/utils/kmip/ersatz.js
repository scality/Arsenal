'use strict'; // eslint-disable-line
/* eslint new-cap: "off" */


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

class MirrorChannel extends EchoChannel {
    constructor(KMIPClass, Codec) {
        super();
        this.codec = new Codec({});
        this.KMIP = KMIPClass;
    }
    write(data) {
        const request = this.codec.decode(logger, data);
        const uniqueBatchItemID = request.lookup(
            'Request Message/Batch Item/Unique Batch Item ID')[0];
        const requestPayload = request.lookup(
            'Request Message/Batch Item/Request Payload')[0];
        const requestProtocolVersionMinor = request.lookup(
            'Request Message/Request Header/Protocol Version/' +
                'Protocol Version Minor')[0];
        const requestProtocolVersionMajor = request.lookup(
            'Request Message/Request Header/Protocol Version/' +
                'Protocol Version Major')[0];
        const requestOperation = request.lookup(
            'Request Message/Batch Item/Operation')[0];
        const response = this.KMIP.Message([
            this.KMIP.Structure('Response Message', [
                this.KMIP.Structure('Response Header', [
                    this.KMIP.Structure('Protocol Version', [
                        this.KMIP.Integer('Protocol Version Major',
                                          requestProtocolVersionMajor),
                        this.KMIP.Integer('Protocol Version Minor',
                                          requestProtocolVersionMinor),
                    ]),
                    this.KMIP.DateTime('Time Stamp', new Date),
                    this.KMIP.Integer('Batch Count', 1),
                ]),
                this.KMIP.Structure('Batch Item', [
                    this.KMIP.Enumeration('Operation', requestOperation),
                    this.KMIP.ByteString('Unique Batch Item ID',
                                         uniqueBatchItemID),
                    this.KMIP.Enumeration('Result Status', 'Success'),
                    this.KMIP.Structure('Response Payload', requestPayload),
                ]),
            ]),
        ]);
        super.write(this.codec.encode(response));
        return this;
    }
}

module.exports = { logger, EchoChannel, MirrorChannel };
