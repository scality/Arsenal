import assert from 'assert';
const { v4: uuid } = require('uuid');

import type { RequestLogger } from 'werelogs';

import escapeForXml from '../s3middleware/escapeForXml';
import errors, { errorInstances } from '../errors';
import { isValidBucketName } from '../s3routes/routesUtils';
import { Status } from './LifecycleRule';
import type { Backend } from './ObjectMD';

const MAX_RULES = 1000;
const RULE_ID_LIMIT = 255;
const validStorageClasses = ['STANDARD', 'STANDARD_IA', 'REDUCED_REDUNDANCY'];

/**
    Example V1 XML request:

    <ReplicationConfiguration>
        <Role>IAM-role-ARN</Role>
        <Rule>
            <ID>Rule-1</ID>
            <Status>rule-status</Status>
            <Prefix>key-prefix</Prefix>
            <Destination>
                <Bucket>arn:aws:s3:::bucket-name</Bucket>
                <StorageClass>
                    optional-destination-storage-class-override
                </StorageClass>
            </Destination>
        </Rule>
    </ReplicationConfiguration>

    Example V2 XML request:

    <ReplicationConfiguration>
        <Role>arn:aws:iam::123:role/src,arn:aws:iam::111:role/dst</Role>
        <Rule>
            <ID>Rule-1</ID>
            <Status>rule-status</Status>
            <Priority>1</Priority>
            <Filter>
                <Prefix>key-prefix</Prefix>
            </Filter>
            <Destination>
                <Bucket>arn:aws:s3:::bucket-name</Bucket>
                <StorageClass>dest-site</StorageClass>
                <Account>222222222222</Account>
            </Destination>
        </Rule>
    </ReplicationConfiguration>
*/

export type ReplicationFormat = 'v1' | 'v2';

export type Rule = {
    prefix?: string;
    enabled: boolean;
    id: string;
    storageClass?: string;
    priority?: number;
    destination?: string;
    account?: string;
};

export type Destination = {
    StorageClass?: string[];
    Bucket?: string[];
    Account?: string[];
};

export type XMLRule = {
    Prefix?: string[];
    Status: Status[];
    ID?: string[];
    Destination: Destination[];
    Transition?: any[];
    NoncurrentVersionTransition?: any[];
    Filter?: any[];
    Priority?: string[];
};

export type ReplicationConfigurationMetadata = {
    role: string;
    /**
     * @deprecated in favor of per-rule destination field
     */
    destination?: string;
    rules: Rule[];
    preferredReadLocation?: string | null;
    format?: ReplicationFormat;
};

export default class ReplicationConfiguration {
    _parsedXML: any;
    _log: RequestLogger;
    _config: any;
    _configIDs: string[];
    _role: string | null;
    _destination?: string;
    _rules: Rule[] | null;
    _prevStorageClass: null;
    _hasScalityDestination: boolean | null;
    _preferredReadLocation: string | null;
    _format: ReplicationFormat | null;

    /**
     * Create a ReplicationConfiguration instance
     * @param xml - The parsed XML
     * @param log - Werelogs logger
     * @param config - S3 server configuration
     * @return - ReplicationConfiguration instance
     */
    constructor(xml: any, log: RequestLogger, config: any) {
        this._parsedXML = xml;
        this._log = log;
        this._config = config;
        this._configIDs = [];
        this._role = null;
        this._rules = null;
        this._prevStorageClass = null;
        this._hasScalityDestination = null;
        this._preferredReadLocation = null;
        this._format = null;
    }

    /**
     * Get the role of the bucket replication configuration
     * @return - The role if defined, otherwise `null`
     */
    getRole() {
        return this._role;
    }

    /**
     * The bucket to replicate data to
     * @return - The bucket if defined, otherwise `undefined`
     */
    getDestination() {
        return this._destination;
    }

    /**
     * The rules for replication configuration
     * @return - The rules if defined, otherwise `null`
     */
    getRules() {
        return this._rules;
    }

    /**
     * The preferred read location
     *
     * FIXME ideally we should be able to specify one preferred read
     * location for each rule
     */
    getPreferredReadLocation(): string | null {
        return this._preferredReadLocation;
    }

    /**
     * The replication configuration format ('v1' or 'v2'), as submitted.
     */
    getFormat(): ReplicationFormat {
        return this._format ?? 'v2';
    }

    /**
     * Get the replication configuration
     * @return - The replication configuration
     */
    getReplicationConfiguration() {
        return {
            role: this.getRole(),
            destination: this.getDestination(),
            rules: this.getRules(),
            preferredReadLocation: this.getPreferredReadLocation(),
            format: this.getFormat(),
        };
    }

    /**
     * Build the rule object from the parsed XML of the given rule
     * @param rule - The rule object from this._parsedXML
     * @return - The rule object to push into the `Rules` array
     */
    _buildRuleObject(rule: XMLRule) {
        const obj: Rule = {
            id: '',
            prefix: this._extractPrefix(rule),
            enabled: rule.Status[0] === 'Enabled',
        };

        // ID is an optional property, but create one if not provided or is ''.
        // We generate a 48-character alphanumeric, unique ID for the rule.
        obj.id = rule.ID && rule.ID[0] !== '' ? rule.ID[0] : Buffer.from(uuid()).toString('base64');

        // StorageClass is an optional property.
        const storageClass = rule.Destination[0].StorageClass?.[0];
        if (storageClass) {
            obj.storageClass = storageClass;
        }

        const rawPriority = rule.Priority?.[0];
        if (typeof rawPriority === 'string') {
            obj.priority = Number(rawPriority);
        }

        const bucket = rule.Destination[0].Bucket?.[0];
        if (bucket) {
            obj.destination = bucket;
        }

        const account = rule.Destination[0].Account?.[0];
        if (account) {
            obj.account = account;
        }

        return obj;
    }

    /**
     * Resolve the destination role ARN for a rule. The top-level role
     * accepts either a single ARN or a comma-separated `source,destination`
     * pair; the destination side is used when present. If the rule carries
     * an `account` override, its 12-digit ID replaces the account segment.
     */
    static resolveDestinationRole(topRole: string, account?: string): string | undefined {
        if (!topRole) {
            return undefined;
        }
        const roles = topRole.split(',');
        const destRole = roles[1] ?? roles[0];
        if (!account) {
            return destRole;
        }
        const arnParts = destRole.split(':');
        arnParts[4] = account;
        return arnParts.join(':');
    }

    /**
     * Source-role half of the top-level Role field. The field is
     * either a single ARN or a comma-separated `source,destination`
     * pair; this returns the first segment.
     */
    static resolveSourceRole(topRole: string): string {
        return topRole.split(',')[0];
    }

    /**
     * Build the per-backend list for an object key from a bucket
     * replication configuration. Matches rules by prefix, expands
     * each rule's `storageClass` list, dedups, and stamps
     * `destination`/`role` per backend.
     *
     * Dedup key differs by location type: cloud sites collapse on
     * `site` alone (destination and credentials live in the location
     * config), CRR sites collapse on the tuple `(site, destination,
     * role)`. Highest-priority rule wins on collision; missing
     * `priority` is treated as the lowest.
     *
     * @param isCloud - returns true if the named site is a cloud
     *   backend; supplied by the caller because the location-config
     *   model lives outside this class.
     * @param existingBackends - prior backends used to carry forward
     *   `dataStoreVersionId` for sites that already had a backend.
     */
    static resolveBackends(
        config: ReplicationConfigurationMetadata,
        objectKey: string,
        isCloud: (site: string) => boolean,
        existingBackends?: Backend[],
    ): Backend[] {
        const activeRules = (config.rules || []).filter(r => r.enabled && objectKey.startsWith(r.prefix ?? ''));
        if (activeRules.length === 0) {
            return [];
        }

        type Item = { site: string; rule: Rule; destination?: string; role?: string };
        const items: Item[] = [];
        for (const rule of activeRules) {
            if (!rule.storageClass) {
                continue;
            }
            const ruleDest = rule.destination ?? config.destination;
            const ruleRole = ReplicationConfiguration.resolveDestinationRole(config.role, rule.account);
            for (const raw of rule.storageClass.split(',')) {
                const site = raw.split(':')[0];
                items.push({ site, rule, destination: ruleDest, role: ruleRole });
            }
        }

        const byKey = new Map<string, Item>();
        for (const item of items) {
            const cloud = isCloud(item.site);
            const dedupKey = cloud ? item.site : `${item.site}|${item.destination ?? ''}|${item.role ?? ''}`;
            const cur = byKey.get(dedupKey);
            const newP = item.rule.priority ?? -Infinity;
            const curP = cur?.rule.priority ?? -Infinity;
            if (!cur || newP > curP) {
                byKey.set(dedupKey, item);
            }
        }

        const backends: Backend[] = [];
        for (const item of byKey.values()) {
            const existing = existingBackends?.find(b => {
                if (b.site !== item.site) {
                    return false;
                }
                if (isCloud(item.site)) {
                    return true;
                }
                return b.destination === item.destination && b.role === item.role;
            });
            const backend: Backend = existing
                ? { ...existing, status: 'PENDING' }
                : { site: item.site, status: 'PENDING', dataStoreVersionId: '' };
            if (!isCloud(item.site)) {
                if (item.destination) {
                    backend.destination = item.destination;
                }
                if (item.role) {
                    backend.role = item.role;
                }
            }
            backends.push(backend);
        }
        return backends;
    }

    /**
     * Extract the prefix from a rule. If the rule carries a <Filter> element
     * we read <Filter><Prefix>; a self-closing <Filter/> or a <Filter> with no
     * <Prefix> child returns undefined (preserving AWS's wire distinction
     * between "no Prefix" and "empty Prefix"). For v1 we read the top-level
     * <Prefix>; if absent, returns undefined.
     */
    _extractPrefix(rule: XMLRule): string | undefined {
        const filter = Array.isArray(rule.Filter) ? rule.Filter[0] : undefined;
        return filter?.Prefix?.[0] ?? rule.Prefix?.[0];
    }

    /**
     * Check if the Role field of the replication configuration is valid
     * @param ARN - The Role field value provided in the configuration
     * @return `true` if a valid role ARN, `false` otherwise
     */
    _isValidRoleARN(ARN: string) {
        // AWS accepts a range of values for the Role field. Though this does
        // not encompass all constraints imposed by AWS, we have opted to
        // enforce the following.
        const arr = ARN.split(':');
        const isValidRoleARN =
            arr[0] === 'arn' &&
            arr[1] === 'aws' &&
            arr[2] === 'iam' &&
            arr[3] === '' &&
            (arr[4] === '*' || arr[4].length > 1) &&
            arr[5].startsWith('role');
        return isValidRoleARN;
    }

    /**
     * Check that the `Role` property of the configuration is valid
     */
    _parseRole() {
        const parsedRole = this._parsedXML.ReplicationConfiguration.Role;
        if (!parsedRole) {
            return errors.MalformedXML;
        }
        const role: string = parsedRole[0];
        const rolesArr = role.split(',');
        const invalidRoleError = (reason: string) =>
            errorInstances.InvalidArgument.customizeDescription(
                `Invalid Role specified in replication configuration: ${reason}`,
            );

        // Role accepts either a single ARN (used as template for both
        // source and destination) or two comma-separated ARNs (source,
        // destination) when role names differ between sides.
        if (rolesArr.length > 2) {
            return invalidRoleError('Role must be a single ARN or a comma-separated pair');
        }
        if (!this._hasScalityDestination && rolesArr.length > 1) {
            return invalidRoleError('Role may not contain a comma separator');
        }
        const invalidRole = rolesArr.find(r => !this._isValidRoleARN(r));
        if (invalidRole !== undefined) {
            return invalidRoleError(`'${invalidRole}'`);
        }
        this._role = role;
        return undefined;
    }

    /**
     * Check that the `Rules` property array is valid
     */
    _parseRules() {
        // Note that the XML uses 'Rule' while the config object uses 'Rules'.
        const { Rule } = this._parsedXML.ReplicationConfiguration;
        if (!Rule || Rule.length < 1) {
            return errors.MalformedXML;
        }
        if (Rule.length > MAX_RULES) {
            return errorInstances.InvalidRequest.customizeDescription(
                'Number of defined replication rules cannot exceed 1000',
            );
        }

        const err = this._parseEachRule(Rule);
        if (err) {
            return err;
        }
        return undefined;
    }

    /**
     * Check that each rule in the `Rules` property array is valid
     * @param rules - The rule array from this._parsedXML
     */
    _parseEachRule(rules: XMLRule[]) {
        const rulesArr: Rule[] = [];
        for (let i = 0; i < rules.length; i++) {
            const err =
                this._parseStatus(rules[i]) ||
                this._parsePriority(rules[i]) ||
                this._parsePrefix(rules[i]) ||
                this._parseID(rules[i]) ||
                this._parseDestination(rules[i]);

            if (err) {
                return err;
            }

            rulesArr.push(this._buildRuleObject(rules[i]));
        }

        const overlapErr = this._findRuleOverlap(rulesArr);
        if (overlapErr) {
            return overlapErr;
        }

        this._rules = rulesArr;
        return undefined;
    }

    /**
     * Reject configurations where two rules with overlapping prefixes target
     * the same destination on the same site without a distinguishing
     * priority. Rules are grouped by `(site, destination)`: a destination
     * bucket on a given site is one physical place to write, so two rules
     * pointing there with overlapping prefixes are ambiguous regardless of
     * which role they assume. Two rules differing on site or destination
     * fan out to different backends and are not considered overlapping.
     * Comma-separated storageClass lists fan out, and the
     * `:preferred_read` suffix is stripped. All pairs within a group are
     * compared: an overlap is ambiguous unless both rules carry a priority
     * and the two priorities differ.
     */
    _findRuleOverlap(rules: Rule[]) {
        const sitesOf = (rule: Rule): string[] => rule.storageClass?.split(',').map(s => s.split(':')[0]) ?? [''];
        const keyOf = (rule: Rule, site: string): string => `${site}|${rule.destination ?? ''}`;

        const groups = new Map<string, Rule[]>();
        for (const rule of rules) {
            for (const site of sitesOf(rule)) {
                const key = keyOf(rule, site);
                const arr = groups.get(key);
                if (arr) {
                    arr.push(rule);
                } else {
                    groups.set(key, [rule]);
                }
            }
        }

        const prefixOf = (r: Rule) => r.prefix ?? '';
        for (const group of groups.values()) {
            for (let i = 0; i < group.length; i++) {
                for (let j = i + 1; j < group.length; j++) {
                    const a = group[i];
                    const b = group[j];
                    const [shorter, longer] = prefixOf(a).length <= prefixOf(b).length ? [a, b] : [b, a];
                    if (!prefixOf(longer).startsWith(prefixOf(shorter))) {
                        continue;
                    }
                    if (typeof a.priority === 'number' && typeof b.priority === 'number' && a.priority !== b.priority) {
                        continue;
                    }
                    return errorInstances.InvalidRequest.customizeDescription(
                        `Found overlapping prefixes '${prefixOf(a)}' and '${prefixOf(b)}'`,
                    );
                }
            }
        }
        return undefined;
    }

    /**
     * Parse and validate the rule prefix. v1 and v2 differ only in where
     * the prefix lives: top-level <Prefix> for v1, <Filter><Prefix> for
     * v2. The first rule that actually carries a prefix pins the format
     * for the whole configuration; subsequent rules must match.
     */
    _parsePrefix(rule: XMLRule) {
        const hasFilter = Array.isArray(rule.Filter);
        const hasTopPrefix = Array.isArray(rule.Prefix);
        if (hasFilter && hasTopPrefix) {
            return errors.MalformedXML;
        }

        if (hasFilter || hasTopPrefix) {
            const ruleFormat: ReplicationFormat = hasFilter ? 'v2' : 'v1';
            if (this._format === null) {
                this._format = ruleFormat;
            } else if (this._format !== ruleFormat) {
                return errors.MalformedXML;
            }
        }

        if (hasTopPrefix && rule.Prefix!.length > 1) {
            return errors.MalformedXML;
        }

        const prefix = this._extractPrefix(rule);

        if ((prefix?.length ?? 0) > 1024) {
            return errorInstances.InvalidArgument.customizeDescription(
                'Rule prefix cannot be longer than maximum allowed key length of 1024',
            );
        }

        return undefined;
    }

    /**
     * Check that the `Status` property is valid
     * @param rule - The rule object from this._parsedXML
     */
    _parseStatus(rule: XMLRule) {
        const status = rule.Status && rule.Status[0];
        if (!status || !['Enabled', 'Disabled'].includes(status)) {
            return errors.MalformedXML;
        }
        return undefined;
    }

    /**
     * Parse and validate the Priority value. Priority is optional in
     * both v1 and v2 and must be a non-negative integer when present.
     * Cross-rule semantics (same-destination disambiguation) are
     * resolved by the replication runtime.
     */
    _parsePriority(rule: XMLRule) {
        const raw = rule.Priority?.[0];
        if (raw === undefined) {
            return undefined;
        }
        if (!/^\d+$/.test(raw)) {
            return errorInstances.InvalidArgument.customizeDescription('Priority must be a non-negative integer');
        }
        return undefined;
    }

    /**
     * Check that the `ID` property is valid
     * @param rule - The rule object from this._parsedXML
     */
    _parseID(rule: XMLRule) {
        const id = rule.ID && rule.ID[0];
        if (id && id.length > RULE_ID_LIMIT) {
            return errorInstances.InvalidArgument.customizeDescription('Rule ID length cannot be greater than 255');
        }
        // Each ID in a list of rules must be unique.
        if (id && this._configIDs.includes(id)) {
            return errorInstances.InvalidRequest.customizeDescription('Duplicate Rule ID');
        }
        if (id !== undefined) {
            this._configIDs.push(id);
        }
        return undefined;
    }

    /**
     * Check that the `StorageClass` property is valid
     * @param destination - The destination object from this._parsedXML
     */
    _parseStorageClass(destination: Destination) {
        const { replicationEndpoints } = this._config;
        // The only condition where the default endpoint is possibly undefined
        // is if there is only a single replication endpoint.
        const defaultEndpoint =
            replicationEndpoints.find((endpoint: any) => endpoint.default) || replicationEndpoints[0];
        // StorageClass is optional.
        if (destination.StorageClass === undefined) {
            this._hasScalityDestination = defaultEndpoint && defaultEndpoint.type === undefined;
            return undefined;
        }
        const storageClasses = destination.StorageClass[0].split(',');
        const prefReadIndex = storageClasses.findIndex(storageClass => storageClass.endsWith(':preferred_read'));
        if (prefReadIndex !== -1) {
            const prefRead = storageClasses[prefReadIndex].split(':')[0];
            // remove :preferred_read tag from storage class name
            storageClasses[prefReadIndex] = prefRead;
            this._preferredReadLocation = prefRead;
        }
        const isValidStorageClass = storageClasses.every(storageClass => {
            if (validStorageClasses.includes(storageClass)) {
                this._hasScalityDestination = defaultEndpoint && defaultEndpoint.type === undefined;
                return true;
            }
            const endpoint = replicationEndpoints.find((endpoint: any) => endpoint.site === storageClass);
            if (endpoint) {
                // We do not support replication to cold location.
                // Only transition to cold location is supported.
                if (endpoint.site && this._config.locationConstraints[endpoint.site]?.isCold) {
                    return false;
                }
                // If this._hasScalityDestination was not set to true in any
                // previous iteration or by a prior rule's storage class, then
                // check if the current endpoint is a Scality destination.
                if (!this._hasScalityDestination) {
                    // If any endpoint does not have a type, then we know it is
                    // a Scality destination.
                    this._hasScalityDestination = endpoint.type === undefined;
                }
                return true;
            }
            return false;
        });
        if (!isValidStorageClass) {
            return errors.MalformedXML;
        }
        return undefined;
    }

    /**
     * Check that the `Bucket` property is valid
     * @param destination - The destination object from this._parsedXML
     */
    _parseBucket(destination: Destination) {
        const parsedBucketARN = destination.Bucket;
        // If there is no Scality destination, we get the destination bucket
        // from the location configuration.
        if (!this._hasScalityDestination && !parsedBucketARN) {
            return undefined;
        }
        if (!parsedBucketARN) {
            return errors.MalformedXML;
        }
        const bucketARN = parsedBucketARN[0];
        if (!bucketARN) {
            return errorInstances.InvalidArgument.customizeDescription('Destination bucket cannot be null or empty');
        }
        const arr = bucketARN.split(':');
        const isValidARN = arr[0] === 'arn' && arr[1] === 'aws' && arr[2] === 's3' && arr[3] === '' && arr[4] === '';
        if (!isValidARN) {
            return errorInstances.InvalidArgument.customizeDescription('Invalid bucket ARN');
        }
        if (!isValidBucketName(arr[5], [])) {
            return errorInstances.InvalidArgument.customizeDescription('The specified bucket is not valid');
        }

        return undefined;
    }

    /**
     * Check that the `Account` property is valid. Account is optional
     * in both v1 and v2; when present it must be a 12-digit numeric ID
     * and is later used to derive a per-rule destination role.
     * @param destination - The destination object from this._parsedXML
     */
    _parseAccount(destination: Destination) {
        if (!destination.Account) {
            return undefined;
        }

        const account = destination.Account[0];
        if (typeof account !== 'string' || !/^[0-9]{12}$/.test(account)) {
            return errorInstances.InvalidArgument.customizeDescription('Account must be a 12-digit numeric account ID');
        }

        return undefined;
    }

    /**
     * Check that the `destination` property is valid
     * @param rule - The rule object from this._parsedXML
     */
    _parseDestination(rule: XMLRule) {
        const dest = rule.Destination && rule.Destination[0];
        if (!dest) {
            return errors.MalformedXML;
        }
        const err = this._parseStorageClass(dest) || this._parseBucket(dest) || this._parseAccount(dest);
        if (err) {
            return err;
        }
        return undefined;
    }

    /**
     * Check that the request configuration is valid
     */
    parseConfiguration() {
        const err = this._parseRules();
        if (err) {
            return err;
        }
        const { replicationEndpoints } = this._config;
        if (replicationEndpoints.length === 0) {
            return errors.InvalidRequest.customizeDescription('No configured replication endpoint');
        }
        const roleErr = this._parseRole();
        if (roleErr) {
            return roleErr;
        }
        return undefined;
    }

    /**
     * Get the XML representation of the configuration object.
     * v1 and v2 differ only in where the prefix lives (top-level <Prefix>
     * vs <Filter><Prefix>). Account is emitted whenever set, regardless
     * of format. Legacy stored metadata with no `format` field falls
     * back to v1 to preserve the original wire shape.
     * @param config - The bucket replication configuration
     * @return - The XML representation of the configuration
     */
    static getConfigXML(config: ReplicationConfigurationMetadata) {
        const { role, destination, rules, format } = config;
        const isV2 = (format ?? 'v1') === 'v2';

        const rulesXML = rules
            .map(rule => {
                const { prefix, enabled, storageClass, id, priority, destination: ruleDest, account } = rule;

                const ID = `<ID>${escapeForXml(id)}</ID>`;
                const Status = `<Status>${enabled ? 'Enabled' : 'Disabled'}</Status>`;

                const hasPrefix = typeof prefix === 'string';
                const prefixContent =
                    !hasPrefix || prefix === '' ? '<Prefix/>' : `<Prefix>${escapeForXml(prefix)}</Prefix>`;
                const prefixXML = isV2
                    ? hasPrefix
                        ? `<Filter>${prefixContent}</Filter>`
                        : '<Filter/>'
                    : prefixContent;
                const priorityXML = typeof priority === 'number' ? `<Priority>${priority}</Priority>` : '';

                const targetBucket = ruleDest || destination || '';
                const Bucket = `<Bucket>${escapeForXml(targetBucket)}</Bucket>`;
                const StorageClass = storageClass ? `<StorageClass>${storageClass}</StorageClass>` : '';
                const AccountXML = account ? `<Account>${escapeForXml(account)}</Account>` : '';

                const Destination = `<Destination>${Bucket}${StorageClass}${AccountXML}</Destination>`;

                return `<Rule>${ID}${priorityXML}${prefixXML}${Status}${Destination}</Rule>`;
            })
            .join('');

        return (
            `<?xml version="1.0" encoding="UTF-8"?>` +
            `<ReplicationConfiguration xmlns="http://s3.amazonaws.com/doc/2006-03-01/">` +
            `${rulesXML}` +
            `<Role>${escapeForXml(role)}</Role>` +
            `</ReplicationConfiguration>`
        );
    }

    /**
     * Validate the bucket metadata replication configuration structure and
     * value types
     * @param config - The replication configuration to validate
     */
    static validateConfig(config: ReplicationConfigurationMetadata) {
        assert.strictEqual(typeof config, 'object');
        const { role, rules, destination, format } = config;
        assert.strictEqual(typeof role, 'string');
        if (destination != null) {
            assert.strictEqual(typeof destination, 'string');
        }
        if (format !== undefined) {
            assert(format === 'v1' || format === 'v2');
        }
        assert.strictEqual(Array.isArray(rules), true);
        rules.forEach(rule => {
            assert.strictEqual(typeof rule, 'object');
            const { prefix, enabled, id, storageClass, priority, destination, account } = rule;
            assert(prefix === undefined || typeof prefix === 'string');
            assert.strictEqual(typeof enabled, 'boolean');
            assert(id === undefined || typeof id === 'string');
            if (storageClass !== undefined) {
                assert.strictEqual(typeof storageClass, 'string');
            }
            if (priority !== undefined) {
                assert.strictEqual(typeof priority, 'number');
            }
            if (destination !== undefined) {
                assert.strictEqual(typeof destination, 'string');
            }
            if (account !== undefined) {
                assert.strictEqual(typeof account, 'string');
            }
        });
    }
}
