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
import ThreadAction, {BooleanActionType, InboxActionType} from './ThreadAction';
import {SessionData} from './SessionData';

// Represents a message in a thread
const MAX_BODY_PROCESSING_LENGTH = 65535;

export class MessageData {

    private static parseAddresses(str: string): string[] {
        return str.toLowerCase().split(',').map(address => address.trim());
    }

    private static parseListId(raw: string): string {
        // Parsing would be limited to headers only
        const raw_header_str = raw.split('\r\n\r\n')[0];
        // const match = raw_header_str.match(/^\s*list-id:[^<]*<([^>]*)>\s*$/im);
        // if (match == null || !match[1]) {
        //     return '';
        // }
        // const raw_list_id = match[1];
        // const raw_list_id_at_index = raw_list_id.lastIndexOf('.', raw_list_id.lastIndexOf('.') - 1);
        // const listId = raw_list_id.substr(0, raw_list_id_at_index) + '@' + raw_list_id.substr(raw_list_id_at_index + 1, raw_list_id.length);
        // return listId.toLowerCase().replace(/[^a-z0-9@\.\/+]+/g, '-');

        // E.x. Mailing-list: list xyz@gmail.com; contact xyz-admin@gmail.com
        const match = raw_header_str.match(/^\s*mailing-list:(.*)$/im);
        if (match == null || !match[1]) {
            return '';
        }
        const parts = match[1].trim().split(';');
        if (parts.length === 0) {
            return '';
        }
        for (const part of parts) {
            const [type, address] = part.trim().split(/\s+/);
            Utils.assert(typeof address !== 'undefined', `Unexpected mailing list: ${match[1].trim()}`);
            if (type.trim() === 'list') {
                return address;
            }
        }
        return '';
    }

    public readonly from: string;
    public readonly to: string[];
    public readonly cc: string[];
    public readonly bcc: string[];
    public readonly list: string;
    public readonly reply_to: string[]; // TODO: support it in Rule
    public readonly sender: string[];
    public readonly receivers: string[];
    public readonly subject: string;
    public readonly body: string;

    constructor(message: GoogleAppsScript.Gmail.GmailMessage) {
        this.from = message.getFrom();
        this.to = MessageData.parseAddresses(message.getTo());
        this.cc = MessageData.parseAddresses(message.getCc());
        this.bcc = MessageData.parseAddresses(message.getBcc());
        this.list = MessageData.parseListId(message.getRawContent());
        this.reply_to = MessageData.parseAddresses(message.getReplyTo());
        this.sender = ([] as string[]).concat(this.from, this.reply_to);
        this.receivers = ([] as string[]).concat(this.to, this.cc, this.bcc, this.list);
        this.subject = message.getSubject();
        // Potentially could be HTML, Plain, or RAW. But doesn't seem very useful other than Plain.
        let body = message.getPlainBody();
        // Truncate and log long messages.
        if (body.length > MAX_BODY_PROCESSING_LENGTH) {
            Logger.log(`Ignoring the end of long message with subject "${this.subject}"`);
            body = body.substr(0, MAX_BODY_PROCESSING_LENGTH);
        }
        this.body = body;
    }

    toString() {
        return this.subject;
    }
}

// Represents a thread
export class ThreadData {
    private readonly raw: GoogleAppsScript.Gmail.GmailThread;

    public readonly message_data_list: MessageData[];
    public readonly thread_action = new ThreadAction();

    constructor(session_data: SessionData, thread: GoogleAppsScript.Gmail.GmailThread) {
        this.raw = thread;

        const messages = thread.getMessages();
        // Get messages that is not too old, but at least one message
        let newMessages = messages.filter(
            message => message.getDate() > session_data.oldest_to_process);
        if (newMessages.length === 0) {
            newMessages = [messages[messages.length - 1]];
        }
        this.message_data_list = newMessages.map(message => new MessageData(message));

        // Log if any dropped.
        const numDropped = messages.length - newMessages.length;
        if (numDropped > 0) {
            const subject = this.message_data_list[0].subject;
            Logger.log(`Ignoring oldest ${numDropped} messages in thread "${subject}"`);
        }
    }

    validateActions() {
        if (!this.thread_action.hasAnyAction() && this.thread_action.move_to != InboxActionType.NOTHING) {
            const messages = this.raw.getMessages();
            const last_message = messages[messages.length - 1];
            const from = last_message.getFrom();
            const to = last_message.getTo();
            throw `Thread "${this.raw.getFirstMessageSubject()}" from ${from} to ${to} has default action (${this.thread_action}), does it match any rule?`;
        }
    }

    static applyAllActions(session_data: SessionData, all_thread_data: ThreadData[]) {
        const label_action_map: { [key: string]: GoogleAppsScript.Gmail.GmailThread[] } = {};
        const moving_action_map = new Map<InboxActionType, GoogleAppsScript.Gmail.GmailThread[]>([
            [InboxActionType.DEFAULT, []], [InboxActionType.INBOX, []], [InboxActionType.ARCHIVE, []], [InboxActionType.TRASH, []], [InboxActionType.NOTHING, []]
        ]);
        const important_action_map = new Map<BooleanActionType, GoogleAppsScript.Gmail.GmailThread[]>([
            [BooleanActionType.DEFAULT, []], [BooleanActionType.ENABLE, []], [BooleanActionType.DISABLE, []]
        ]);
        const read_action_map = new Map<BooleanActionType, GoogleAppsScript.Gmail.GmailThread[]>([
            [BooleanActionType.DEFAULT, []], [BooleanActionType.ENABLE, []], [BooleanActionType.DISABLE, []]
        ]);
        all_thread_data.forEach(thread_data => {
            const thread = thread_data.raw;
            const action = thread_data.thread_action;
            console.log(`apply action ${action} to thread '${thread.getFirstMessageSubject()}'`);

            // update label action map
            action.label_names.forEach(label_name => {
                if (!(label_name in label_action_map)) {
                    label_action_map[label_name] = [];
                }
                label_action_map[label_name].push(thread);
            });

            // other actions
            moving_action_map.get(action.move_to)!.push(thread);
            important_action_map.get(action.important)!.push(thread);
            read_action_map.get(action.read)!.push(thread);
        });

        Utils.withTimer("BatchApply", () => {
            // batch update labels
            for (const label_name in label_action_map) {
                const threads = label_action_map[label_name];
                session_data.getOrCreateLabel(label_name).addToThreads(threads);
                console.log(`add label ${label_name} to ${threads.length} threads`);
            }
            Logger.log(`Updated labels: ${Object.keys(label_action_map)}.`);

            moving_action_map.forEach((threads, action_type) => {
                switch (action_type) {
                    case InboxActionType.INBOX:
                        GmailApp.moveThreadsToInbox(threads);
                        break;
                    case InboxActionType.ARCHIVE:
                        GmailApp.moveThreadsToArchive(threads);
                        break;
                    case InboxActionType.TRASH:
                        GmailApp.moveThreadsToTrash(threads);
                        break;
                }
            });
            important_action_map.forEach((threads, action_type) => {
                switch (action_type) {
                    case BooleanActionType.ENABLE:
                        GmailApp.markThreadsImportant(threads);
                        break;
                    case BooleanActionType.DISABLE:
                        GmailApp.markThreadsUnimportant(threads);
                        break;
                }
            });
            read_action_map.forEach((threads, action_type) => {
                switch (action_type) {
                    case BooleanActionType.ENABLE:
                        GmailApp.markThreadsRead(threads);
                        break;
                    case BooleanActionType.DISABLE:
                        GmailApp.markThreadsUnread(threads);
                        break;
                }
            });
            Logger.log(`Updated threads status.`);

            const all_threads = all_thread_data.map(data => data.raw);
            if (session_data.config.processed_label.length > 0){
                session_data.getOrCreateLabel(session_data.config.processed_label).addToThreads(all_threads);
            }
            session_data.getOrCreateLabel(session_data.config.unprocessed_label).removeFromThreads(all_threads);
            Logger.log(`Mark as processed.`);
        });
    }
}
