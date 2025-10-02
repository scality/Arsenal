import { parseString } from 'xml2js';
import errors, { ArsenalError, errorInstances } from '../errors';

/** BucketLoggingStatus constants, not documented by AWS but found via testing */
const TARGET_BUCKET_MIN_LENGTH = 3;
const TARGET_BUCKET_MAX_LENGTH = 255;
const TARGET_PREFIX_MAX_LENGTH = 800;

/**
 * Format of xml request:
 * https://docs.aws.amazon.com/AmazonS3/latest/API/API_LoggingEnabled.html
 * https://docs.aws.amazon.com/AmazonS3/latest/API/API_PutBucketLogging.html
 * 
<?xml version="1.0" encoding="UTF-8"?>
<BucketLoggingStatus xmlns="http://s3.amazonaws.com/doc/2006-03-01/">
   <LoggingEnabled>
      <TargetBucket>string</TargetBucket>
      <TargetGrants>
         <Grant>
            <Grantee>
               <DisplayName>string</DisplayName>
               <EmailAddress>string</EmailAddress>
               <ID>string</ID>
               <xsi:type>string</xsi:type>
               <URI>string</URI>
            </Grantee>
            <Permission>string</Permission>
         </Grant>
      </TargetGrants>
      <TargetObjectKeyFormat>
         <PartitionedPrefix>
            <PartitionDateSource>string</PartitionDateSource>
         </PartitionedPrefix>
         <SimplePrefix>
         </SimplePrefix>
      </TargetObjectKeyFormat>
      <TargetPrefix>string</TargetPrefix>
   </LoggingEnabled>
</BucketLoggingStatus>
*/

export type LoggingEnabled = {
    TargetBucket: string;
    TargetPrefix: string;
    // TargetGrants and TargetObjectKeyFormat are not implemented.
};

export default class BucketLoggingStatus {
    private _loggingEnabled?: LoggingEnabled;

    constructor(loggingEnabled?: LoggingEnabled) {
        this._loggingEnabled = loggingEnabled;
    }

    getLoggingEnabled(): LoggingEnabled | undefined {
        return this._loggingEnabled;
    }

    toXML(): string {
        let loggingEnabledXML = "";
        if (this._loggingEnabled) {
            loggingEnabledXML = `<LoggingEnabled>
    <TargetBucket>${this._loggingEnabled.TargetBucket}</TargetBucket>
    <TargetPrefix>${this._loggingEnabled.TargetPrefix}</TargetPrefix>
</LoggingEnabled>
`;
        }

        return `<?xml version="1.0" encoding="UTF-8"?>
<BucketLoggingStatus xmlns="http://s3.amazonaws.com/doc/2006-03-01/">
    ${loggingEnabledXML}
</BucketLoggingStatus>
`;
    }

    static fromXML(
        data: string,
    ): { error?: { arsenalError: ArsenalError, details: any }; res?: BucketLoggingStatus; } {
        let parsed, parseError;

        try {
            parseString(data, (err: any, res: any) => {
                parseError = err;
                parsed = res;
            });

            if (parseError) {
                return {
                    error: { arsenalError: errors.MalformedXML, details: parseError },
                };
            }
        } catch (err) {
            return {
                error: { arsenalError: errors.MalformedXML, details: err },
            };
        }

        if (!parsed) {
            return {
                error: { arsenalError: errors.MalformedXML, details: 'request xml is undefined or empty' },
            };
        }

        if (!parsed.BucketLoggingStatus) {
            return {
                error: { arsenalError: errors.MalformedXML, details: 'missing BucketLoggingStatus root' },
            };
        }

        let loggingEnabled: LoggingEnabled | undefined = undefined;
        if (parsed.BucketLoggingStatus.LoggingEnabled) {
            const loggingEnabledData = parsed.BucketLoggingStatus.LoggingEnabled[0];

            if (
                !Object.prototype.hasOwnProperty.call(loggingEnabledData, 'TargetBucket') ||
                loggingEnabledData.TargetBucket === null ||
                loggingEnabledData.TargetBucket === undefined
            ) {
                return {
                    error: {
                        arsenalError: errors.MalformedXML,
                        details: 'missing TargetBucket field in LoggingEnabled',
                    },
                };
            } else if (loggingEnabledData.TargetBucket[0].length < TARGET_BUCKET_MIN_LENGTH) {
                return {
                    error: {
                        arsenalError: errors.InvalidBucketName,
                        details: `TargetBucket field length < ${TARGET_BUCKET_MIN_LENGTH}`,
                    },
                };
            } else if (loggingEnabledData.TargetBucket[0].length > TARGET_BUCKET_MAX_LENGTH) {
                return {
                    error: {
                        arsenalError: errors.InvalidBucketName,
                        details: `TargetBucket field length > ${TARGET_BUCKET_MAX_LENGTH}`,
                    },
                };
            }

            if (
                !Object.prototype.hasOwnProperty.call(loggingEnabledData, 'TargetPrefix') ||
                loggingEnabledData.TargetPrefix === null ||
                loggingEnabledData.TargetPrefix === undefined
            ) {
                return {
                    error: {
                        arsenalError: errors.MalformedXML,
                        details: 'missing TargetPrefix field in LoggingEnabled',
                    },
                };
            } else if (loggingEnabledData.TargetPrefix[0].length > TARGET_PREFIX_MAX_LENGTH) {
                return {
                    error: {
                        arsenalError: errorInstances.InvalidArgument
                            .customizeDescription(`Field exceeds ${TARGET_PREFIX_MAX_LENGTH} bytes`)
                            .addMetadataEntry('invalidArguments',
                                [{ ArgumentName: 'TargetPrefix', ArgumentValue: loggingEnabledData.TargetPrefix[0] }]),
                        details: `TargetPrefix field length > ${TARGET_PREFIX_MAX_LENGTH}`,
                    },
                };
            }

            if (loggingEnabledData.TargetGrants) {
                return {
                    error: {
                        arsenalError: errors.NotImplemented,
                        details: 'TargetGrants field in LoggingEnabled is not implemented',
                    },
                };
            }

            if (loggingEnabledData.TargetObjectKeyFormat) {
                return {
                    error: {
                        arsenalError: errors.NotImplemented,
                        details: 'TargetObjectKeyFormat field in LoggingEnabled is not implemented',
                    },
                };
            }

            loggingEnabled = {
                TargetBucket: loggingEnabledData.TargetBucket[0],
                TargetPrefix: loggingEnabledData.TargetPrefix[0],
            };
        }

        return {
            error: undefined,
            res: new BucketLoggingStatus(loggingEnabled),
        };
    }
};
