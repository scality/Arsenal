# NodeJS Kinetic Protocol API

### Use it

As with all node modules, you will need:
```node
import { Kinetic } from 'arsenal';
const kinetic = new Kinetic;
```
The kinetic protocol is based on a simple exchange format, the Kinetic Protocol
Data Structure.

The `Kinetic` object represents that structure, and presents facilities through
an API, exposing only key components.

#### API definition

##### Getters

```node
function kinetic.getVersion() -> number
```
`getVersion()` returns the actual version of the kinetic protocol.

```node
function kinetic.getProtobuf() -> {}
```
`getProtobuf` returns the actual protobuf message as an object.

```node
function kinetic.getProtobufSize() -> number
```
`getProtobufSize()` returns the actual protobuf message size.

```node
function kinetic.getChunk() -> Buffer
```
`getChunk()` returns the Value. Should be a ReadableStream soon.

```node
function kinetic.getChunkSize() -> number
```
`getChunkSize()` returns the size of the Value.

```node
function kinetic.getHMAC() -> string
```
`getHMAC()` returns the HMAC.

```node
function kinetic.getCommand() -> {}
```
`getCommand()` returns the full Kinetic protobuf template.

```node
function kinetic.getMessageType() -> number
```
`getMessageType()` returns the request value.

```node
function kinetic.getKey() -> buffer
```
`getKey()` returns the object key.

```node
function kinetic.getDbVersion() -> Buffer
```
`getDbVersion()` returns the database version of the object.

```node
function kinetic.getNewVersion() -> Buffer
```
`getNewVersion()` returns the new version of the object.

```node
function kinetic.getErrorMessage() -> Buffer
```
`getErrorMessage()` returns the detailed error message.

```node
function kinetic.getGetLogMessage() -> Buffer
```
`getGetLogMessage()` returns the log message .

```node
function kinetic.getOp() -> String
```
`getOp()` returns the operation name.

```node
function kinetic.getError() -> String
```
`getError()` returns the error name.

```node
function kinetic.getLogType() -> Buffer
```
`getLogType()` returns the log type name.

##### Setters

```node
function kinetic.setProtobuf(pbMessage: {}) -> Kinetic
```
`setProtobuf()` sets the protobuf message for the Kinetic Protocol Data Unit.
It returns the `Kinetic` object to allow for a functional style.

```node
function kinetic.setChunk(chunk: Buffer) -> Kinetic
```
`setChunk()` sets the Value for the Kinetic Protocol Data Unit.
It returns the `Kinetic` object to allow for a functional style.

```node
function kinetic.setHMAC() -> Kinetic
```
`setHMAC()` sets the HMAC signature for the Kinetic Protocol Data Unit integrity.
It returns the `Kinetic` object to allow for a functional style.

```node
function kinetic.setCommand(command: {}) -> Kinetic
```
`setCommand()` sets the protobuf structure from the specific message structure
and the template.
It returns the `Kinetic` object to allow for a functional style.

##### Methods
```node
function kinetic.send(sock: Socket) -> Kinetic
```
`send()` sends the Data Unit defined by the `Kinetic` object through a TCP
socket taking care of all the formatting. It returns the `Kinetic` object to
allow for a functional style.

```node
function kinetic.parse(data: Buffer) -> Kinetic
```
`parse()` returns the `Kinetic` object parsed from the received Data Unit. It
sets chunk and protobuf. It also verify the hmac integrity.

```node
function kinetic.hmacIntegrity(hmac: Buffer) -> Boolean
```
`hmacIntegrity()` returns a Boolean from the diff between hmac in parameters and
the hmac from getHMAC().

```node
function kinetic.getOp(opCode: number) -> String
```
`getOp()` returns the string from the operation code.

```node
function kinetic.getError(errorCode: number) -> String
```
`getError()` returns the string from the error code.

```node
function kinetic.getLogType(logCode: number) -> String
```
`getLogType()` returns the string from the logType code.

```node
function kinetic.hmacIntegrity(hmac: buffer) -> Boolean
```
`hmacIntegrity()` returns true if HMACs match.

##### Requests Methods

Set the actual protobuf message from the asked request.
Set also the HMAC from the actual protobuf message.

Exemple :

```node
  kinetic.noOp(incrementTCP, 0);
  console.log('HMAC : ')
  console.log(kinetic.getHMAC());
  
// HMAC : 
// <Buffer 02 32 e8 a4 10 d1 85 1b e6 ec 16 17 fe b6 37 e0 7a c2 64 a7>
```

```node
function kinetic.getLog(incrementTCP: number,
                types: Array,
                clusterVersion: number) -> Kinetic
```
`getLog()` returns the `Kinetic` object filled by the actual requested
protobuf message.

```node
function kinetic.getLogResponse(response: number,
                        errorMessage: Buffer,
                        responseLogs: Object) -> Kinetic
```

The responseLog object must be filled like this :

```node
    // refer to https://github.com/Kinetic/kinetic-protocol#get-log
    // for more details
    logObject.utilization: Object;
    logObject.temperatures: Object;
    logObject.capacity: Object;
    logObject.configuration: Object;
    logObject.statistics: Object;
    logObject.messages: Buffer;
    logObject.limits: Object;
```

`getLogResponse()` returns the `Kinetic` object filled by the actual requested
protobuf message.

```node
function kinetic.flush(incrementTCP: number, clusterVersion: number) -> Kinetic
```
`flush()` returns the `Kinetic` object filled by the actual requested
protobuf message.

```node
function kinetic.flushResponse(response: number,
                       errorMessage: Buffer) -> Kinetic
```
`flushResponse()` returns the `Kinetic` object filled by the actual requested
protobuf message.

```node
function kinetic.setClusterVersion(incrementTCP: number,
                           clusterVersion: number,
                           oldClusterVersion: number)  -> Kinetic
```
`setClusterVersion()` returns the `Kinetic` object filled by the actual requested
protobuf message.

```node
function kinetic.setupResponse(response: number,
                       errorMessage: Buffer) -> Kinetic
```
`setupResponse()` returns the `Kinetic` object filled by the actual requested
protobuf message.

```node
function kinetic.noOp(incrementTCP: number,
              clusterVersion: number)  -> Kinetic
```
`noOp()` returns the `Kinetic` object filled by the actual requested
protobuf message.

```node
function kinetic.noOpResponse(response: number,
                      errorMessage: Buffer) -> Kinetic
```
`noOpResponse()` returns the `Kinetic` object filled by the actual requested
protobuf message.

```node
function kinetic.put(key: Buffer,
             incrementTCP: number,
             dbVersion: Buffer,
             newVersion: Buffer,
             clusterVersion: number)  -> Kinetic
```
`put()` returns the `Kinetic` object filled by the actual requested
protobuf message.

```node
function kinetic.putResponse(response: number,
                     errorMessage: Buffer) -> Kinetic
```
`putResponse()` returns the `Kinetic` object filled by the actual requested
protobuf message.


```node
function kinetic.get(key: Buffer,
             incrementTCP: number,
             clusterVersion: number)  -> Kinetic
```
`get()` returns the `Kinetic` object filled by the actual requested
protobuf message.

```node
function kinetic.getResponse(response: number,
                     errorMessage: Buffer,
                     dbVersion: Buffer) -> Kinetic
```
`getResponse()` returns the `Kinetic` object filled by the actual requested
protobuf message.

```node
function kinetic.delete(key: Buffer,
                incrementTCP: number,
                clusterVersion: number)  -> Kinetic
```
`delete()` returns the `Kinetic` object filled by the actual requested
protobuf message.

```node
function kinetic.deleteResponse(response: number,
                        errorMessage: Buffer) -> Kinetic
```
`deleteResponse()` returns the `Kinetic` object filled by the actual requested
protobuf message.
