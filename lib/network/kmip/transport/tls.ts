'use strict'; // eslint-disable-line

import tls from 'tls';
import TransportTemplate, { Options } from './TransportTemplate.js';

export default class TlsTransport extends TransportTemplate {
    constructor(options: Options) {
        super(tls, options);
    }
}
