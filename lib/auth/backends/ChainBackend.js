'use strict'; // eslint-disable-line strict

const assert = require('assert');
const async = require('async');

const errors = require('../../errors');
const BaseBackend = require('./base');

/**
 * Class that provides an authentication backend that will verify signatures
 * and retrieve emails and canonical ids associated with an account using a
 * given list of authentication backends and vault clients.
 *
 * @class ChainBackend
 */
class ChainBackend extends BaseBackend {
    /**
     * @constructor
     * @param {string} service - service id
     * @param {object[]} clients - list of authentication backends or vault clients
     */
    constructor(service, clients) {
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
    _tryEachClient(task, cb) {
        async.tryEach(this._clients.map(client => done => task(client, done)), cb);
    }

    /*
     * apply task to all clients
     */
    _forEachClient(task, cb) {
        async.map(this._clients, task, cb);
    }

    verifySignatureV2(stringToSign, signatureFromRequest, accessKey, options, callback) {
        this._tryEachClient((client, done) => client.verifySignatureV2(
            stringToSign,
            signatureFromRequest,
            accessKey,
            options,
            done,
        ), callback);
    }

    verifySignatureV4(stringToSign, signatureFromRequest, accessKey, region, scopeDate, options, callback) {
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

    static _mergeObjects(objectResponses) {
        return objectResponses.reduce(
            (retObj, resObj) => Object.assign(retObj, resObj.message.body),
            {});
    }

    getCanonicalIds(emailAddresses, options, callback) {
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

    getEmailAddresses(canonicalIDs, options, callback) {
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
    static _mergePolicies(policyResponses) {
        const policyMap = {};

        policyResponses.forEach(resp => {
            if (!resp.message || !Array.isArray(resp.message.body)) {
                return;
            }

            resp.message.body.forEach(policy => {
                const arn = policy.arn || '';
                if (!policyMap[arn]) {
                    policyMap[arn] = policy.isAllowed;
                }
                // else is duplicate policy
            });
        });

        const policyList = Object.keys(policyMap).map(arn => {
            if (arn === '') {
                return { isAllowed: policyMap[arn] };
            }
            return { isAllowed: policyMap[arn], arn };
        });

        return policyList;
    }

    /*
        response format:
            {  message: {
                body: [{}],
                code: number,
                message: string,
            } }
     */
    checkPolicies(requestContextParams, userArn, options, callback) {
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

    healthcheck(reqUid, callback) {
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

module.exports = ChainBackend;
