# NodeJS Kinetic Protocol API

### Use it

As with all node modules, you will need:
```node
var Kinetic = require('arsenal').Kinetic;
```
The kinetic protocol is based on a simple exchange format, the Kinetic Protocol
Data Structure.

The `Kinetic` object represents that structure, and presents facilities through
an API, exposing only key components.

#### API definition

##### Getters

```node
function Kinetic.getVersion() -> number
```
`getVersion()` returns the actual version of the kinetic protocol.

```node
function Kinetic.getProtobuf() -> {}
```
`getProtobuf` returns the actual protobuf message as an object.

```node
function Kinetic.getProtobufSize() -> number
```
`getProtobufSize()` returns the actual protobuf message size.

```node
function Kinetic.getChunk() -> Buffer
```
`getChunk()` returns the Value. Should be a ReadableStream soon.

```node
function Kinetic.getChunkSize() -> number
```
`getChunkSize()` returns the size of the Value.

##### Setters

```node
function Kinetic.setProtobuf(pbMessage: {}) -> Kinetic
```
`setProtobuf()` sets the protobuf message for the Kinetic Protocol Data Unit.
It returns the `Kinetic` object to allow for a functional style.

```node
function Kinetic.setChunk(chunk: Buffer) -> Kinetic
```
`setProtobuf()` sets the Value for the Kinetic Protocol Data Unit.
It returns the `Kinetic` object to allow for a functional style.

##### Methods
```node
function Kinetic.send(sock: Socket) -> Kinetic
```
`send()` sends the Data Unit defined by the `Kinetic` object through a TCP
socket taking care of all the formatting. It returns the `Kinetic` object to
allow for a functional style.

```node
function Kinetic.parse(data: Buffer) -> Kinetic
```
`parse()` returns the `Kinetic` object parsed from the received Data Unit.
