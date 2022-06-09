/**
 * @param protocol - protocol to use for redirect
 * @param hostName - hostname to use for redirect
 * @param replaceKeyPrefixWith - string to replace keyPrefixEquals specified in condition
 * @param replaceKeyWith - string to replace key
 * @param httpRedirectCode - http redirect code
 */
export type Redirect = {
    protocol?: string;
    hostName?: string;
    replaceKeyPrefixWith?: string;
    replaceKeyWith?: string;
    httpRedirectCode: string;
};

/**
 * @param keyPrefixEquals - key prefix that triggers a redirect
 * @param httpErrorCodeReturnedEquals - http code that triggers a redirect
 */
export type Condition = {
    keyPrefixEquals?: string;
    httpErrorCodeReturnedEquals?: string;
};

export type RoutingRuleParams = { redirect: Redirect; condition?: Condition };

export class RoutingRule {
    _redirect?: Redirect;
    _condition?: Condition;

    /**
    * Represents a routing rule in a website configuration.
    * @constructor
    * @param params - object containing redirect and condition objects
    * @param params.redirect - specifies how to redirect requests
    * @param [params.condition] - specifies conditions for a redirect
    */
    constructor(params?: RoutingRuleParams) {
        if (params) {
            this._redirect = params.redirect;
            this._condition = params.condition;
        }
    }

    /**
    * Return copy of rule as plain object
    * @return rule;
    */
    getRuleObject() {
        const rule = {
            redirect: this._redirect,
            condition: this._condition,
        };
        return rule;
    }

    /**
    * Return the condition object
    * @return condition;
    */
    getCondition() {
        return this._condition;
    }

    /**
    * Return the redirect object
    * @return redirect;
    */
    getRedirect() {
        return this._redirect;
    }
}

export type RedirectAllRequestsTo = {
    hostName: string;
    protocol?: string;
};
export class WebsiteConfiguration {
    _indexDocument?: string;
    _errorDocument?: string;
    _redirectAllRequestsTo?: RedirectAllRequestsTo;
    _routingRules?: RoutingRule[];

    /**
    * Object that represents website configuration
    * @constructor
    * @param params - object containing params to construct Object
    * @param params.indexDocument - key for index document object
    *   required when redirectAllRequestsTo is undefined
    * @param [params.errorDocument] - key for error document object
    * @param params.redirectAllRequestsTo - object containing info
    *   about how to redirect all requests
    * @param params.redirectAllRequestsTo.hostName - hostName to use
    *   when redirecting all requests
    * @param [params.redirectAllRequestsTo.protocol] - protocol to use
    *   when redirecting all requests ('http' or 'https')
    * @param params.routingRules - array of Routing
    *   Rule instances or plain routing rule objects to cast as RoutingRule's
    */
    constructor(params: {
        indexDocument: string;
        errorDocument: string;
        redirectAllRequestsTo: RedirectAllRequestsTo;
        routingRules: RoutingRule[] | any[],
    }) {
        if (params) {
            this._indexDocument = params.indexDocument;
            this._errorDocument = params.errorDocument;
            this._redirectAllRequestsTo = params.redirectAllRequestsTo;
            this.setRoutingRules(params.routingRules);
        }
    }

    /**
    * Return plain object with configuration info
    * @return - Object copy of class instance
    */
    getConfig() {
        const base = {
            indexDocument: this._indexDocument,
            errorDocument: this._errorDocument,
            redirectAllRequestsTo: this._redirectAllRequestsTo,
        };
        if (this._routingRules) {
            const routingRules = this._routingRules.map(r => r.getRuleObject());
            return { ...base, routingRules };
        }
        return { ...base };
    }

    /**
    * Set the redirectAllRequestsTo
    * @param obj - object to set as redirectAllRequestsTo
    * @param obj.hostName - hostname for redirecting all requests
    * @param [obj.protocol] - protocol for redirecting all requests
    */
    setRedirectAllRequestsTo(obj: { hostName: string; protocol?: string }) {
        this._redirectAllRequestsTo = obj;
    }

    /**
    * Return the redirectAllRequestsTo object
    * @return redirectAllRequestsTo;
    */
    getRedirectAllRequestsTo() {
        return this._redirectAllRequestsTo;
    }

    /**
    * Set the index document object name
    * @param suffix - index document object key
    */
    setIndexDocument(suffix: string) {
        this._indexDocument = suffix;
    }

    /**
     * Get the index document object name
     * @return indexDocument
     */
    getIndexDocument() {
        return this._indexDocument;
    }

    /**
     * Set the error document object name
     * @param key - error document object key
     */
    setErrorDocument(key: string) {
        this._errorDocument = key;
    }

    /**
     * Get the error document object name
     * @return errorDocument
     */
    getErrorDocument() {
        return this._errorDocument;
    }

    /**
    * Set the whole RoutingRules array
    * @param array - array to set as instance's RoutingRules
    */
    setRoutingRules(array?: (RoutingRule | RoutingRuleParams)[]) {
        if (array) {
            this._routingRules = array.map(rule => {
                if (rule instanceof RoutingRule) {
                    return rule;
                }
                return new RoutingRule(rule);
            });
        }
    }

    /**
     * Add a RoutingRule instance to routingRules array
     * @param obj - rule to add to array
     */
    addRoutingRule(obj?: RoutingRule | RoutingRuleParams) {
        if (!this._routingRules) {
            this._routingRules = [];
        }
        if (obj && obj instanceof RoutingRule) {
            this._routingRules.push(obj);
        } else if (obj) {
            this._routingRules.push(new RoutingRule(obj));
        }
    }

    /**
     * Get routing rules
     * @return - array of RoutingRule instances
     */
    getRoutingRules() {
        return this._routingRules;
    }
}
