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

    addLabels(new_label_names: string[]) {
        for (const label of new_label_names) {
            let remaining = label;
            while (remaining) {
                this.label_names.add(remaining);
                const index = remaining.lastIndexOf('/');
                remaining = remaining.substring(0, index);
            }
        }
    }

    mergeFrom(other: Readonly<ThreadAction>): this {
        this.addLabels(Array.from(other.label_names.values()));
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
}
