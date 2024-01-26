'use strict'; // eslint-disable-line strict

const assert = require('assert');
const async = require('async');

// Mocking official nodejs aws client
const { mockClient } = require('aws-sdk-client-mock')
const { KMSClient, CreateKeyCommand, ScheduleKeyDeletionCommand, GenerateDataKeyCommand, EncryptCommand, DecryptCommand } = require('@aws-sdk/client-kms')

const arsenalErrors = require ('../../../lib/errors/arsenalErrors');
const KMS_AWS_Client = require('../../../lib/network/kms_aws/Client').default;

describe('KMS AWS Client', () => {
    const options = {
        kms_aws: {
            region: "test-region-1",
            endpoint: "http://mocked.doesnt.matter"
        }
    };

    const kmsClient = new KMS_AWS_Client(options);

    // Mock the AWS client
    let mockedAwsClient = mockClient(KMSClient);

    // Mock the send method to allow using callbacks
    // Note: we cannot replace the whole aws client with its mocked version
    // because the current mocking implementation doesn't support callbacks
    // See https://github.com/m-radzikowski/aws-sdk-client-mock/issues/6
    kmsClient.client.send = function (cmd, cbOrOption, cb = null) {
        if (! cb && typeof(cbOrOption) === "function") {
            cb = cbOrOption;
        }

        let mocked_call = mockedAwsClient.send(cmd);

        // mocked_call is undefined when parameters doesn't match those expected.
        expect(mocked_call).toBeDefined()

        let got_error = false;
        mocked_call.catch((err) => {
                got_error = true;
                cb(err)
            })
            // Order is important here: the catch is done before
            // so it doesn't catch exceptions raised by Jest in case of
            // test failure
            .then((data) => {
                // Looks like this "then" statement is alway run after
                // a catch. We check for errors handled in the catch to
                // avoid a double invocation of the callback.
                if (!got_error) {
                    cb(null, data);
                }
            })
    }

    beforeEach(() => {
        mockedAwsClient.reset();
    });

    it('should create a new key on bucket creation', done => {
        mockedAwsClient.on(CreateKeyCommand).resolves({
            KeyMetadata: {
                KeyId: "mocked-kms-key-id"
            }
        });
        
        kmsClient.createBucketKey('plop', logger, (err, bucketKeyId) => {
            // Check the result
            expect(err).toBeNull();
            expect(bucketKeyId).toEqual("mocked-kms-key-id");

            // Check that the CreateKey of the aws client have been used to create the key
            expect(mockedAwsClient.commandCalls(CreateKeyCommand).length).toEqual(1);

            done();
        });
    });

    it('should handle errors creating the key on bucket creation', done => {
        mockedAwsClient.on(CreateKeyCommand).rejects("Error");
        
        kmsClient.createBucketKey('plop', logger, (err, bucketKeyId) => {
            // Check the result
            expect(bucketKeyId).toBeUndefined();
            expect(err).toEqual(Error('InternalError'));

            // Check that the CreateKey of the aws client have been used to create the key
            expect(mockedAwsClient.commandCalls(CreateKeyCommand).length).toEqual(1);

            done();
        });
    });

    it('should delete an existing key on bucket deletion', done => {
        mockedAwsClient.on(ScheduleKeyDeletionCommand, {
            KeyId: "mocked-kms-key-id",
            PendingWindowInDays: 7 // Should be set to 7 (the minimum accepted value on this operation)
        }).resolves({
            KeyId: "mocked-kms-key-id",
            KeyState: "PendingDeletion",
            PendingWindowInDays: 7
        });
        
        kmsClient.destroyBucketKey('mocked-kms-key-id', logger, (err) => {
            // Check the result
            expect(err).toBeUndefined();

            // Check that the ScheduleKeyDeletion of the aws client have been invoked
            expect(mockedAwsClient.commandCalls(ScheduleKeyDeletionCommand).length).toEqual(1);

            done();
        });
    });

    it('should handle errors deleting an existing key on bucket deletion', done => {
        mockedAwsClient.on(ScheduleKeyDeletionCommand, {
            KeyId: "mocked-kms-key-id",
            PendingWindowInDays: 7 // Should be set to 7 (the minimum accepted value on this operation)
        }).rejects("Error");
        
        kmsClient.destroyBucketKey('mocked-kms-key-id', logger, (err) => {
            // Check the result
            expect(err).toEqual(Error('InternalError'));

            // Check that the ScheduleKeyDeletion of the aws client have been invoked
            expect(mockedAwsClient.commandCalls(ScheduleKeyDeletionCommand).length).toEqual(1);

            done();
        });
    });

    it('should generate a datakey for ciphering', done => {
        mockedAwsClient.on(GenerateDataKeyCommand).resolves({
            CiphertextBlob: "encryptedDataKey",
            Plaintext: "dataKey",
            KeyId: "mocked-kms-key-id"
        });
        
        kmsClient.generateDataKey(1, "mocked-kms-key-id", logger, (err, plaintextDataKey, cipheredDataKey) => {
            // Check the result
            expect(err).toBeNull();
            expect(plaintextDataKey).toEqual(Buffer("dataKey"));
            expect(cipheredDataKey).toEqual(Buffer("encryptedDataKey"));

            // Check that the the aws client have been used to create the data key
            expect(mockedAwsClient.commandCalls(GenerateDataKeyCommand).length).toEqual(1);

            done();
        });
    });

    it('should handle errors generating a datakey', done => {
        mockedAwsClient.on(GenerateDataKeyCommand).rejects("Error");
        
        kmsClient.generateDataKey(1, "mocked-kms-key-id", logger, (err, plaintextDataKey, cipheredDataKey) => {
            // Check the result
            expect(plaintextDataKey).toBeUndefined();
            expect(cipheredDataKey).toBeUndefined();
            expect(err).toEqual(Error('InternalError'));

            // Check that the the aws client have been used to create the data key
            expect(mockedAwsClient.commandCalls(GenerateDataKeyCommand).length).toEqual(1);

            done();
        });
    });

    it('should allow ciphering a datakey', done => {
        mockedAwsClient.on(EncryptCommand, {
            KeyId: "mocked-kms-key-id",
            Plaintext: "dataKey-value",
            EncryptionContext: undefined,
            GrantTokens: undefined,
            EncryptionAlgorithm: undefined
        }).resolves({
            CiphertextBlob: "encryptedDataKey-value",
            KeyId: "mocked-kms-key-id"
        });
        
        kmsClient.cipherDataKey(1, "mocked-kms-key-id", "dataKey-value", logger, (err, cipheredDataKey) => {
            // Check the result
            expect(err).toBeNull();
            expect(cipheredDataKey).toEqual(Buffer("encryptedDataKey-value"));

            // Check that the Encrypt of the aws client has been used
            expect(mockedAwsClient.commandCalls(EncryptCommand).length).toEqual(1);

            done();
        });
    });

    it('should handle errors ciphering a datakey', done => {
        mockedAwsClient.on(EncryptCommand, {
            KeyId: "mocked-kms-key-id",
            Plaintext: "dataKey-value",
            EncryptionContext: undefined,
            GrantTokens: undefined,
            EncryptionAlgorithm: undefined
        }).rejects("Error");
        
        kmsClient.cipherDataKey(1, "mocked-kms-key-id", "dataKey-value", logger, (err, cipheredDataKey) => {
            // Check the result
            expect(cipheredDataKey).toBeUndefined();
            expect(err).toEqual(Error('InternalError'));

            // Check that the Encrypt of the aws client have been used
            expect(mockedAwsClient.commandCalls(EncryptCommand).length).toEqual(1);

            done();
        });
    });

    it('should allow deciphering a datakey', done => {
        mockedAwsClient.on(DecryptCommand, {
            KeyId: undefined, // Key id is embedded in the CiphertextBlob
            CiphertextBlob: "encryptedDataKey-value",
            EncryptionContext: undefined,
            GrantTokens: undefined,
            EncryptionAlgorithm: undefined
        }).resolves({
            Plaintext: "dataKey-value",
            KeyId: "mocked-kms-key-id"
        });
        
        kmsClient.decipherDataKey(1, "mocked-kms-key-id", "encryptedDataKey-value", logger, (err, plainTextDataKey) => {
            // Check the result
            expect(err).toBeNull();
            expect(plainTextDataKey).toEqual(Buffer("dataKey-value"));

            // Check that the Decrypt of the aws client have been used
            expect(mockedAwsClient.commandCalls(DecryptCommand).length).toEqual(1);

            done();
        });
    });

    it('should handle errors deciphering a datakey', done => {
        mockedAwsClient.on(DecryptCommand, {
            KeyId: undefined, // Key id is embedded in the CiphertextBlob
            CiphertextBlob: "encryptedDataKey-value",
            EncryptionContext: undefined,
            GrantTokens: undefined,
            EncryptionAlgorithm: undefined
        }).rejects("Error");
        
        kmsClient.decipherDataKey(1, "mocked-kms-key-id", "encryptedDataKey-value", logger, (err, plainTextDataKey) => {
            // Check the result
            expect(plainTextDataKey).toBeUndefined();
            expect(err).toEqual(Error('InternalError'));

            // Check that the Decrypt of the aws client have been used
            expect(mockedAwsClient.commandCalls(DecryptCommand).length).toEqual(1);

            done();
        });
    });
});
