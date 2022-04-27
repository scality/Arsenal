import tls from 'tls';
import TransportTemplate, { Options } from './TransportTemplate';

export default class TlsTransport extends TransportTemplate {
    constructor(options: Options) {
        super(tls, options);
    }
}
