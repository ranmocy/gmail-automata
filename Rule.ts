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

import Utils from './utils';
import Condition from "./Condition";
import {Config} from './Config'
import Mocks from "./Mocks";
import ThreadAction, {ActionAfterMatchType, BooleanActionType, InboxActionType} from './ThreadAction';

export class Rule {

    public readonly condition: Condition;
    public readonly thread_action: Readonly<ThreadAction>;
    public readonly stage: number;

    constructor(condition_str: string, thread_action: ThreadAction, stage: number) {
        this.condition = new Condition(condition_str);
        this.thread_action = thread_action;
        this.stage = stage;
    }

    toString() {
        return this.condition.toString();
    }

    private static parseBooleanValue(str: string): boolean {
        if (str.length === 0) {
            return false;
        }
        return ["-1", "0", "no", "n", "false", "f"].indexOf(str.trim().toLowerCase()) < 0;

    }

    private static parseNumberValue(str: string): number {
        const result = parseInt(str.trim());
        if (isNaN(result)) {
            return Number.MAX_VALUE;
        }
        return result;
    }

    private static parseStringList(str: string, delimiter: string): string[] {
        if (str.length === 0) {
            return [];
        }
        return str.split(delimiter).map(s => s.trim());
    }

    private static parseBooleanActionType(str: string): BooleanActionType {
        if (str.length === 0) {
            return BooleanActionType.DEFAULT;
        }
        if (Rule.parseBooleanValue(str)) {
            return BooleanActionType.ENABLE;
        }
        return BooleanActionType.DISABLE;
    }

    private static parseInboxActionType(str: string): InboxActionType {
        if (str.length === 0) {
            return InboxActionType.DEFAULT;
        }
        const result = InboxActionType[str.toUpperCase() as keyof typeof InboxActionType];
        Utils.assert(result !== undefined, `Can't parse inbox action value ${str}.`);
        return result;
    }

    private static parseActionAfterMatchType(str: string): ActionAfterMatchType {
        if (str.length === 0) {
            return ActionAfterMatchType.DEFAULT;
        }
        const result = ActionAfterMatchType[str.toUpperCase() as keyof typeof ActionAfterMatchType];
        Utils.assert(result !== undefined, `Can't parse action_after_match value ${str}.`);
        return result;
    }

    public static parseRules(values: string[][], config: Config): Rule[] {
        const row_num = values.length;
        const column_num = values[0].length;

        // get header map from first row
        const header_map: { [key: string]: number } = {
            conditions: -1,
            add_labels: -1,
            move_to: -1,
            mark_important: -1,
            mark_read: -1,
            stage: -1,
            auto_label: -1,
            disabled: -1,
            action_after_match: -1,
        };
        for (let column = 0; column < column_num; column++) {
            const name = values[0][column];
            if (!(name in header_map)) {
                throw `Invalid rule header:"${name}"`;
            }
            header_map[name] = column;
        }

        // Ensure all expected headers exist
        for (const header_name in header_map) {
            if (header_map[header_name] < 0) {
                throw `Missing rule header: ${header_name}`;
            }
        }

        // get rest rows
        let rules = [];
        for (let row = 1; row < row_num; row++) {
            const condition_str = values[row][header_map["conditions"]];
            if (condition_str.length === 0) {
                continue;
            }
            const disabled = Rule.parseBooleanValue(values[row][header_map["disabled"]]);
            if (disabled) {
                continue;
            }

            const thread_action = new ThreadAction();
            thread_action.addLabels(
                Rule.parseStringList(values[row][header_map["add_labels"]], ","),
                config.parent_labeling);
            thread_action.move_to = Rule.parseInboxActionType(values[row][header_map["move_to"]]);
            thread_action.important = Rule.parseBooleanActionType(values[row][header_map["mark_important"]]);
            thread_action.read = Rule.parseBooleanActionType(values[row][header_map["mark_read"]]);
            thread_action.auto_label = Rule.parseBooleanActionType(values[row][header_map["auto_label"]]);
            const actionAfterMatchStr = values[row][header_map["action_after_match"]] || '';
            thread_action.action_after_match = Rule.parseActionAfterMatchType(actionAfterMatchStr);

            const stage = Rule.parseNumberValue(values[row][header_map["stage"]]);
            rules.push(new Rule(condition_str, thread_action, stage));
        }

        // sort by stage
        rules.sort((a: Rule, b: Rule) => a.stage - b.stage);

        return rules;
    }

    public static getRules(config: Config): Rule[] {
        const values: string[][] = Utils.withTimer("GetRuleValues", () => {
            const sheet = SpreadsheetApp.getActiveSpreadsheet().getSheetByName('rules');
            if (sheet === null) {
                throw "Active sheet 'rules' not found";
            }
            const column_num = sheet.getLastColumn();
            const row_num = sheet.getLastRow();
            return sheet.getRange(1, 1, row_num, column_num)
                .getDisplayValues()
                .map(row => row.map(cell => cell.trim()));
        });
        const rules = Rule.parseRules(values, config);
        console.log(`Parsed rules:\n${rules.map(rule => rule.toString()).join("\n---\n")}`);
        return rules;
    }

    public static testRules(it: Function, expect: Function) {
        if (typeof SpreadsheetApp !== 'undefined') {
            // This can only be tested in the Sheet

            it('Reads in default rules from Sheet', () => {
                const config = Config.getConfig();
                const rules = Rule.getRules(config);
                expect(rules.length).toBeGreaterThan(0);
            });
        }

        it('Reads in Header', () => {
            const sheet = Mocks.getMockTestSheet([]);
            const config = Mocks.getMockConfig();
            const rules = Rule.parseRules(sheet, config);

            expect(rules.length).toBe(0);
        })

        it('Fails with header missing item', () => {
            const config = Mocks.getMockConfig();
            const sheet = Mocks.getMockTestSheet([]);
            sheet[0] = sheet[0].slice(0, -2);

            expect(() => {Rule.parseRules(sheet, config)}).toThrow();
        })

        it('Loads Empty Rules', () => {
            const config = Mocks.getMockConfig();
            const sheet = Mocks.getMockTestSheet([{}, {}]);

            const rules = Rule.parseRules(sheet, config);

            expect(rules.length).toBe(0);
        })

        it('Loads Simple Rule', () => {
            const config = Mocks.getMockConfig();
            const sheet = Mocks.getMockTestSheet([
                {
                    conditions: '(body /to: me/i)',
                    add_labels: 'abc, xyz',
                    stage: "5",
                }]);

            const rules = Rule.parseRules(sheet, config);

            expect(rules.length).toBe(1);
            expect(rules[0].stage).toBe(5);
            expect(rules[0].thread_action.label_names.size).toBe(2);
        })

        it('Parent Labels Created', () => {
            const config = Mocks.getMockConfig({parent_labeling: true});
            const sheet = Mocks.getMockTestSheet([
                {
                    conditions: '(body /to: me/i)',
                    add_labels: 'abc/def, xyz/123',
                    stage: "5",
                }]);

            const rules = Rule.parseRules(sheet, config);
     
            const expected_labels = new Set(['abc', 'abc/def', 'xyz', 'xyz/123'])
            expect(rules.length).toBe(1);
            expect(rules[0].stage).toBe(5);
            expect(rules[0].thread_action.label_names).toEqual(expected_labels);
        })

        it('Parent Labels Not Created when configuration disabled', () => {
            const config = Mocks.getMockConfig({parent_labeling: false});
            const sheet = Mocks.getMockTestSheet([
                {
                    conditions: '(body /to: me/i)',
                    add_labels: 'abc/def, xyz/123',
                    stage: "5",
                }]);

            const rules = Rule.parseRules(sheet, config);
     
            const expected_labels = new Set(['abc/def', 'xyz/123'])
          
            expect(rules.length).toBe(1);
            expect(rules[0].stage).toBe(5);
            expect(rules[0].thread_action.label_names).toEqual(expected_labels);
        })

        it('Loaded Rules are sorted by stage', () => {
            const config = Mocks.getMockConfig();
            const sheet = Mocks.getMockTestSheet([
                {
                    conditions: '(body /to: me/i)',
                    add_labels: 'abc, xyz',
                    stage: "5",
                },
                {
                    conditions: '(body /to: me/i)',
                    add_labels: 'abc, xyz',
                    stage: "15",
                },
                {
                    conditions: '(body /to: me/i)',
                    add_labels: 'abc, xyz',
                    stage: "1",
                }
            ]);

            const rules = Rule.parseRules(sheet, config);

            expect(rules.length).toBe(3);
            expect(rules[0].stage).toBe(1);
            expect(rules[1].stage).toBe(5);
            expect(rules[2].stage).toBe(15);
        })

    }
}
