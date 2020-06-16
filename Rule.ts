class Rule {

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
        assert(result !== undefined, `Can't parse inbox action value ${str}.`);
        return result;
    }

    private static parseActionAfterMatchType(str: string): ActionAfterMatchType {
        if (str.length === 0) {
            return ActionAfterMatchType.DEFAULT;
        }
        const result = ActionAfterMatchType[str.toUpperCase() as keyof typeof ActionAfterMatchType];
        assert(result !== undefined, `Can't parse action_after_match value ${str}.`);
        return result;
    }

    public static getRules(): Rule[] {
        const values: string[][] = withTimer("GetRuleValues", () => {
            const sheet = SpreadsheetApp.getActiveSpreadsheet().getSheetByName('rules');
            const column_num = sheet.getLastColumn();
            const row_num = sheet.getLastRow();
            return sheet.getRange(1, 1, row_num, column_num)
                .getDisplayValues()
                .map(row => row.map(cell => cell.trim()));
        });
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
            thread_action.addLabels(Rule.parseStringList(values[row][header_map["add_labels"]], ","));
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

        console.log(`Parsed rules:\n${rules.map(rule => rule.toString()).join("\n---\n")}`);

        return rules;
    }
}
