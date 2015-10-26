'use strict'; // eslint-disable-line strict

const fs = require('fs');

const tmp = new Buffer(+process.argv[2]);
for (let i = 0; i < +process.argv[2]; i++) {
    tmp[i] = 70;
}
fs.writeFileSync(process.argv[3], tmp);
