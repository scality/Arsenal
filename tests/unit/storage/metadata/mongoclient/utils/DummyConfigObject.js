const { EventEmitter } = require('events');

class DummyConfigObject extends EventEmitter {
    constructor() {
        super();
        this.locationConstraints = null;
        this.isTest = true;
    }

    setLocationConstraints(locationConstraints) {
        this.locationConstraints = locationConstraints;
        this.emit('location-constraints-update');
    }
}

module.exports = DummyConfigObject;
