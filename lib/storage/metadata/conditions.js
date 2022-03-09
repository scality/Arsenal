const joi = require('joi');

const supportedOperators = {
    $eq: true,
    $ne: true,
    $gt: true,
    $gte: true,
    $lt: true,
    $lte: true,
};

// supports strings and numbers
const _operatorType1 = joi.string().valid(
    '$gt',
    '$gte',
    '$lt',
    '$lte',
);

// supports strings, numbers, and boolean
const _operatorType2 = joi.string().valid(
    '$eq',
    '$ne',
);

const _valueType1 = joi.alternatives([
    joi.string(),
    joi.number(),
]);

const _valueType2 = joi.alternatives([
    joi.string(),
    joi.number(),
    joi.boolean(),
]);

const queryObject = joi.object({})
    .pattern(_operatorType1, _valueType1)
    .pattern(_operatorType2, _valueType2)
    .xor(...Object.keys(supportedOperators));

const metadataCondObject = joi.alternatives([
    _valueType1,
    _valueType2,
    queryObject,
]);

function validateConditionsObject(obj) {
    if (obj === undefined) {
        return false;
    }
    const res = joi.validate(obj, metadataCondObject);
    if (res.error) {
        return false;
    }
    return true;
}

module.exports = {
    supportedOperators,
    validateConditionsObject,
};
