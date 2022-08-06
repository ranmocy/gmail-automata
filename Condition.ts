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
import {SessionData} from './SessionData';
import Mocks from './Mocks';
import Utils from './utils';

const RE_FLAG_PATTERN = /^\/(.*)\/([gimuys]*)$/;

enum ConditionType {
    AND, OR, NOT, SUBJECT, FROM, TO, CC, BCC, LIST, SENDER, RECEIVER, BODY, HEADER, THREAD
}

enum ThreadSubType {
    FIRST_MESSAGE_SUBJECT, LABEL, IS_STARRED, IS_IMPORTANT, IS_IN_INBOX, IS_IN_PRIORITY_INBOX,
    IS_IN_SPAM, IS_IN_TRASH, IS_UNREAD
}

/**
 * S expression represents condition in rule.
 *
 * Syntax:
 * CONDITION_EXP := (OPERATOR CONDITION_LIST) | (MATCHER STRING) |
 *                  (MATCHER_SUBTYPE SUBTYPE_STRING STRING) | (MATCHER_SUBTYPE SUBTYPE_BOOL)
 * OPERATOR := and | or | not
 * MATCHER := subject | from | to | cc | bcc | list | sender | receiver | body
 * MATCHER_SUBTYPE := header | thread
 * SUBTYPE_STRING := first_message_subject | label | STRING
 * SUBTYPE_BOOL := is_starred | is_important | is_in_inbox | is_in_priority_inbox |
 *                 is_in_spam | is_in_trash | is_unread
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

    public static parseRegExp(pattern: string, condition_str: string, matching_address: boolean): RegExp {
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
    private readonly header: string;
    private readonly threadSubtype: ThreadSubType;
    private readonly regexp: RegExp;
    private readonly sub_conditions: Condition[];

    constructor(condition_str: string) {
        condition_str = condition_str.trim();
        Utils.assert(condition_str.startsWith('(') && condition_str.endsWith(')'),
            `Condition ${condition_str} should be surrounded by ().`);
        const first_space = condition_str.indexOf(" ");
        const type_str = condition_str.substring(1, first_space).trim().toUpperCase();
        let rest_str = condition_str.substring(first_space + 1, condition_str.length - 1).trim();
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
            case ConditionType.HEADER:
            case ConditionType.THREAD: {
                const subtype_first_space = rest_str.indexOf(" ");
                const subtype = subtype_first_space > 0
                              ? rest_str.substring(0, subtype_first_space).trim()
                              : rest_str;
                let matching_address = true;
                if (this.type === ConditionType.HEADER) {
                    this.header = subtype;
                }
                if (this.type === ConditionType.THREAD) {
                    this.threadSubtype = ThreadSubType[subtype.toUpperCase() as keyof typeof ThreadSubType];
                    if (this.threadSubtype === ThreadSubType.FIRST_MESSAGE_SUBJECT) {
                        matching_address = false;
                    }
                    if (this.threadSubtype === undefined) {
                        throw `Invalid 'thread' subtype: "${condition_str}"`;
                    }
                }
                rest_str = rest_str.substring(subtype_first_space + 1, rest_str.length).trim();
                this.regexp = Condition.parseRegExp(rest_str, condition_str, matching_address);
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
            case ConditionType.HEADER: {
                const headerData = message_data.headers.get(this.header);
                if (headerData !== undefined) {
                    return this.regexp.test(headerData);
                }
                return false;
            }
            case ConditionType.THREAD: {
                switch (this.threadSubtype) {
                    case ThreadSubType.IS_IMPORTANT: {
                        return message_data.thread_is_important;
                    }
                    case ThreadSubType.IS_IN_INBOX: {
                        return message_data.thread_is_in_inbox;
                    }
                    case ThreadSubType.IS_IN_PRIORITY_INBOX: {
                        return message_data.thread_is_in_priority_inbox;
                    }
                    case ThreadSubType.IS_IN_SPAM: {
                        return message_data.thread_is_in_spam;
                    }
                    case ThreadSubType.IS_IN_TRASH: {
                        return message_data.thread_is_in_trash;
                    }
                    case ThreadSubType.IS_STARRED: {
                        return message_data.thread_is_starred;
                    }
                    case ThreadSubType.IS_UNREAD: {
                        return message_data.thread_is_unread;
                    }
                    case ThreadSubType.FIRST_MESSAGE_SUBJECT:  {
                        return this.regexp.test(message_data.thread_first_message_subject);
                    }
                    case ThreadSubType.LABEL: {
                        return this.matchAddress(...message_data.thread_labels);
                    }
                }
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

    getConditionHeaders(): string[] {
        const headers = [];
        if (this.type === ConditionType.HEADER) {
            headers.push(this.header);
        }
        this.sub_conditions?.forEach((sub_condition) => {
            headers.push(...sub_condition.getConditionHeaders());
        });
        return headers;
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

        function test_cond(
            condition_str: string,
            message: Partial<GoogleAppsScript.Gmail.GmailMessage>,
            thread: Partial<GoogleAppsScript.Gmail.GmailThread> = {},
            session_data: Partial<SessionData> = {},
            thread_labels: string[] = []): boolean {
            const condition = new Condition(condition_str);
            const mock_message = Mocks.getMockMessage(message, thread, thread_labels);
            const mock_session_data = Mocks.getMockSessionData(session_data);
            const message_data = new MessageData(
                mock_session_data,
                mock_message);
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
        it('Matches body using case-sensitivity', () => {
            expect(test_cond(`(body with aSdF)`,
            {
                getPlainBody: () => 'Text with aSdF in it',
            })).toBe(true)
        })
        it('Does not match body using case-sensitivity', () => {
            expect(test_cond(`(body asdf)`,
            {
                getPlainBody: () => 'Text with aSdF in it',
            })).toBe(false)
        })

        function test_cond_labels(
            condition_str: string,
            thread_labels: string[]): boolean {
            return test_cond(condition_str, {}, {}, {}, thread_labels);
        }

        it('Matches email that is in label, case-insensitive', () => {
            expect(test_cond_labels(`(thread label xyz)`,
            ['ABC', 'XYZ', 'ABC/XYZ'])).toBe(true)
        })
        it('Does not match email that is in label with partial name', () => {
            expect(test_cond_labels(`(thread label XY)`,
            ['ABC', 'XYZ', 'ABC/XYZ'])).toBe(false)
        })
        it('Does not match email that is in label without full name', () => {
            expect(test_cond_labels(`(thread label XYZ)`,
            ['ABC/XYZ'])).toBe(false)
        })
        it('Matches email that is in label with full name', () => {
            expect(test_cond_labels(`(thread label ABC/XYZ)`,
            ['ABC/XYZ'])).toBe(true)
        })

        function test_cond_thread(
            condition_str: string,
            thread: Partial<GoogleAppsScript.Gmail.GmailThread>): boolean {
            return test_cond(condition_str, {}, thread);
        }

        it('Throws exception if thread subtype is invalid', () => {
            expect(() => {test_cond_thread(`(thread is_made_up)`, {})}).toThrow()
        })
        it('Matches thread is_important if is', () => {
            expect(test_cond_thread(`(thread is_important)`,
            {
                isImportant: () => true,
            })).toBe(true)
        })
        it('Does not match thread is_important if it is not', () => {
            expect(test_cond_thread(`(thread is_important)`,
            {
                isImportant: () => false,
            })).toBe(false)
        })
        it('Matches thread is_in_inbox if is', () => {
            expect(test_cond_thread(`(thread is_in_inbox)`,
            {
                isInInbox: () => true,
            })).toBe(true)
        })
        it('Does not match thread is_in_inbox if it is not', () => {
            expect(test_cond_thread(`(thread is_in_inbox)`,
            {
                isInInbox: () => false,
            })).toBe(false)
        })
        it('Matches thread is_in_priority_inbox if is', () => {
            expect(test_cond_thread(`(thread is_in_priority_inbox)`,
            {
                isInPriorityInbox: () => true,
            })).toBe(true)
        })
        it('Does not match thread is_in_priority_inbox if it is not', () => {
            expect(test_cond_thread(`(thread is_in_priority_inbox)`,
            {
                isInPriorityInbox: () => false,
            })).toBe(false)
        })
        it('Matches thread is_in_spam if is', () => {
            expect(test_cond_thread(`(thread is_in_spam)`,
            {
                isInSpam: () => true,
            })).toBe(true)
        })
        it('Does not match thread is_in_spam if it is not', () => {
            expect(test_cond_thread(`(thread is_in_spam)`,
            {
                isInSpam: () => false,
            })).toBe(false)
        })
        it('Matches thread is_in_trash if it is', () => {
            expect(test_cond_thread(`(thread is_in_trash)`,
            {
                isInTrash: () => true,
            })).toBe(true)
        })
        it('Does not match thread is_in_trash if it is not', () => {
            expect(test_cond_thread(`(thread is_in_trash)`,
            {
                isInTrash: () => false,
            })).toBe(false)
        })
        it('Matches thread is_starred if it is', () => {
            expect(test_cond_thread(`(thread is_starred)`,
            {
                hasStarredMessages: () => true,
            })).toBe(true)
        })
        it('Does not match thread is_starred if it is not', () => {
            expect(test_cond_thread(`(thread is_starred)`,
            {
                hasStarredMessages: () => false,
            })).toBe(false)
        })
        it('Matches thread is_unread if it is', () => {
            expect(test_cond_thread(`(thread is_unread)`,
            {
                isUnread: () => true,
            })).toBe(true)
        })
        it('Does not match thread is_unread if it is not', () => {
            expect(test_cond_thread(`(thread is_unread)`,
            {
                isUnread: () => false,
            })).toBe(false)
        })
        it('Matches thread first_message_subject with case-sensitivity', () => {
            expect(test_cond_thread(`(thread first_message_subject this is IN subject)`,
            {
                getFirstMessageSubject: () => 'subject this is IN subjects',
            })).toBe(true)
        })
        it('Does not match thread first_message_subject with case-sensitivity', () => {
            expect(test_cond_thread(`(thread first_message_subject this is IN subject)`,
            {
                getFirstMessageSubject: () => 'subject this is in subjects',
            })).toBe(false)
        })
        it('Matches thread first_message_subject with regex', () => {
            expect(test_cond_thread(`(thread first_message_subject /teST Regex/i)`,
            {
                getFirstMessageSubject: () => 'RE: test regex subjectline',
            })).toBe(true)
        })

        function test_cond_headers(
            condition_str: string,
            message: Partial<GoogleAppsScript.Gmail.GmailMessage>,
            session_data: Partial<SessionData>): boolean {
            return test_cond(condition_str, message, {}, session_data);
        }

        it('Matches custom header with value', () => {
            expect(test_cond_headers(`(header Sender abc@def.com)`,
            {
                getHeader: (name: string) => {
                    if (name === 'Sender') {
                        return 'abc@def.com';
                    }
                    return '';
                },
            },
            {
                requested_headers: ['Sender', 'List-Post'],
            })).toBe(true)
        })
        it('Matches nested custom header with value', () => {
            expect(test_cond_headers(`(and
                (from abc@gmail.com)
                (and
                  (header X-List mylist.gmail.com)
                  (header Precedence /list/i)))`,
            {
                getFrom: () => 'DDD EEE <abc@gmail.com>',
                getHeader: (name: string) => {
                    if (name === 'X-List') {
                        return 'mylist.gmail.com';
                    }
                    if (name === 'Precedence') {
                        return 'bills list';
                    }
                    return '';
                },
            },
            {
                requested_headers: ['X-List', 'Precedence'],
            })).toBe(true)
        })
        it('Does not match custom header with incorrect data', () => {
            expect(test_cond_headers(`(header MyHeader abc)`,
            {
                getHeader: (name: string) => {
                    if (name === 'MyHeader') {
                        return 'xyz';
                    }
                    return '';
                },
            },
            {
                requested_headers: ['MyHeader'],
            })).toBe(false)
        })
    }
}
