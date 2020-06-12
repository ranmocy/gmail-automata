import {MessageData} from './ThreadData';
import {assert} from './utils';

enum ConditionType {
    AND, OR, SUBJECT, FROM, TO, CC, BCC, LIST, SENDER, RECEIVER, BODY,
}

/**
 * S expression represents condition in rule.
 *
 * Syntax:
 * CONDITION_EXP := (OPERATOR CONDITION_LIST) | (MATCHER STRING)
 * OPERATOR := and | or
 * MATCHER := subject | from | to | cc | bcc | list | sender | receiver | content
 * CONDITION_LIST := CONDITION_EXP | CONDITION_EXP CONDITION_LIST
 */
export default class Condition {

    private static parseSubConditions(rest_str: string, condition_str: string): Condition[] {
        const result = [];
        let start = 0, level = 0, length = rest_str.length;
        for (let end = 0; end < length; end++) {
            switch (rest_str[end]) {
                case '(':
                    level++;
                    break;
                case ')':
                    level--;
                    assert(level >= 0, `Condition ${condition_str} has non-balanced parentheses`);
                    if (level === 0) {
                        if (start < end) {
                            const sub_str = rest_str.substring(start, end + 1).trim();
                            if (sub_str.length > 0) {
                                result.push(new Condition(sub_str));
                            }
                        }
                        start = end + 1;
                    }
                    break;
            }
        }
        assert(level === 0, `Condition ${condition_str} has non-balanced parentheses overall.`);
        return result;
    }

    private static escapeRegExp(pattern: string): string {
        return pattern.replace(/[-\/\\^$*+?.()|[\]{}]/g, '\\$&');
    }

    private static parseRegExp(pattern: string, condition_str: string, matching_address: boolean): RegExp {
        assert(pattern.length > 0, `Condition ${condition_str} should have value but not found`);
        if (pattern.startsWith('/') && pattern.endsWith('/')) {
            // normal regexp
            return new RegExp(pattern.substring(1, pattern.length - 1));
        } else if (pattern.startsWith('"') && pattern.endsWith('"')) {
            // exact matching
            return new RegExp(`(^|<)${Condition.escapeRegExp(pattern.substring(1, pattern.length - 1))}($|>)`);
        } else if (matching_address) {
            // ignoring label in address
            return new RegExp(`(^|<)${Condition.escapeRegExp(pattern).replace('@', '(\\+[^@]+)?@')}($|>)`);
        } else {
            // containing matching
            return new RegExp(Condition.escapeRegExp(pattern));
        }
    }

    private readonly type: ConditionType;
    private readonly regexp: RegExp;
    private readonly sub_conditions: Condition[];

    constructor(condition_str: string) {
        condition_str = condition_str.trim();
        assert(condition_str.startsWith('(') && condition_str.endsWith(')'),
            `Condition ${condition_str} should be surrounded by ().`);
        const first_space = condition_str.indexOf(" ");
        const type_str = condition_str.substring(1, first_space).trim().toUpperCase();
        const rest_str = condition_str.substring(first_space + 1, condition_str.length - 1).trim();
        this.type = ConditionType[type_str as keyof typeof ConditionType];
        switch (this.type) {
            case ConditionType.AND:
            case ConditionType.OR: {
                this.sub_conditions = Condition.parseSubConditions(rest_str, condition_str);
                break;
            }
            case ConditionType.FROM:
            case ConditionType.TO:
            case ConditionType.CC:
            case ConditionType.BCC:
            case ConditionType.LIST:
            case ConditionType.SENDER:
            case ConditionType.RECEIVER: {
                this.regexp = Condition.parseRegExp(rest_str, condition_str, true);
                break;
            }
            case ConditionType.SUBJECT:
            case ConditionType.BODY: {
                this.regexp = Condition.parseRegExp(rest_str, condition_str, false);
                break;
            }
            default:
                throw `Unexpected condition type ${type_str} from ${condition_str}.`;
        }
    }

    match(message_data: MessageData): boolean {
        switch (this.type) {
            case ConditionType.AND: {
                for (const sub_condition of this.sub_conditions) {
                    if (!sub_condition.match(message_data)) {
                        return false;
                    }
                }
                return true;
            }
            case ConditionType.OR: {
                for (const sub_condition of this.sub_conditions) {
                    if (sub_condition.match(message_data)) {
                        return true;
                    }
                }
                return false;
            }
            case ConditionType.FROM: {
                return this.matchAddress(message_data.from);
            }
            case ConditionType.TO: {
                return this.matchAddress(...message_data.to);
            }
            case ConditionType.CC: {
                return this.matchAddress(...message_data.cc);
            }
            case ConditionType.BCC: {
                return this.matchAddress(...message_data.bcc);
            }
            case ConditionType.LIST: {
                return this.matchAddress(message_data.list);
            }
            case ConditionType.SENDER: {
                return this.matchAddress(message_data.from);
            }
            case ConditionType.RECEIVER: {
                return this.matchAddress(...message_data.receivers);
            }
            case ConditionType.SUBJECT: {
                return this.regexp.test(message_data.subject);
            }
            case ConditionType.BODY: {
                return this.regexp.test(message_data.body);
            }
        }
    }

    private matchAddress(...addresses: string[]) {
        return addresses.some(address => this.regexp.test(address));
    }

    toString(): string {
        const type_str = ConditionType[this.type];
        const regexp_str = this.regexp ? this.regexp.source : "";
        const sub_str = this.sub_conditions ? "\n" + this.sub_conditions.map(c => c.toString()).join("\n") : "";
        return `(${type_str} ${regexp_str} ${sub_str})`;
    }

    public static testAll() {
        function t(condition_str: string, target_str: string, is_address: boolean, should_matching: boolean) {
            const regexp = Condition.parseRegExp(condition_str, "", is_address);
            assert(regexp.test(target_str) === should_matching,
                `Expect ${condition_str}(${regexp.source}) to match ${target_str}, but failed`);
        }

        // matching address ignoring labels
        t('some-mailing-list@gmail.com', 'some-mailing-list@gmail.com', true, true);
        t('some-mailing-list@gmail.com', 'prefix-some-mailing-list@gmail.com', true, false);
        t('some-mailing-list@gmail.com', 'some-mailing-list-suffix@gmail.com', true, false);
        t('some-mailing-list@gmail.com', 'some-mailing-list+tag1@gmail.com', true, true);

        // matching address with name
        t('abc@gmail.com', '<abc@gmail.com>', true, true);
        t('abc@gmail.com', '<abc+dd@gmail.com>', true, true);
        t('abc@gmail.com', 'dd <abc+dd@gmail.com>', true, true);

        // if label is specified, then it's required
        t('some-mailing-list+tag1@gmail.com', 'some-mailing-list@gmail.com', true, false);
        t('some-mailing-list+tag1@gmail.com', 'some-mailing-list+tag1@gmail.com', true, true);
        t('some-mailing-list+tag1@gmail.com', 'some-mailing-list+tag2@gmail.com', true, false);

        // exact matching
        t('"some-mailing-list@gmail.com"', 'some-mailing-list@gmail.com', true, true);
        t('"some-mailing-list@gmail.com"', 'prefix-some-mailing-list@gmail.com', true, false);
        t('"some-mailing-list@gmail.com"', 'some-mailing-list-suffix@gmail.com', true, false);
        t('"some-mailing-list@gmail.com"', 'some-mailing-list+tag1@gmail.com', true, false);

        // exact matching with tag
        t('"some-mailing-list+tag1@gmail.com"', 'some-mailing-list@gmail.com', true, false);
        t('"some-mailing-list+tag1@gmail.com"', 'some-mailing-list+tag1@gmail.com', true, true);
        t('"some-mailing-list+tag1@gmail.com"', 'some-mailing-list+tag2@gmail.com', true, false);

        // regexp matching
        t('/some-.*@gmail.com/', 'some-mailing-list@gmail.com', true, true);
        t('/some-.*@gmail.com/', 'some-mailing-list+tag@gmail.com', true, true);
        t('/some-.*@gmail.com/', 'some2-mailing-list@gmail.com', true, false);

        const base_message = {
            getFrom: () => '',
            getTo: () => '',
            getCc: () => '',
            getBcc: () => '',
            getReplyTo: () => '',
            getSubject: () => '',
            getPlainBody: () => '',
            getRawContent: () => '',
        } as GoogleAppsScript.Gmail.GmailMessage;

        function c(condition_str: string, message: Partial<GoogleAppsScript.Gmail.GmailMessage>, expected: boolean) {
            const condition = new Condition(condition_str);
            const message_data = new MessageData(Object.assign({}, base_message, message));
            assert(condition.match(message_data) === expected,
                `Expected ${condition_str} matches email ${message}, but failed`);
        }

        c(`(and
             (from abc@gmail.com)
             (or
               (receiver ijl@gmail.com)
               (receiver xyz@gmail.com)))`,
            {
                getFrom: () => 'dd <abc+dd@gmail.com>',
                getTo: () => 'something+-random@gmail.com',
                getCc: () => 'xyz+tag@gmail.com',
            },
            true);
        c(`(or
             (receiver abc@gmail.com)
             (receiver abc@corp.com))`,
            {
                getFrom: () => 'DDD EEE <def@corp.com>',
                getTo: () => 'AAA BBB <abc@corp.com>, DDD EEE <def@corp.com>',
            },
            true);
    }
}
