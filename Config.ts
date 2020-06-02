interface MutableConfig {
    unprocessed_label: string;
    processed_label: string;
    processing_failed_label: string;
    processing_frequency_in_minutes: number;
    hour_of_day_to_run_sanity_checking: number;
    go_link: string;
    max_threads: number;
    auto_labeling_parent_label: string;
}

class Config implements Readonly<MutableConfig> {
    public readonly unprocessed_label: string;
    public readonly processed_label: string;
    public readonly processing_failed_label: string;
    public readonly processing_frequency_in_minutes: number;
    public readonly hour_of_day_to_run_sanity_checking: number;
    public readonly go_link: string;
    public readonly max_threads: number;
    public readonly auto_labeling_parent_label: string;

    private static validate(config: Config) {
        assert(config.unprocessed_label.length > 0, "unprocessed_label can't be empty");
        assert(config.processed_label.length > 0, "processed_label can't be empty");
        assert(config.processing_frequency_in_minutes >= 5, "processing_frequency_in_minutes can't be smaller than 5");
        assert(config.max_threads <= 100, "max_threads can't be greater than 100");
    }

    public static getConfig(): Config {
        let config: MutableConfig = {
            unprocessed_label: "unprocessed",
            processed_label: "processed",
            processing_failed_label: "error",
            processing_frequency_in_minutes: 5,
            hour_of_day_to_run_sanity_checking: 0,
            go_link: "",
            max_threads: 50,
            auto_labeling_parent_label: "",
        };

        const values = withTimer("GetConfigValues", () => {
            const sheet = SpreadsheetApp.getActiveSpreadsheet().getSheetByName('configs');
            const num_rows = sheet.getLastRow();
            return sheet.getRange(1, 1, num_rows, 2).getDisplayValues().map(row => row.map(cell => cell.trim()));
        });
        const num_rows = values.length;

        for (let row = 0; row < num_rows; row++) {
            const [name, value] = values[row];
            if (name.length === 0) {
                continue;
            }

            switch (name) {
                case "processing_frequency_in_minutes":
                case "hour_of_day_to_run_sanity_checking":
                case "max_threads": {
                    const result = parseInt(value);
                    if (isNaN(result)) {
                        throw `Unrecognized config value of ${name}`;
                    }
                    config[name] = result;
                    break;
                }
                case "unprocessed_label":
                case "processed_label":
                case "processing_failed_label":
                case "go_link":
                case "auto_labeling_parent_label": {
                    config[name] = value;
                    break;
                }
                default: {
                    throw `Invalid config: ${name}`;
                }
            }
        }

        Config.validate(config);
        return config;
    }
}
