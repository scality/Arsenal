const BucketController = require('../controller/BucketController');
const ObjectController = require('../controller/ObjectController');
const AuthController = require('../controller/AuthController');

class Router {
    constructor(routes) {
        this._routes = routes;
        this._controllers = { BucketController, ObjectController };
        return this;
    }

    _matchRoute(route, req) {
        const query = route.query || [];
        const headers = route.headers || [];
        return req.method === route.method &&
            Boolean(req.bucketName) === Boolean(route.bucket) &&
            Boolean(req.objectKey) === Boolean(route.object) &&
            query.every(q => q in req.query) &&
            headers.every(h => h in req.headers);
    }

    exec(req, res, api, log, statsClient) {
        const route = this._routes.find(r => this._matchRoute(r, req));
        const { controller, action, auth } = route;
        for (let i = 0; i < auth.length; i++) {
            const authMethod = auth[i];
            const authResponse = AuthController[authMethod](req, res, log);
            if (authResponse !== undefined) {
                return authResponse;
            }
        }
        const routeMethod = this._controllers[controller][action];
        return routeMethod(action, req, res, api, log, statsClient);
    }
}

module.exports = Router;
