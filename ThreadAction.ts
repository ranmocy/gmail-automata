enum BooleanActionType {DEFAULT, ENABLE, DISABLE}

enum InboxActionType {DEFAULT, INBOX, ARCHIVE, TRASH}

class ThreadAction {

    private static ACTION_CONFIG_TYPE_FIELD_NAMES: (keyof Pick<ThreadAction, "important" | "read" | "auto_label">)[] = ["important", "read", "auto_label"];

    public readonly label_names: Set<string> = new Set<string>();
    public move_to: InboxActionType = InboxActionType.DEFAULT;
    public important: BooleanActionType = BooleanActionType.DEFAULT;
    public read: BooleanActionType = BooleanActionType.DEFAULT;
    public auto_label: BooleanActionType = BooleanActionType.DEFAULT;

    hasAnyAction() {
        return this.label_names.size > 0
            || this.move_to != InboxActionType.DEFAULT
            || this.important != BooleanActionType.DEFAULT
            || this.read != BooleanActionType.DEFAULT;
    }

    addLabels(new_label_names: string[]) {
        for (const label of new_label_names) {
            this.label_names.add(label);
        }
    }

    mergeFrom(other: Readonly<ThreadAction>): this {
        this.addLabels(Array.from(other.label_names.values()));
        this.move_to = other.move_to;
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
