/**
 * Copyright 2020 Google LLC
 *
 * Licensed under the Apache License, Version 2.0 (the "License");
 * you may not use this file except in compliance with the License.
 * You may obtain a copy of the License at
 *
 *      http://www.apache.org/licenses/LICENSE-2.0
 *
 * Unless required by applicable law or agreed to in writing, software
 * distributed under the License is distributed on an "AS IS" BASIS,
 * WITHOUT WARRANTIES OR CONDITIONS OF ANY KIND, either express or implied.
 * See the License for the specific language governing permissions and
 * limitations under the License.
 */

import {MessageData} from './ThreadData';
import Utils from './utils';

const RE_FLAG_PATTERN = /^\/(.*)\/([gimuys]*)$/;

enum ConditionType {
    AND, OR, NOT, SUBJECT, FROM, TO, CC, BCC, LIST, SENDER, RECEIVER, BODY,
}

/**
 * S expression represents condition in rule.
 *
 * Syntax:
 * CONDITION_EXP := (OPERATOR CONDITION_LIST) | (MATCHER STRING)
 * OPERATOR := and | or | not
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
                    Utils.assert(level >= 0, `Condition ${condition_str} has non-balanced parentheses`);
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
        Utils.assert(level === 0, `Condition ${condition_str} has non-balanced parentheses overall.`);
        return result;
    }

    private static escapeRegExp(pattern: string): string {
        return pattern.replace(/[-\/\\^$*+?.()|[\]{}]/g, '\\$&');
    }

    private static parseRegExp(pattern: string, condition_str: string, matching_address: boolean): RegExp {
        Utils.assert(pattern.length > 0, `Condition ${condition_str} should have value but not found`);
        const match = pattern.match(RE_FLAG_PATTERN);
        if (match !== null) {
            // normal regexp
            const [/* ignored */, p, flags] = match;
            return new RegExp(p, flags);
        } else if (pattern.startsWith('"') && pattern.endsWith('"')) {
            // exact matching
            return new RegExp(`(^|<)${Condition.escapeRegExp(pattern.substring(1, pattern.length - 1))}($|>)`, 'i');
        } else if (matching_address) {
            // ignoring label in address
            return new RegExp(`(^|<)${Condition.escapeRegExp(pattern).replace('@', '(\\+[^@]+)?@')}($|>)`, 'i');
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
        Utils.assert(condition_str.startsWith('(') && condition_str.endsWith(')'),
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
            case ConditionType.NOT: {
                this.sub_conditions = Condition.parseSubConditions(rest_str, condition_str);
                if (this.sub_conditions.length !== 1) {
                  throw `Conditions of type ${type_str} must have exactly one sub-condition, but found ${this.sub_conditions.length}: ${rest_str}`;
                }
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
            case ConditionType.NOT: {
              return !this.sub_conditions[0].match(message_data);
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
                return this.matchAddress(...message_data.sender);
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

    public static testRegex(it: Function, expect: Function) {

        function test_regexp(condition_str: string, target_str: string, is_address: boolean) {
            const regexp = Condition.parseRegExp(condition_str, "", is_address);
            return regexp.test(target_str);
        }

        // Matching address ignoring labels
        it('Matches address', () =>
            expect(test_regexp('some-mailing-list@gmail.com', 'some-mailing-list@gmail.com', true)).toBe(true))
        it('Does not match address with prefix', () =>
            expect(test_regexp('some-mailing-list@gmail.com', 'prefix-some-mailing-list@gmail.com', true)).toBe(false))
        it('Does not match address with suffix', () =>
            expect(test_regexp('some-mailing-list@gmail.com', 'some-mailing-list-suffix@gmail.com', true)).toBe(false))
        it('Matches address, ignoring labels', () =>
            expect(test_regexp('some-mailing-list@gmail.com', 'some-mailing-list+tag1@gmail.com', true)).toBe(true))

        // Matching address with name
        it('Matches address surrounded by <>', () =>
            expect(test_regexp('abc@gmail.com', '<abc@gmail.com>', true)).toBe(true))
        it('Matches address surrounded by <>, ignoring labels', () =>
            expect(test_regexp('abc@gmail.com', '<abc+dd@gmail.com>', true)).toBe(true))
        it('Matches address surrounded by <>, ignoring name prefix', () =>
            expect(test_regexp('abc@gmail.com', 'dd <abc+dd@gmail.com>', true)).toBe(true))

        // If label is specified, then it's required
        it('Does not match if missing label', () =>
            expect(test_regexp('some-mailing-list+tag1@gmail.com', 'some-mailing-list@gmail.com', true)).toBe(false))
        it('Matches address with label', () =>
            expect(test_regexp('some-mailing-list+tag1@gmail.com', 'some-mailing-list+tag1@gmail.com', true)).toBe(true))
        it('Does not match address with incorrect label', () =>
            expect(test_regexp('some-mailing-list+tag1@gmail.com', 'some-mailing-list+tag2@gmail.com', true)).toBe(false))

        // Exact matching
        it('Matches exact address (using quotes)', () =>
            expect(test_regexp('"some-mailing-list@gmail.com"', 'some-mailing-list@gmail.com', true)).toBe(true))
        it('Does not match exact address (using quotes) with prefix', () =>
            expect(test_regexp('"some-mailing-list@gmail.com"', 'prefix-some-mailing-list@gmail.com', true)).toBe(false))
        it('Does not match exact address (using quotes) with suffix', () =>
            expect(test_regexp('"some-mailing-list@gmail.com"', 'some-mailing-list-suffix@gmail.com', true)).toBe(false))
        it('Does not match exact address (using quotes) with label', () =>
            expect(test_regexp('"some-mailing-list@gmail.com"', 'some-mailing-list+tag1@gmail.com', true)).toBe(false))

        // Exact matching with tag
        it('Does not match exact address (using quotes) with label', () =>
            expect(test_regexp('"some-mailing-list+tag1@gmail.com"', 'some-mailing-list@gmail.com', true)).toBe(false))
        it('Matches exact address (using quotes) with label', () =>
            expect(test_regexp('"some-mailing-list+tag1@gmail.com"', 'some-mailing-list+tag1@gmail.com', true)).toBe(true))
        it('Does not match exact address (using quotes) with incorrect label', () =>
            expect(test_regexp('"some-mailing-list+tag1@gmail.com"', 'some-mailing-list+tag2@gmail.com', true)).toBe(false))

        // Matches are case-insensitive
        it('Matches address with different case', () =>
            expect(test_regexp('abc+Def@gmail.com', 'abc+def@gmail.com', true)).toBe(true))
        it('Matches exact address with different case', () =>
            expect(test_regexp('"abc+Def@gmail.com"', 'abc+def@gmail.com', true)).toBe(true))

        // Regexp matching
        it('Matches address using regexp', () =>
            expect(test_regexp('/some-.*@gmail.com/', 'some-mailing-list@gmail.com', true)).toBe(true))
        it('Matches address using regexp with label', () =>
            expect(test_regexp('/some-.*@gmail.com/', 'some-mailing-list+tag@gmail.com', true)).toBe(true))
        it('Does not match address using regexp', () =>
            expect(test_regexp('/some-.*@gmail.com/', 'some2-mailing-list@gmail.com', true)).toBe(false))
        it('Matches address using regexp and case insensitive', () =>
            expect(test_regexp('/feedback access request/i', 'Feedback access request', false)).toBe(true))
        it('Matches content using regexp, case-insensitive and DOTALL', () =>
            expect(test_regexp('/abc.def/si', 'Abc\nDef', false)).toBe(true))
    }

    public static testConditionParsing(it: Function, expect: Function) {
        const base_message = {
            getFrom: () => '',
            getTo: () => '',
            getCc: () => '',
            getBcc: () => '',
            getReplyTo: () => '',
            getSubject: () => '',
            getPlainBody: () => '',
            getHeader: (_name: string) => '',
        } as GoogleAppsScript.Gmail.GmailMessage;

        function test_cond(condition_str: string, message: Partial<GoogleAppsScript.Gmail.GmailMessage>): boolean {
            const condition = new Condition(condition_str);
            const message_data = new MessageData(Object.assign({}, base_message, message));
            return condition.match(message_data);
        }

        it('Matches nested and/or conditions', () => {
            expect(test_cond(`(and
             (from abc@gmail.com)
             (or
               (receiver ijl@gmail.com)
               (receiver xyz@gmail.com)))`,
            {
                getFrom: () => 'dd <abc+dd@gmail.com>',
                getTo: () => 'something+-random@gmail.com',
                getCc: () => 'xyz+tag@gmail.com',
            })).toBe(true)
        })
        it('Matches multiple TO: entries', () => {
            expect(test_cond(`(or
             (receiver abc@gmail.com)
             (receiver abc@corp.com))`,
            {
                getFrom: () => 'DDD EEE <def@corp.com>',
                getTo: () => 'AAA BBB <abc@corp.com>, DDD EEE <def@corp.com>',
            })).toBe(true)
        })
        it('Does not match when using negation', () => {
            expect(test_cond(`(not (receiver abc@gmail.com))`,
            {
                getTo: () => 'AAA BBB <abc@gmail.com>',
            })).toBe(false)
        })
        it('Matches when using negation', () => {
            expect(test_cond(`(not (receiver abc@gmail.com))`,
            {
                getTo: () => 'AAA BBB <def@gmail.com>',
            })).toBe(true)
        })
        it('Matches receiver to TO: address with label', () => {
            expect(test_cond(`(receiver abc+Def@bar.com)`,
            {
                getTo: () => 'abc+Def@bar.com',
            })).toBe(true)
        })
        it('Matches receiver exactly (using quotes) to TO: address with label', () => {
            expect(test_cond(`(receiver "abc+Def@bar.com")`,
            {
                getTo: () => 'abc+Def@bar.com',
            })).toBe(true)
        })
    }
}
