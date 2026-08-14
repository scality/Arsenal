const joi = require('joi');

const supportedOperators = {
    $eq: true,
    $ne: true,
    $gt: true,
    $gte: true,
    $lt: true,
    $lte: true,
    $exists: true,
};

const supportedStructuralOperators = {
    $or: true,
    $and: true,
};

// supports strings and numbers
const _operatorType1 = joi.string().valid('$gt', '$gte', '$lt', '$lte');

// supports strings, numbers, and boolean
const _operatorType2 = joi.string().valid('$eq', '$ne');

const _operatorType3 = joi.string().valid('$exists');

const _valueType1 = joi.alternatives([joi.string(), joi.number()]);

const _valueType2 = joi.alternatives([joi.string(), joi.number(), joi.boolean()]);

const _valueType3 = joi.boolean();

const queryObject = joi
    .object({})
    .pattern(_operatorType1, _valueType1)
    .pattern(_operatorType2, _valueType2)
    .pattern(_operatorType3, _valueType3)
    .xor(...Object.keys(supportedOperators));

const metadataCondObject = joi.alternatives([_valueType1, _valueType2, queryObject]);

function validateConditionsObject(obj) {
    if (obj === undefined) {
        return false;
    }
    const res = metadataCondObject.validate(obj);
    if (res.error) {
        return false;
    }
    return true;
}

module.exports = {
    supportedOperators,
    supportedStructuralOperators,
    validateConditionsObject,
};
