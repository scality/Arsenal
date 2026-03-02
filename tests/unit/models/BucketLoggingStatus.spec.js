const assert = require('assert');
const BucketLoggingStatus = require('../../../lib/models/BucketLoggingStatus').default;
const { parseString } = require('xml2js');

describe('BucketLoggingStatus', () => {
    describe('Constructor', () => {
        it('should initialize with undefined when no parameters provided', () => {
            const config = new BucketLoggingStatus();
            assert.strictEqual(config.getLoggingEnabled(), undefined);
        });

        it('should initialize with LoggingEnabled when provided', () => {
            const loggingEnabled = {
                TargetBucket: 'my-bucket',
                TargetPrefix: 'logs/',
            };
            const config = new BucketLoggingStatus(loggingEnabled);
            assert.deepStrictEqual(config.getLoggingEnabled(), loggingEnabled);
        });
    });

    describe('toXML', () => {
        it('should generate XML without LoggingEnabled when not configured', done => {
            const config = new BucketLoggingStatus();
            const xml = config.toXML();

            // Parse the XML and check that BucketLoggingStatus is empty (no LoggingEnabled)
            parseString(xml, { explicitArray: false }, (err, result) => {
                assert.ifError(err);
                assert(result.BucketLoggingStatus);
                // Should not have LoggingEnabled property
                assert.strictEqual(result.BucketLoggingStatus.LoggingEnabled, undefined);
                done();
            });
        });

        it('should generate XML with LoggingEnabled when configured', done => {
            const loggingEnabled = {
                TargetBucket: 'my-log-bucket',
                TargetPrefix: 'logs/2025/',
            };
            const config = new BucketLoggingStatus(loggingEnabled);
            const xml = config.toXML();

            parseString(xml, { explicitArray: false }, (err, result) => {
                assert.ifError(err);
                assert(result.BucketLoggingStatus);
                const logging = result.BucketLoggingStatus.LoggingEnabled;
                assert(logging);
                assert.strictEqual(logging.TargetBucket, 'my-log-bucket');
                assert.strictEqual(logging.TargetPrefix, 'logs/2025/');
                done();
            });
        });
    });

    describe('fromXML', () => {
        describe('Success cases', () => {
            it('should parse XML with LoggingEnabled', () => {
                const xml = '<?xml version="1.0" encoding="UTF-8"?>' +
                    '<BucketLoggingStatus xmlns="http://s3.amazonaws.com/doc/2006-03-01">' +
                    '<LoggingEnabled>' +
                    '<TargetBucket>loggingbucket</TargetBucket>' +
                    '<TargetPrefix>my-app-logs/2025/</TargetPrefix>' +
                    '</LoggingEnabled>' +
                    '</BucketLoggingStatus>';

                const result = BucketLoggingStatus.fromXML(xml);

                assert.strictEqual(result.error, undefined);
                assert(result.res instanceof BucketLoggingStatus);
                const loggingEnabled = result.res.getLoggingEnabled();
                assert.strictEqual(loggingEnabled.TargetBucket, 'loggingbucket');
                assert.strictEqual(loggingEnabled.TargetPrefix, 'my-app-logs/2025/');
            });

            it('should parse XML without LoggingEnabled (empty config)', () => {
                const xml = '<?xml version="1.0" encoding="UTF-8"?>' +
                    '<BucketLoggingStatus xmlns="http://s3.amazonaws.com/doc/2006-03-01">' +
                    '</BucketLoggingStatus>';

                const result = BucketLoggingStatus.fromXML(xml);

                assert.strictEqual(result.error, undefined);
                assert(result.res instanceof BucketLoggingStatus);
                assert.strictEqual(result.res.getLoggingEnabled(), undefined);
            });

            it('should parse XML without LoggingEnabled (self closing)', () => {
                const xml = '<?xml version="1.0" encoding="UTF-8"?>' +
                    '<BucketLoggingStatus xmlns="http://s3.amazonaws.com/doc/2006-03-01" />';

                const result = BucketLoggingStatus.fromXML(xml);

                assert.strictEqual(result.error, undefined);
                assert(result.res instanceof BucketLoggingStatus);
                assert.strictEqual(result.res.getLoggingEnabled(), undefined);
            });

            it('should parse XML with empty TargetPrefix', () => {
                const xml = '<?xml version="1.0" encoding="UTF-8"?>' +
                    '<BucketLoggingStatus xmlns="http://s3.amazonaws.com/doc/2006-03-01">' +
                    '<LoggingEnabled>' +
                    '<TargetBucket>loggingbucket</TargetBucket>' +
                    '<TargetPrefix></TargetPrefix>' +
                    '</LoggingEnabled>' +
                    '</BucketLoggingStatus>';

                const result = BucketLoggingStatus.fromXML(xml);

                assert.strictEqual(result.error, undefined);
                assert(result.res instanceof BucketLoggingStatus);
                const loggingEnabled = result.res.getLoggingEnabled();
                assert.strictEqual(loggingEnabled.TargetBucket, 'loggingbucket');
                assert.strictEqual(loggingEnabled.TargetPrefix, '');
            });
        });

        describe('Error cases - MalformedXML', () => {
            it('should return error for invalid XML', () => {
                const xml = 'not valid xml';

                const result = BucketLoggingStatus.fromXML(xml);

                assert(result.error);
                assert.strictEqual(result.error.arsenalError.MalformedXML, true);
                assert.strictEqual(result.res, undefined);
            });

            it('should return error for empty string', () => {
                const xml = '';

                const result = BucketLoggingStatus.fromXML(xml);

                assert(result.error);
                assert.strictEqual(result.error.arsenalError.MalformedXML, true);
                assert.strictEqual(result.error.details, 'request xml is undefined or empty');
                assert.strictEqual(result.res, undefined);
            });

            it('should return error for XML without BucketLoggingStatus root tag', () => {
                const xml = '<?xml version="1.0" encoding="UTF-8"?>' +
                    '<WrongTag></WrongTag>';

                const result = BucketLoggingStatus.fromXML(xml);

                assert(result.error);
                assert.strictEqual(result.error.arsenalError.MalformedXML, true);
                assert.strictEqual(result.error.details, 'missing BucketLoggingStatus root');
                assert.strictEqual(result.res, undefined);
            });

            it('should return error when TargetBucket is missing', () => {
                const xml = '<?xml version="1.0" encoding="UTF-8"?>' +
                    '<BucketLoggingStatus xmlns="http://s3.amazonaws.com/doc/2006-03-01">' +
                    '<LoggingEnabled>' +
                    '<TargetPrefix>logs/</TargetPrefix>' +
                    '</LoggingEnabled>' +
                    '</BucketLoggingStatus>';

                const result = BucketLoggingStatus.fromXML(xml);

                assert(result.error);
                assert.strictEqual(result.error.arsenalError.MalformedXML, true);
                assert.strictEqual(result.error.details, 'missing TargetBucket field in LoggingEnabled');
                assert.strictEqual(result.res, undefined);
            });

            it('should return error when TargetPrefix is missing', () => {
                const xml = '<?xml version="1.0" encoding="UTF-8"?>' +
                    '<BucketLoggingStatus xmlns="http://s3.amazonaws.com/doc/2006-03-01">' +
                    '<LoggingEnabled>' +
                    '<TargetBucket>bucket</TargetBucket>' +
                    '</LoggingEnabled>' +
                    '</BucketLoggingStatus>';

                const result = BucketLoggingStatus.fromXML(xml);

                assert(result.error);
                assert.strictEqual(result.error.arsenalError.MalformedXML, true);
                assert.strictEqual(result.error.details, 'missing TargetPrefix field in LoggingEnabled');
                assert.strictEqual(result.res, undefined);
            });

            it('should return error when TargetBucket length is less than 3', () => {
                const xml = '<?xml version="1.0" encoding="UTF-8"?>' +
                    '<BucketLoggingStatus xmlns="http://s3.amazonaws.com/doc/2006-03-01">' +
                    '<LoggingEnabled>' +
                    '<TargetBucket>ab</TargetBucket>' +
                    '<TargetPrefix>logs/</TargetPrefix>' +
                    '</LoggingEnabled>' +
                    '</BucketLoggingStatus>';

                const result = BucketLoggingStatus.fromXML(xml);

                assert(result.error);
                assert.strictEqual(result.error.arsenalError.InvalidBucketName, true);
                assert.strictEqual(result.error.details, 'TargetBucket field length < 3');
                assert.strictEqual(result.res, undefined);
            });

            it('should return error when TargetBucket length is greater than 255', () => {
                const longBucketName = 'a'.repeat(256);
                const xml = '<?xml version="1.0" encoding="UTF-8"?>' +
                    '<BucketLoggingStatus xmlns="http://s3.amazonaws.com/doc/2006-03-01">' +
                    '<LoggingEnabled>' +
                    `<TargetBucket>${longBucketName}</TargetBucket>` +
                    '<TargetPrefix>logs/</TargetPrefix>' +
                    '</LoggingEnabled>' +
                    '</BucketLoggingStatus>';

                const result = BucketLoggingStatus.fromXML(xml);

                assert(result.error);
                assert.strictEqual(result.error.arsenalError.InvalidBucketName, true);
                assert.strictEqual(result.error.details, 'TargetBucket field length > 255');
                assert.strictEqual(result.res, undefined);
            });

            it('should return error when TargetPrefix length is greater than 800', () => {
                const longPrefix = 'a'.repeat(801);
                const xml = '<?xml version="1.0" encoding="UTF-8"?>' +
                    '<BucketLoggingStatus xmlns="http://s3.amazonaws.com/doc/2006-03-01">' +
                    '<LoggingEnabled>' +
                    '<TargetBucket>bucket</TargetBucket>' +
                    `<TargetPrefix>${longPrefix}</TargetPrefix>` +
                    '</LoggingEnabled>' +
                    '</BucketLoggingStatus>';

                const result = BucketLoggingStatus.fromXML(xml);

                assert(result.error);
                assert.strictEqual(result.error.arsenalError.InvalidArgument, true);
                assert.strictEqual(result.error.details, 'TargetPrefix field length > 800');
                assert.strictEqual(result.res, undefined);
            });
        });

        describe('Error cases - NotImplemented', () => {
            it('should return NotImplemented error when TargetGrants is present', () => {
                const xml = '<?xml version="1.0" encoding="UTF-8"?>' +
                    '<BucketLoggingStatus xmlns="http://s3.amazonaws.com/doc/2006-03-01">' +
                    '<LoggingEnabled>' +
                    '<TargetBucket>bucket</TargetBucket>' +
                    '<TargetPrefix>logs/</TargetPrefix>' +
                    '<TargetGrants><Grant><Grantee><ID>user123</ID></Grantee>' +
                    '<Permission>READ</Permission></Grant></TargetGrants>' +
                    '</LoggingEnabled>' +
                    '</BucketLoggingStatus>';

                const result = BucketLoggingStatus.fromXML(xml);

                assert(result.error);
                assert.strictEqual(result.error.arsenalError.NotImplemented, true);
                assert.strictEqual(result.error.details,
                    'TargetGrants field in LoggingEnabled is not implemented');
                assert.strictEqual(result.res, undefined);
            });

            it('should return NotImplemented error when TargetObjectKeyFormat is present', () => {
                const xml = '<?xml version="1.0" encoding="UTF-8"?>' +
                    '<BucketLoggingStatus xmlns="http://s3.amazonaws.com/doc/2006-03-01">' +
                    '<LoggingEnabled>' +
                    '<TargetBucket>bucket</TargetBucket>' +
                    '<TargetPrefix>logs/</TargetPrefix>' +
                    '<TargetObjectKeyFormat><SimplePrefix></SimplePrefix></TargetObjectKeyFormat>' +
                    '</LoggingEnabled>' +
                    '</BucketLoggingStatus>';

                const result = BucketLoggingStatus.fromXML(xml);

                assert(result.error);
                assert.strictEqual(result.error.arsenalError.NotImplemented, true);
                assert.strictEqual(result.error.details,
                    'TargetObjectKeyFormat field in LoggingEnabled is not implemented');
                assert.strictEqual(result.res, undefined);
            });
        });

        describe('Round-trip conversions', () => {
            it('should successfully round-trip with LoggingEnabled', () => {
                const loggingEnabled = {
                    TargetBucket: 'test-bucket',
                    TargetPrefix: 'app/logs/2025/',
                };
                const config1 = new BucketLoggingStatus(loggingEnabled);
                const xml = config1.toXML();

                const result = BucketLoggingStatus.fromXML(xml);

                assert.strictEqual(result.error, undefined);
                assert(result.res instanceof BucketLoggingStatus);
                const parsed = result.res.getLoggingEnabled();
                assert.strictEqual(parsed.TargetBucket, loggingEnabled.TargetBucket);
                assert.strictEqual(parsed.TargetPrefix, loggingEnabled.TargetPrefix);
            });

            it('should successfully round-trip without LoggingEnabled', () => {
                const config1 = new BucketLoggingStatus();
                const xml = config1.toXML();

                const result = BucketLoggingStatus.fromXML(xml);

                assert.strictEqual(result.error, undefined);
                assert(result.res instanceof BucketLoggingStatus);
                assert.strictEqual(result.res.getLoggingEnabled(), undefined);
            });
        });

        describe('XML escaping for special characters', () => {
            const specialCharacters = ['&', '<', '>', '"', "'"];

            specialCharacters.forEach(char =>
                it(`should escape \`${char}\` in TargetPrefix and generate valid XML`, done => {
                    const loggingEnabled = {
                        TargetBucket: 'test-bucket',
                        TargetPrefix: `logs/app${char}env/`,
                    };
                    const config = new BucketLoggingStatus(loggingEnabled);
                    const xml = config.toXML();

                    // Verify the XML is valid and the character roundtrips by parsing it
                    parseString(xml, { explicitArray: false }, (err, result) => {
                        assert.ifError(err);
                        assert(result.BucketLoggingStatus);
                        const logging = result.BucketLoggingStatus.LoggingEnabled;
                        assert.strictEqual(logging.TargetPrefix, `logs/app${char}env/`);
                        done();
                    });
                })
            );
        });
    });
});
