import {SessionData} from "./SessionData";
import {Config} from "./Config";


export default class Mocks {

    private static base_config: Config = {
        auto_labeling_parent_label: "",
        go_link: "",
        hour_of_day_to_run_sanity_checking: 0,
        max_threads: 50,
        processed_label: "myProcessed",
        processing_failed_label: "zFailed",
        processing_frequency_in_minutes: 5,
        unprocessed_label: "myUnprocessed",
    };

    public static getMockConfig = (overrides: Partial<Config> = {}) => (
        Object.assign({}, Mocks.base_config, overrides)
    );
    
    private static base_session_data: SessionData = {
        user_email: "abc@gmail.com",
        config: Mocks.getMockConfig(),
        labels: {},
        rules: [],
        processing_start_time: new Date(12345),
        oldest_to_process: new Date(23456),
        getOrCreateLabel: () => ({} as GoogleAppsScript.Gmail.GmailLabel),
    };

    public static getMockSessionData = (overrides: Partial<SessionData> = {}) => (
        Object.assign({}, Mocks.base_session_data, overrides)
    );

    private static base_label = {
        getName: () => '',
    } as GoogleAppsScript.Gmail.GmailLabel;

    private static base_thread = {
        getLabels: () => [Mocks.base_label],
        isImportant: () => false,
        isInInbox: () => false,
        isInPriorityInbox: () => false,
        isInSpam: () => false,
        isInTrash: () => false,
        hasStarredMessages: () => false,
        isUnread: () => false,
        getFirstMessageSubject: () => '',
        getMessages: () => [],
    } as unknown as GoogleAppsScript.Gmail.GmailThread;

    private static base_message = {
        getFrom: () => '',
        getTo: () => '',
        getCc: () => '',
        getBcc: () => '',
        getReplyTo: () => '',
        getSubject: () => '',
        getPlainBody: () => '',
        getRawContent: () => '',
        getHeader: (_name: string) => '',
        getDate: () => Date.now() as unknown as GoogleAppsScript.Base.Date,
        getThread: () => Mocks.base_thread
    } as GoogleAppsScript.Gmail.GmailMessage;

    public static getMockMessage = (
        override_message: Partial<GoogleAppsScript.Gmail.GmailMessage> = {},
        override_thread: Partial<GoogleAppsScript.Gmail.GmailThread> = {},
        labels: string[] = []): GoogleAppsScript.Gmail.GmailMessage => {
        const gmail_labels: GoogleAppsScript.Gmail.GmailLabel[] = [];
        labels.forEach(label => {
            gmail_labels.push(Object.assign({}, Mocks.base_label, {getName: () => label}));
        });
        let overridden_thread: GoogleAppsScript.Gmail.GmailThread =
            Object.assign({}, Mocks.base_thread, override_thread);
        overridden_thread = Object.assign({}, overridden_thread, {getLabels: () => gmail_labels});
        let overridden_message = Object.assign({}, Mocks.base_message, override_message);
        overridden_message = Object.assign({}, overridden_message, {getThread: () => overridden_thread});
        return overridden_message;
    };

    public static getMockThreadOfMessages = (
        override_messages: Partial<GoogleAppsScript.Gmail.GmailMessage>[] = [{}],
        override_thread: Partial<GoogleAppsScript.Gmail.GmailThread> = {},
        labels: string[] = []): GoogleAppsScript.Gmail.GmailThread => {
        const gmail_labels: GoogleAppsScript.Gmail.GmailLabel[] = [];
        labels.forEach(label => {
            gmail_labels.push(Object.assign({}, Mocks.base_label, {getName: () => label}));
        });
        const messages: GoogleAppsScript.Gmail.GmailMessage[] = [];
        let overridden_thread: GoogleAppsScript.Gmail.GmailThread =
            Object.assign({}, Mocks.base_thread, override_thread);
        overridden_thread = Object.assign(
            {}, overridden_thread, {
                getMessages: () => messages,
                getLabels: () => gmail_labels,
            });

        override_messages.forEach(message => {
            let overridden_message = Object.assign({}, Mocks.base_message, message);
            overridden_message = Object.assign({}, overridden_message, {getThread: () => overridden_thread});                
            messages.push(overridden_message);
        });
        return overridden_thread;
    };

    public static getMockTestSheetHeaders(): string[] {
        return [
            "conditions", "add_labels", "move_to", "mark_important",
            "mark_read", "stage", "auto_label", "disabled", "action_after_match"];
    }

    public static getMockTestSheet = (
        rows: { [key: string]: string}[],
        headers: string[] = Mocks.getMockTestSheetHeaders()): string[][] => {
        const sheet: string[][] = [headers];
        rows.forEach(row_details => {
            const row: string[] = [];
            for (const header in headers) {
                const header_name = headers[header];
                if (header_name in row_details) {
                    row.push(row_details[header_name]);
                } else {
                    row.push("");
                }
            }
            sheet.push(row);
        });
        return sheet;
    }
}