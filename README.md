# IronMan-Arsenal

Common utilities for the IronMan project components

Within this repository, you will be able to find the shared libraries for the
multiple components making up the whole Project.

## Usage

Sample code for using the Kinetic library:

```js
import Kinetic from 'Kinetic';

const rawData = new Buffer('\x46\x00\x00\x00\x32\x00');
const kineticPDU = new Kinetic.PDU(rawData);

const sock = net.connect(1234, 'localhost');
const ret = kineticPDU.send(sock);
if (ret !== Kinetic.errors.SUCCESS)
    throw new Error("argh: " + Kinetic.getErrorName(ret) + "!");
```

## Guidelines

Please read our coding and workflow guidelines at
[scality/IronMan-Guidelines](https://github.com/scality/IronMan-Guidelines).
