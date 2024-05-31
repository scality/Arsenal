import assert from 'assert';
import * as http from 'http';

import { Server as IOServer } from 'socket.io';
import { Logger } from 'werelogs';

import { BaseClient, BaseService, Callback } from "../network/rpc/rpc";
import * as sioStream from '../network/rpc/sio-stream';
import { sendWorkerCommand } from './ClusterRPC';

// export async function sendWorkerCommand(
//     toWorkers: string,
//     toHandler: string,
//     uids: string,
//     payload: object,
//     timeoutMs: number = 60000
// ) {


function relayCommand(
    env: Record<string, any>,
    toWorkers: string,
    toHandler: string,
    uids: string,
    payload: object,
    timeoutMs: number = 60000,
    cb: (err: Error | null, res: any) => void
) {
    sendWorkerCommand(toWorkers, toHandler, uids, payload, timeoutMs)
        .then(res =>  cb(null, res))
        .catch(err => cb(err, null));
}


class RelayService extends BaseService {
    constructor(...args: ConstructorParameters<typeof BaseService>) {
        super(...args);

        const api = {
            relayCommand,
        };

        this.registerAsyncAPI(api);
    }
}

type RelayClientParams = ConstructorParameters<typeof BaseClient>[0] & {
    namespace: string;
    apiVersion?: string;
}

class RelayClient extends BaseClient {
    private _relayService: RelayService;

    constructor(params: RelayClientParams) {
        super(params);

        this._relayService = new RelayService(params);
    }

    connect(cb: Callback) {
        super.connect((err?: Error | null, data?: any) => {
            if (err) {
                return cb(err);
            }
            this.socket.on("call", (remoteCall: string, args: any, cb: Callback) => {
                const decodedArgs = this.socketStreams.decodeStreams(args);
                this._relayService._onCall(remoteCall, decodedArgs, (err, res) => {
                    if (err) {
                        return cb(err);
                    }
                    const encodedRes = this.socketStreams.encodeStreams(res);
                    return cb(err, encodedRes);
                });
            });
            return cb();
        });
    }

    async sendWorkerCommand(
        toWorkers: string,
        toHandler: string,
        uids: string,
        payload: object,
        timeoutMs: number = 60000
    ) {
        //@ts-expect-error
        return this.relayCommand(toWorkers, toHandler, uids, payload, timeoutMs);
    }
}

class PrimaryClient extends BaseClient {
    async sendWorkerCommand(
        toWorkers: string,
        toHandler: string,
        uids: string,
        payload: object,
        timeoutMs: number = 60000
    ) {
        return sendWorkerCommand(toWorkers, toHandler, uids, payload, timeoutMs);
    }
}

/**
 * @brief create a server object that serves remote requests through
 * socket.io events.
 *
 * Services associated to namespaces (aka. URL base path) must be
 * registered thereafter on this server.
 *
 * Each service may customize the sending and reception of RPC
 * messages through subclassing, e.g. LevelDbService looks up a
 * particular sub-level before forwarding the RPC, providing it the
 * target sub-level handle.
 *
 * @param params - params object
 * @param params.logger - logger object
 * @param [params.streamMaxPendingAck] - max number of
 *   in-flight output stream packets sent to the server without an ack
 *   received yet
 * @param [params.streamAckTimeoutMs] - timeout for receiving
 *   an ack after an output stream packet is sent to the server
 * @return a server object, not yet listening on a TCP port
 * (you must call listen(port) on the returned object)
 */
export function RPCRelay(params: {
    logger: Logger;
    streamMaxPendingAck?: number;
    streamAckTimeoutMs?: number;
}) {
    assert(params.logger);

    const httpServer = http.createServer();
    const server = new IOServer(httpServer, { maxHttpBufferSize: 1e8 });
    const log = params.logger;

    /**
     * register a list of service objects on this server
     *
     * It's not necessary to call this function if you provided a
     * "server" parameter to the service constructor.
     *
     * @param {BaseService} serviceList - list of services to register
     */
    (server as any).registerServices = function registerServices(...serviceList: any[]) {
        serviceList.forEach(service => {
            const sock = this.of(service.namespace);
            sock.on('connection', conn => {
                const streamsSocket = sioStream.createSocket(
                    conn,
                    params.logger,
                    params.streamMaxPendingAck,
                    params.streamAckTimeoutMs);

                conn.on('error', err => {
                    log.error('error on socket.io connection',
                        { namespace: service.namespace, error: err });
                });
                conn.on('call', (remoteCall, args, cb) => {
                    const decodedArgs = streamsSocket.decodeStreams(args);
                    service._onCall(remoteCall, decodedArgs, (err, res) => {
                        if (err) {
                            return cb(err);
                        }
                        const encodedRes = streamsSocket.encodeStreams(res);
                        return cb(err, encodedRes);
                    });
                });
            });
        });
    };

    (server as any).listen = function listen(port, bindAddress = undefined) {
        httpServer.listen(port, bindAddress);
    };

    return server;
}