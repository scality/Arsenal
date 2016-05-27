module.exports = {
    db: require('./lib/db'),
    errors: require('./lib/errors.js'),
    shuffle: require('./lib/shuffle'),
    stringHash: require('./lib/stringHash'),
    Testing: {
        Matrix: require('./lib/testing/matrix.js'),
    },
};
