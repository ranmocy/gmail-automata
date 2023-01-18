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
import {ActionAfterMatchType, BooleanActionType, InboxActionType} from './ThreadAction';
import {SessionData} from './SessionData';
import {ThreadData} from './ThreadData';
import {Stats} from './Stats';
import Utils from './utils';
import Mocks from './Mocks';
import {Rule} from './Rule';

export class Processor {

    private static processThread(session_data: SessionData, thread_data: ThreadData) {
        let thread_matched_a_rule = false;
        for (const message_data of thread_data.message_data_list) {
            // Apply each rule until matching a rule with a DONE action or matching a rule with
            // FINISH_STAGE and then exhausting all other rules in that stage.
            let min_stage = 0;
            let max_stage = Number.MAX_VALUE;
            for (const rule of session_data.rules) {
                if (rule.stage < min_stage) {
                    continue;
                }
                if (rule.stage > max_stage) {
                    break;
                }
                if (rule.condition.match(message_data)) {
                    thread_matched_a_rule = true;
                    console.log(`rule ${rule} matches message ${message_data}, apply action ${rule.thread_action}`);
                    thread_data.thread_action.mergeFrom(rule.thread_action);
                    let endThread = false;
                    switch (rule.thread_action.action_after_match) {
                        case ActionAfterMatchType.DONE:
                            // Break out of switch and then out of loop.
                            endThread = true;
                            break;
                        case ActionAfterMatchType.FINISH_STAGE:
                        case ActionAfterMatchType.DEFAULT:
                            max_stage = rule.stage;
                            break;
                        case ActionAfterMatchType.NEXT_STAGE:
                            min_stage = rule.stage + 1;
                            max_stage = Number.MAX_VALUE;
                            break;
                    }
                    if (endThread) {
                        break;
                    }
                }
            }
            console.log(`Message is processed at stage ${max_stage}`);

            // TODO: revisiting if auto labeling should be done differently
            // update auto labeling
            // if (thread_data.thread_action.auto_label == BooleanActionType.ENABLE) {
            //   thread_data.thread_action.addLabels([
            //     `${session_data.config.auto_labeling_parent_label}/${message_data.list}`]);
            // }

        }
        if (!thread_matched_a_rule) {
            const last_message = thread_data.getLatestMessage();
            const from = last_message.getFrom();
            const to = last_message.getTo();
            const first_message_subject = thread_data.getFirstMessageSubject();
            throw `Thread "${first_message_subject}" from ${from} to ${to} has no action, does it match any rule?`;
        }
    }

    public static processAllUnprocessedThreads() {
        const start_time = new Date();

        const session_data = new SessionData();
        if (!session_data.rules) {
            return;
        }

        const unprocessed_threads = Utils.withTimer("fetchUnprocessedThreads",
            () => GmailApp.search('label:' + session_data.config.unprocessed_label, 0,
                session_data.config.max_threads));
        Logger.log(`Found ${unprocessed_threads.length} unprocessed threads.`);
        if (!unprocessed_threads) {
            Logger.log(`All emails are processed, skip.`);
            return;
        }

        const all_thread_data = Utils.withTimer("transformIntoThreadData",
            () => unprocessed_threads.map(thread => new ThreadData(session_data, thread)));

        let processed_thread_count = 0, processed_message_count = 0;
        let all_pass = true;
        Utils.withTimer("collectActions", () => {
            for (const thread_data of all_thread_data) {
                try {
                    Processor.processThread(session_data, thread_data);
                    processed_thread_count++;
                    processed_message_count += thread_data.message_data_list.length;
                } catch (e) {
                    all_pass = false;
                    console.error(`Process email failed: ${e}`);
                    Logger.log(`Process email failed: ${e}`);
                    // move to inbox for visibility
                    thread_data.thread_action.move_to = InboxActionType.INBOX;
                    thread_data.thread_action.label_names.clear();
                    thread_data.thread_action.label_names.add(session_data.config.processing_failed_label);
                }
            }
        });
        Logger.log(`Processed ${processed_thread_count} out of ${unprocessed_threads.length}.`);

        Utils.withTimer("applyAllActions", () => ThreadData.applyAllActions(session_data, all_thread_data));

        Utils.withTimer('addStatRecord',
            () => Stats.addStatRecord(start_time, processed_thread_count, processed_message_count));

        Utils.assert(all_pass, `Some processing fails, check emails`);
    }

    public static testProcessing(it: Function, expect: Function) {
        function test_proc(
            sheet_rows: { [key: string]: string}[] = [],
            thread_messages: Partial<GoogleAppsScript.Gmail.GmailMessage>[] = [],
            thread: Partial<GoogleAppsScript.Gmail.GmailThread> = {}
            ): ThreadData {

            const sheet = Mocks.getMockTestSheet(sheet_rows);
            const rules = Rule.parseRules(sheet);
            const session_data = Mocks.getMockSessionData({rules: rules});
            const mock_gmail_thread = Mocks.getMockThreadOfMessages(thread_messages, thread);
            const thread_data = new ThreadData(session_data, mock_gmail_thread);

            Processor.processThread(session_data, thread_data);
            return thread_data;
        }

        it('Throws error when message does not match any rule', () => {
            expect(() => {
                test_proc([
                    {
                        conditions: '(sender xyz@gmail.com)',
                        stage: '5',
                    },
                ], [
                    {
                        getFrom: () => 'abc@gmail.com',
                    }
                ])
            }).toThrow();
        })
        it('Does basic actions for simple rule and message', () => {
            const thread_data = test_proc([
                {
                    conditions: '(sender xyz@gmail.com)',
                    add_labels: 'abc, xyz',
                    stage: '5',
                },
            ], [
                {
                    getFrom: () => 'xyz@gmail.com',
                }
            ]);

            expect(thread_data.thread_action.action_after_match).toBe(ActionAfterMatchType.DEFAULT);
            expect(thread_data.thread_action.important).toBe(BooleanActionType.DEFAULT);
            expect(thread_data.thread_action.label_names).toEqual(new Set(['abc', 'xyz']));
            expect(thread_data.thread_action.move_to).toBe(InboxActionType.DEFAULT);
            expect(thread_data.thread_action.read).toBe(BooleanActionType.DEFAULT);
        })
        it('Does nothing to message that matches rule with no actions', () => {
            const thread_data = test_proc([
                {
                    conditions: '(sender xyz@gmail.com)',
                    stage: '5',
                },
            ], [
                {
                    getFrom: () => 'xyz@gmail.com',
                }
            ]);

            expect(thread_data.thread_action.action_after_match).toBe(ActionAfterMatchType.DEFAULT);
            expect(thread_data.thread_action.important).toBe(BooleanActionType.DEFAULT);
            expect(thread_data.thread_action.label_names).toEqual(new Set());
            expect(thread_data.thread_action.move_to).toBe(InboxActionType.DEFAULT);
            expect(thread_data.thread_action.read).toBe(BooleanActionType.DEFAULT);
        })
    }
}
