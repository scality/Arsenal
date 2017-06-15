const BackendTemplate = require('../backend').BackendTemplate;

function _buildArn(generalResource, specificResource) {
    return `arn:aws:s3:::${generalResource}/${specificResource}`;
}

class Backend extends BackendTemplate {
    /**
    * Mocks Vault's response to a policy evaluation request
    * Since policies not actually implemented in memory backend,
    * we allow users to proceed with request.
    * @param {object} requestContextParams - parameters needed to construct
    * requestContext in Vault
    * @param {object} requestContextParams.constantParams -
    * params that have the
    * same value for each requestContext to be constructed in Vault
    * @param {object} requestContextParams.paramaterize - params that have
    * arrays as values since a requestContext needs to be constructed with
    * each option in Vault
    * @param {object[]} requestContextParams.paramaterize.specificResource -
    * specific resources paramaterized as an array of objects containing
    * properties `key` and optional `versionId`
    * @param {string} userArn - arn of requesting user
    * @param {object} log - log object
    * @param {function} cb - callback with either error or an array
    * of authorization results
    * @returns {undefined}
    * @callback called with (err, vaultReturnObject)
    */
    checkPolicies(requestContextParams, userArn, log, cb) {
        let results;
        const parameterizeParams = requestContextParams.parameterize;
        if (parameterizeParams && parameterizeParams.specificResource) {
            // object is parameterized
            results = parameterizeParams.specificResource.map(obj => ({
                isAllowed: true,
                arn: _buildArn(requestContextParams
                    .constantParams.generalResource, obj.key),
                versionId: obj.versionId,
            }));
        } else {
            results = [{
                isAllowed: true,
                arn: _buildArn(requestContextParams
                    .constantParams.generalResource, requestContextParams
                    .constantParams.specificResource),
            }];
        }
        const vaultReturnObject = {
            message: {
                body: results,
            },
        };
        return cb(null, vaultReturnObject);
    }
}

module.exports = Backend;
