import * as tls from 'tls';
import TransportTemplate from './TransportTemplate';

export default class TlsTransport extends TransportTemplate {
    constructor(options) {
        super(tls, options);
    }
}
