var kinetic = require('../index').Kinetic;
var mocha = require('mocha');

describe('Kinetic Protocol Unit Testing', function() {
    kinetic.setProtobuf(new Buffer('tata'));
    kinetic.setChunk(new Buffer('tototo'));
    describe('#getProtobuf()', function() {
    });
});

