# Mongoclient

We introduce a new metadata backend called *mongoclient* for
[MongoDB](https://www.mongodb.com). This backend takes advantage of
MongoDB being a document store to store the metadata (bucket and
object attributes) as JSON objects.

## Overall Design

The mongoclient backend strictly follows the metadata interface that
stores bucket and object attributes, which consists of the methods
createBucket(), getBucketAttributes(), getBucketAndObject()
(attributes), putBucketAttributes(), deleteBucket(), putObject(),
getObject(), deleteObject(), listObject(), listMultipartUploads() and
the management methods getUUID(), getDiskUsage() and countItems(). The
mongoclient backend also knows how to deal with versioning, it is also
compatible with the various listing algorithms implemented in Arsenal.

FIXME: There should be a document describing the metadata (currently
duck-typing) interface.

### Why Using MongoDB for Storing Bucket and Object Attributes

We chose MongoDB for various reasons:

- MongoDB supports replication, especially through the Raft protocol.

- MongoDB supports a basic replication scheme called 'Replica Set' and
  more advanced sharding schemes if required.

- MongoDB is open source and an enterprise standard.

- MongoDB is a document store (natively supports JSON) and supports a
  very flexible search interface.

### Choice of Mongo Client Library

We chose to use the official MongoDB driver for NodeJS:
[https://github.com/mongodb/node-mongodb-native](https://github.com/mongodb/node-mongodb-native)

### Granularity for Buckets

We chose to have one collection for one bucket mapping. First because
in a simple mode of replication called 'replica set' it works from the
get-go, but if one or many buckets grow to big it is possible to use
more advanced schemes such as sharding. MongoDB supports a mix of
sharded and non-sharded collections.

### Storing Database Information

We need a special collection called the *Infostore* (stored under the
name __infostore which is impossible to create through the S3 bucket
naming scheme) to store specific database properties such as the
unique *uuid* for Orbit.

### Storing Bucket Attributes

We need to use a special collection called the *Metastore* (stored
under the name __metastore which is impossible to create through the
S3 bucket naming scheme).

### Versioning Format

We chose to keep the same versioning format that we use in some other
Scality products in order to facilitate the compatibility between the
different products.

FIXME: Document the versioning internals in the upper layers and
document the versioning format

#### Versioning key format

Bucket versioning requires to store master objects containing the latest
object version's metadata and version objects for each version of an object,
the two types of objects require having key. Key format versioning is the way
those keys are formatted and stored inside the metadata backend as database
keys.

The mongo metadata backend supports two different versions of key formatting.

#### Available Bucket Versioning Key Formats

#### v0

v0 is the default bucket key format used for all releases up to Cloudserver
8.4.2. Internal buckets only support this format.

It stores all master keys and version keys together in the lexicographic key
order of the database. In a database listing, the master key appears before
all versions of the key.

The v0 format suffers an issue when listing objects in a bucket where some
objects have a lot of deleted versions. Because deleted objects (those with
a delete marker as the latest version) have to be listed and ignored, as they
are not sent back in the listing, it can take a significant amount of time
listing and ignoring those entries without sending back any new entry, often
resulting in listing timeouts on the client side.
The v1 format has been introduced to provide a solution for this issue (see
Jira ticket: https://scality.atlassian.net/browse/ARTESCA-3028).

##### Format of master keys

```
{key}
```

##### Format of version keys

```
{key}\x00{versionId}
```

##### Sizing considerations

- On non-versioned buckets, stored objects have one key containing the object
 metadata.

- On versioned buckets, stored objects have one master key containing the latest
 version's metadada, and one key per object version or delete marker.

- On versioning-suspended buckets, all version and master keys created before
 the suspension of versioning are kept, and all new puts only update the master
 key.

#### v1

Starting from Cloudserver 8.4.3 the bucket key format version can be configured
to use either the v0 or v1 format, this can be done by setting the environement
variable `DEFAULT_BUCKET_KEY_FORMAT` of Cloudserver to either `v0` or `v1`
(defaults to `v1`).

The v1 key format addresses the issue described in v0: client timeouts when
doing a regular listing of objects in versioned buckets that contain a lot
of deleted objects.

Instead of keeping the version keys and master keys mixed together in the
database, they are now separated using two newly introduced prefixes. In
v1 master keys are grouped together and put before any version key.
Master keys are also automaticaly deleted when the last version of an
object is a delete marker, and is recreated when a new version is put
on top of the delete marker or if the delete marker is deleted.

##### Format of master keys

```
\x7fM{{key}
```

##### Format of version keys

```
\x7fV{{key}\x00{versionId}
```

##### Sizing considerations

Sizing is roughly equivalent to a v0 format bucket.

- On non-versioned buckets, similar to v0, stored objects have one key
 containing the object metadata.

- On versioned buckets, stored objects have one master key containing
 the latest version's metadada, and one key per object version or delete
 marker, however if the last version is a delete marker the master is not
 kept. This makes the storage requirements of the v1 buckets slightly smaller
 than v0.

- On versioning-suspended buckets, all version and master keys created
 before the suspension of versioning are kept, and all new puts only update
 the master key. this is the same behavior as v0.

#### Migration from v0 to v1

No automatic / inline migration of buckets is provided as of now.

### Dealing with Concurrency

We chose not to use transactions (aka
[https://docs.mongodb.com/manual/tutorial/perform-two-phase-commits/)
because it is a known fact there is an overhead of using them, and we
thought there was no real need for them since we could leverage Mongo
ordered operations guarantees and atomic writes.

Example of corner cases:

#### CreateBucket()

Since it is not possible to create a collection AND at the same time
register the bucket in the Metastore we chose to only update the
Metastore. A non-existing collection (NamespaceNotFound error in
Mongo) is one possible normal state for an empty bucket.

#### DeleteBucket()

In this case the bucket is *locked* by the upper layers (use of a
transient delete flag) so we don't have to worry about that and by the
fact the bucket is empty neither (which is also checked by the upper
layers).

We first drop() the collection and then we asynchronously delete the
bucket name entry from the metastore (the removal from the metastore
is atomic which is not absolutely necessary in this case but more
robust in term of design).

If we fail in between we still have an entry in the metastore which is
good because we need to manage the delete flag. For the upper layers
the operation has not completed until this flag is removed. The upper
layers will restart the deleteBucket() which is fine because we manage
the case where the collection does not exist.

#### PutObject() with a Version

We need to store the versioned object then update the master object
(the latest version). For this we use the
[BulkWrite](http://mongodb.github.io/node-mongodb-native/3.0/api/Collection.html#bulkWrite)
method. This is not a transaction but guarantees that the 2 operations
will happen sequentially in the MongoDB oplog. Indeed if the
BulkWrite() fails in between we would end up creating an orphan (which
is not critical) but if the operation succeeds then we are sure that
the master is always pointing to the right object. If there is a
concurrency between 2 clients then we are sure that the 2 groups of
operations will be clearly decided in the oplog (the last writer will
win).

#### DeleteObject()

This is probably the most complex case to manage because it involves a
lot of different cases:

##### Deleting an Object when Versioning is not Enabled

This case is a straightforward atomic delete. Atomicity is not really
required because we assume version IDs are random enough but it is
more robust to do so.

##### Deleting an Object when Versioning is Enabled

This case is more complex since we have to deal with the 2 cases:

Case 1: The caller asks for a deletion of a version which is not a master:
This case is a straight-forward atomic delete.

Case 2: The caller asks for a deletion of a version which is the master: In
this case we need to create a special flag called PHD (as PlaceHolDer)
that indicates the master is no longer valid (with a new unique
virtual version ID). We force the ordering of operations in a
bulkWrite() to first replace the master with the PHD flag and then
physically delete the version. If the call fail in between we will be
left with a master with a PHD flag. If the call succeeds we try to
find if the master with the PHD flag is left alone in such case we
delete it otherwise we trigger an asynchronous repair that will spawn
after AYNC_REPAIR_TIMEOUT=15s that will reassign the master to the
latest version.

In all cases the physical deletion or the repair of the master are
checked against the PHD flag AND the actual unique virtual version
ID. We do this to check against potential concurrent deletions,
repairs or updates. Only the last writer/deleter has the right to
physically perform the operation, otherwise it is superseded by other
operations.

##### Getting an object with a PHD flag

If the caller is asking for the latest version of an object and the
PHD flag is set we perform a search on the bucket to find the latest
version and we return it.

#### Listing Objects

The mongoclient backend implements a readable key/value stream called
*MongoReadStream* that follows the LevelDB duck typing interface used
in Arsenal/lib/algos listing algorithms. Note it does not require any
LevelDB package.

#### Generating the UUID

To avoid race conditions we always (try to) generate a new UUID and we
condition the insertion to the non-existence of the document.
