import { Logger } from 'werelogs';

const DEFAULT_STICKY_COUNT = 100;

/**
 * Shuffle an array in-place
 *
 * @param array - The array to shuffle
 */
function shuffle(array: any[]) {
    for (let i = array.length - 1; i > 0; i--) {
        const randIndex = Math.floor(Math.random() * (i + 1));
        /* eslint-disable no-param-reassign */
        const randIndexVal = array[randIndex];
        array[randIndex] = array[i];
        array[i] = randIndexVal;
        /* eslint-enable no-param-reassign */
    }
}

export default class RoundRobin {
    logger?: Logger;
    stickyCount: number;
    defaultPort?: number;
    hostsList: { host: string; port?: number }[]
    hostIndex: number;
    pickCount: number;

    /**
     * @constructor
     * @param {object[]|string[]} hostsList - list of hosts to query
     *   in round-robin fashion.
     * @param {string} hostsList[].host - host name or IP address
     * @param {number} [hostsList[].port] - port number to contacts
     * @param {object} [options] - options object
     * @param {number} [options.stickyCount=100] - number of requests
     *   to send to the same host before switching to the next one
     * @param {Logger} [options.logger] - logger object
     */
    constructor(
        hostsList: { host: string; port: number }[] | string[],
        options?: { stickyCount?: number; logger?: Logger; defaultPort?: string },
    ) {
        if (hostsList.length === 0) {
            throw new Error(
                'at least one host must be provided for round robin');
        }
        if (options && options.logger) {
            this.logger = options.logger;
        }
        if (options && options.stickyCount) {
            this.stickyCount = options.stickyCount;
        } else {
            this.stickyCount = DEFAULT_STICKY_COUNT;
        }
        if (options && options.defaultPort) {
            this.defaultPort = Number.parseInt(options.defaultPort, 10);
            if (isNaN(this.defaultPort)) {
                this.defaultPort = undefined;
            }
        }

        this.hostsList = hostsList.map((item: any) => this._validateHostObj(item));

        // TODO: add blacklisting capability

        shuffle(this.hostsList);
        this.hostIndex = 0;
        this.pickCount = 0;
    }

    _validateHostObj(hostItem: string | { host: string; port: string }): { host: string; port?: number } {
        const hostItemObj: { host: string; port: string } = { host: '', port: '' };

        if (typeof hostItem === 'string') {
            const hostParts = hostItem.split(':');
            if (hostParts.length > 2) {
                throw new Error(`${hostItem}: ` +
                                'bad round robin item: expect "host[:port]"');
            }
            hostItemObj.host = hostParts[0];
            hostItemObj.port = hostParts[1];
        } else {
            if (typeof hostItem !== 'object') {
                throw new Error(`${hostItem}: bad round robin item: ` +
                                'must be a string or object');
            }
            hostItemObj.host = hostItem.host;
            hostItemObj.port = hostItem.port;
        }
        if (typeof hostItemObj.host !== 'string') {
            throw new Error(`${hostItemObj.host}: ` +
                            'bad round robin host name: not a string');
        }
        if (hostItemObj.port !== undefined) {
            if (/^[0-9]+$/.exec(hostItemObj.port) === null) {
                throw new Error(`'${hostItemObj.port}': ` +
                                'bad round robin host port: not a number');
            }
            const parsedPort = Number.parseInt(hostItemObj.port, 10);
            if (parsedPort <= 0 || parsedPort > 65535) {
                throw new Error(`'${hostItemObj.port}': bad round robin ` +
                                'host port: not a valid port number');
            }
            return {
                host: hostItemObj.host,
                port: parsedPort,
            };
        }
        return { host: hostItemObj.host,
            port: this.defaultPort };
    }

    /**
     * return the next host within round-robin cycle
     *
     * The same host is returned up to {@link this.stickyCount} times,
     * then the next host in the round-robin list is returned.
     *
     * Once all hosts have been returned once, the list is shuffled
     * and a new round-robin cycle starts.
     *
     * @return a host object with { host, port } attributes
     */
    pickHost() {
        if (this.logger) {
            this.logger.debug('pick host',
                { host: this.getCurrentHost() });
        }
        const curHost = this.getCurrentHost();
        ++this.pickCount;
        if (this.pickCount === this.stickyCount) {
            this._roundRobinCurrentHost({ shuffle: true });
            this.pickCount = 0;
        }
        return curHost;
    }

    /**
     * return the next host within round-robin cycle
     *
     * stickyCount is ignored, the next host in the round-robin list
     * is returned.
     *
     * Once all hosts have been returned once, the list is shuffled
     * and a new round-robin cycle starts.
     *
     * @return a host object with { host, port } attributes
     */
    pickNextHost() {
        // don't shuffle in this case because we want to force picking
        // a different host, shuffling may return the same host again
        this._roundRobinCurrentHost({ shuffle: false });
        this.pickCount = 0;
        return this.getCurrentHost();
    }

    /**
     * return the current host in round-robin, without changing the
     * round-robin state
     *
     * @return a host object with { host, port } attributes
     */
    getCurrentHost() {
        return this.hostsList[this.hostIndex];
    }

    _roundRobinCurrentHost(params: { shuffle?: boolean }) {
        this.hostIndex += 1;
        if (this.hostIndex === this.hostsList.length) {
            this.hostIndex = 0;
            // re-shuffle the array when all entries have been
            // returned once, if shuffle param is true
            if (params.shuffle) {
                shuffle(this.hostsList);
            }
        }
        if (this.logger) {
            this.logger.debug('round robin host',
                { newHost: this.getCurrentHost() });
        }
    }
}
