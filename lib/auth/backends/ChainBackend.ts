import assert from 'assert';
import async from 'async';
import errors from '../../errors';
import BaseBackend from './base';

/**
 * Class that provides an authentication backend that will verify signatures
 * and retrieve emails and canonical ids associated with an account using a
 * given list of authentication backends and vault clients.
 *
 * @class ChainBackend
 */
export default class ChainBackend extends BaseBackend {
    _clients: any[];

    /**
     * @constructor
     * @param {string} service - service id
     * @param {object[]} clients - list of authentication backends or vault clients
     */
    constructor(service: string, clients: any[]) {
        super(service);

        assert(Array.isArray(clients) && clients.length > 0, 'invalid client list');
        assert(clients.every(client =>
            typeof client.verifySignatureV4 === 'function' &&
            typeof client.verifySignatureV2 === 'function' &&
            typeof client.getCanonicalIds === 'function' &&
            typeof client.getEmailAddresses === 'function' &&
            typeof client.checkPolicies === 'function' &&
            typeof client.healthcheck === 'function',
        ), 'invalid client: missing required auth backend methods');
        this._clients = clients;
    }


    /*
     * try task against each client for one to be successful
     */
    _tryEachClient(task: any, cb: any) {
        // @ts-ignore
        async.tryEach(this._clients.map(client => done => task(client, done)), cb);
    }

    /*
     * apply task to all clients
     */
    _forEachClient(task: any, cb: any) {
        async.map(this._clients, task, cb);
    }

    verifySignatureV2(
        stringToSign: string,
        signatureFromRequest: string,
        accessKey: string,
        options: any,
        callback: any,
      ) {
        this._tryEachClient((client, done) => client.verifySignatureV2(
            stringToSign,
            signatureFromRequest,
            accessKey,
            options,
            done,
        ), callback);
    }

    verifySignatureV4(
      stringToSign: string,
      signatureFromRequest: string,
      accessKey: string,
      region: string,
      scopeDate: string,
      options: any,
      callback: any,
    ) {
        this._tryEachClient((client, done) => client.verifySignatureV4(
            stringToSign,
            signatureFromRequest,
            accessKey,
            region,
            scopeDate,
            options,
            done,
        ), callback);
    }

    static _mergeObjects(objectResponses: any) {
        return objectResponses.reduce(
            (retObj, resObj) => Object.assign(retObj, resObj.message.body),
            {});
    }

    getCanonicalIds(emailAddresses: string[], options: any, callback: any) {
        this._forEachClient(
            (client, done) => client.getCanonicalIds(emailAddresses, options, done),
            (err, res) => {
                if (err) {
                    return callback(err);
                }
                // TODO: atm naive merge, better handling of conflicting email results
                return callback(null, {
                    message: {
                        body: ChainBackend._mergeObjects(res),
                    },
                });
            });
    }

    getEmailAddresses(canonicalIDs: string[], options: any, callback: any) {
        this._forEachClient(
            (client, done) => client.getEmailAddresses(canonicalIDs, options, done),
            (err, res) => {
                if (err) {
                    return callback(err);
                }
                return callback(null, {
                    message: {
                        body: ChainBackend._mergeObjects(res),
                    },
                });
            });
    }

    /*
     * merge policy responses into a single message
     */
    static _mergePolicies(policyResponses: any) {
        const policyMap: any = {};

        policyResponses.forEach(resp => {
            if (!resp.message || !Array.isArray(resp.message.body)) {
                return;
            }

            resp.message.body.forEach(policy => {
                const key = (policy.arn || '') + (policy.versionId || '');
                if (!policyMap[key] || !policyMap[key].isAllowed) {
                    policyMap[key] = policy;
                }
                // else is duplicate policy
            });
        });

        return Object.keys(policyMap).map(key => {
            const policyRes: any = { isAllowed: policyMap[key].isAllowed };
            if (policyMap[key].arn !== '') {
                policyRes.arn = policyMap[key].arn;
            }
            if (policyMap[key].versionId) {
                policyRes.versionId = policyMap[key].versionId;
            }
            return policyRes;
        });
    }

    /*
        response format:
            {  message: {
                body: [{}],
                code: number,
                message: string,
            } }
     */
    checkPolicies(requestContextParams: any, userArn: string, options: any, callback: any) {
        this._forEachClient((client, done) => client.checkPolicies(
            requestContextParams,
            userArn,
            options,
            done,
        ), (err, res) => {
            if (err) {
                return callback(err);
            }
            return callback(null, {
                message: {
                    body: ChainBackend._mergePolicies(res),
                },
            });
        });
    }

    healthcheck(reqUid: string, callback: any) {
        this._forEachClient((client, done) =>
            client.healthcheck(reqUid, (err, res) => done(null, {
                error: !!err ? err : null,
                status: res,
            }),
            ), (err, res) => {
            if (err) {
                return callback(err);
            }

            const isError = res.some(results => !!results.error);
            if (isError) {
                return callback(errors.InternalError, res);
            }
            return callback(null, res);
        });
    }
}
