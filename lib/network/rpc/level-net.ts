import assert from 'assert';
import * as rpc from './rpc';
import { Logger } from 'werelogs';

/**
 * @class
 * @classdesc Wrap a LevelDB RPC client supporting sub-levels on top
 * of a base RPC client.
 *
 * An additional "subLevel" request parameter is attached to RPC
 * requests to tell the RPC service for which sub-level the request
 * applies.
 *
 * openSub() can be used to open sub-levels, returning a new LevelDB
 * RPC client object accessing the sub-level transparently.
 */
export class LevelDbClient extends rpc.BaseClient {
    path: string[];

    /**
     * @constructor
     *
     * @param params - constructor params
     * @param params.url - URL of the socket.io namespace,
     *   e.g. 'http://localhost:9990/metadata'
     * @param params.logger - logger object
     * @param [params.callTimeoutMs] - timeout for remote calls
     * @param [params.streamMaxPendingAck] - max number of
     *   in-flight output stream packets sent to the server without an ack
     *   received yet
     * @param [params.streamAckTimeoutMs] - timeout for receiving
     *   an ack after an output stream packet is sent to the server
     */
    constructor(params: {
        url: string;
        logger: Logger;
        callTimeoutMs?: number;
        streamMaxPendingAck?: number;
        streamAckTimeoutMs?: number;
    }) {
        super(params);

        this.path = []; // start from the root sublevel

        // transmit the sublevel information as a request param
        this.addRequestInfoProducer(
            dbClient => ({ subLevel: dbClient.path }));
    }

    /**
     * return a handle to a sublevel database
     *
     * @note this function has no side-effect on the db, it just
     * returns a handle properly configured to access the sublevel db
     * from the client.
     *
     * @param subName - name of sublevel
     * @return a handle to the sublevel database that has the
     * same API as its parent
     */
    openSub(subName: string) {
        const subDbClient = new LevelDbClient({ url: this.url,
            logger: this.logger });
        // make the same exposed RPC calls available from the sub-level object
        Object.assign(subDbClient, this);
        // listeners should not be duplicated on sublevel
        subDbClient.removeAllListeners();
        // copy and append the new sublevel to the path
        subDbClient.path = subDbClient.path.slice();
        subDbClient.path.push(subName);
        return subDbClient;
    }
}

/**
 * @class
 * @classdesc Wrap a LevelDB RPC service supporting sub-levels on top
 * of a base RPC service.
 *
 * An additional "subLevel" request parameter received from the RPC
 * client is automatically parsed, and the requested sub-level of the
 * database is opened and attached to the call environment in
 * env.subDb (env is passed as first parameter of received RPC calls).
 */
export class LevelDbService extends rpc.BaseService {
    rootDb: any;

    /**
     * @constructor
     *
     * @param params - constructor parameters
     * @param params.namespace - socket.io namespace, a free
     *   string name that must start with '/'. The client will have to
     *   provide the same namespace in the URL
     *   (http://host:port/namespace)
     * @param params.rootDb - root LevelDB database object to
     *   expose to remote clients
     * @param params.logger - logger object
     * @param [params.apiVersion="1.0"] - Version number that
     *   is shared with clients in the manifest (may be used to ensure
     *   backward compatibility)
     * @param [params.server] - convenience parameter,
     * calls server.registerServices() automatically
     */
    constructor(params: { namespace: string; rootDb: any; logger: Logger; apiVersion: string; server: typeof rpc.RPCServer }) {
        assert(params.rootDb);
        super(params);
        this.rootDb = params.rootDb;

        this.addRequestInfoConsumer((dbService, reqParams) => {
            return {
                subLevel: reqParams.subLevel,
                subDb: this.lookupSubLevel(reqParams.subLevel),
            };
        });
    }

    /**
     * lookup a sublevel db given by the <tt>path</tt> array from the
     * root leveldb handle.
     *
     * @param path - path to the sublevel, as a
     * piecewise array of sub-levels
     * @return the handle to the sublevel
     */
    lookupSubLevel(path: string[]) {
        let subDb = this.rootDb;
        path.forEach(pathItem => {
            subDb = subDb.sublevel(pathItem);
        });
        return subDb;
    }
}
