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

export enum BooleanActionType {DEFAULT, ENABLE, DISABLE}

export enum InboxActionType {DEFAULT, INBOX, ARCHIVE, TRASH}

export enum ActionAfterMatchType {DEFAULT, DONE, FINISH_STAGE, NEXT_STAGE}

export default class ThreadAction {

    private static ACTION_CONFIG_TYPE_FIELD_NAMES: (keyof Pick<ThreadAction, "important" | "read" | "auto_label">)[] = ["important", "read", "auto_label"];

    public readonly label_names: Set<string> = new Set<string>();
    public move_to: InboxActionType = InboxActionType.DEFAULT;
    public important: BooleanActionType = BooleanActionType.DEFAULT;
    public read: BooleanActionType = BooleanActionType.DEFAULT;
    public auto_label: BooleanActionType = BooleanActionType.DEFAULT;
    public action_after_match: ActionAfterMatchType = ActionAfterMatchType.DEFAULT;

    hasAnyAction() {
        return this.label_names.size > 0
            || this.move_to != InboxActionType.DEFAULT
            || this.important != BooleanActionType.DEFAULT
            || this.read != BooleanActionType.DEFAULT;
    }

    addLabels(new_label_names: string[], add_parent_labels: boolean) {
        for (const label of new_label_names) {
            if (add_parent_labels) {
                let remaining = label;
                while (remaining) {
                    this.label_names.add(remaining);
                    const index = remaining.lastIndexOf('/');
                    remaining = remaining.substring(0, index);
                }
            } else {
                this.label_names.add(label);
            }
        }
    }

    mergeFrom(other: Readonly<ThreadAction>, add_parent_labels: boolean): this {
        this.addLabels(Array.from(other.label_names.values()), add_parent_labels);
        if (other.move_to != InboxActionType.DEFAULT) {
            this.move_to = other.move_to;
        }
        for (const name of ThreadAction.ACTION_CONFIG_TYPE_FIELD_NAMES) {
            if (other[name] != BooleanActionType.DEFAULT) {
                this[name] = other[name];
            }
        }
        return this;
    }

    toString() {
        let result = `>${InboxActionType[this.move_to]} +L${Array.from(this.label_names.values())}`;
        for (const name of ThreadAction.ACTION_CONFIG_TYPE_FIELD_NAMES) {
            switch (this[name]) {
                case BooleanActionType.ENABLE:
                    result += ` +${name[0].toUpperCase()}`;
                    break;
                case BooleanActionType.DISABLE:
                    result += ` -A${name[0].toUpperCase()}`;
                    break;
            }
        }
        return result;
    }

    static testThreadActions(it: Function, expect: Function) {
        it('Adds parent labels', () => {
            const labels = ['list/abc', 'bot/team1/test', 'bot/team1/alert', 'def'];
            const action = new ThreadAction();
            const expected = new Set(['list', 'list/abc', 'bot', 'bot/team1', 'bot/team1/test', 'bot/team1/alert', 'def']);
          
            action.addLabels(labels, true);
          
            expect(action.label_names).toEqual(expected);
        });

        it('Does not add parent labels if disabled', () => {
            const labels = ['list/abc', 'bot/team1/test', 'bot/team1/alert', 'def'];
            const action = new ThreadAction();
            const expected = new Set(['list/abc', 'bot/team1/test', 'bot/team1/alert', 'def']);
          
            action.addLabels(labels, false);
          
            expect(action.label_names).toEqual(expected);
        });

        it('Does not add parent labels for empty list', () => {
            const labels: string[] = [];
            const action = new ThreadAction();
            
            action.addLabels(labels, true);
            
            expect(action.label_names.size).toBe(0);
        });

        it('Uses Default action for rules', () => {
            const thread_data_action = new ThreadAction();

            expect(thread_data_action.move_to).toBe(InboxActionType.DEFAULT);
        });

        it('Default Actions for message', () => {
            const message_action = new ThreadAction();
            
            expect(message_action.move_to).toBe(InboxActionType.DEFAULT);
            expect(message_action.important).toBe(BooleanActionType.DEFAULT);
            expect(message_action.read).toBe(BooleanActionType.DEFAULT);
        });

        it('Merges the final Actions from a single rule', () => {
            const message_action = new ThreadAction();
            const rule1_action = new ThreadAction;
            rule1_action.move_to = InboxActionType.ARCHIVE;
            rule1_action.important = BooleanActionType.ENABLE;
            rule1_action.read = BooleanActionType.ENABLE;
            
            message_action.mergeFrom(rule1_action, true);
            
            expect(message_action.move_to).toBe(InboxActionType.ARCHIVE);
            expect(message_action.important).toBe(BooleanActionType.ENABLE);
            expect(message_action.read).toBe(BooleanActionType.ENABLE);
        });

        it('Merges the final Actions from multiple rules', () => {
            const message_action = new ThreadAction();
            const rule1_action = new ThreadAction;
            const rule2_action = new ThreadAction;
            rule1_action.move_to = InboxActionType.ARCHIVE;
            rule1_action.important = BooleanActionType.ENABLE;
            rule1_action.read = BooleanActionType.ENABLE;
            rule2_action.move_to = InboxActionType.TRASH;
            rule2_action.important = BooleanActionType.DISABLE;
            rule2_action.read = BooleanActionType.DISABLE;

            message_action.mergeFrom(rule1_action, true);
            message_action.mergeFrom(rule2_action, true);

            expect(message_action.move_to).toBe(InboxActionType.TRASH);
            expect(message_action.important).toBe(BooleanActionType.DISABLE);
            expect(message_action.read).toBe(BooleanActionType.DISABLE);
        });
    }
}
