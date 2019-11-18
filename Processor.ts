class Processor {

    private static processThread(session_data: SessionData, thread_data: ThreadData) {
        for (const message_data of thread_data.message_data_list) {
            // Apply each rule until matching a rule with a DONE action or matching a rule with
            // FINISH_STAGE and then exhausting all other rules in that stage.
            let min_stage = 0;
            let stopping_stage = Number.MAX_VALUE;
            for (const rule of session_data.rules) {
                if (rule.stage < min_stage) {
                    continue;
                }
                if (rule.stage > stopping_stage) {
                    break;
                }
                if (rule.condition.match(message_data)) {
                    console.log(`rule ${rule} matches message ${message_data}, apply action ${rule.thread_action}`);
                    thread_data.thread_action.mergeFrom(rule.thread_action);
                    let endThread = false;
                    switch (thread_data.thread_action.action_after_match) {
                        case ActionAfterMatchType.DONE:
                            // Break out of switch and then out of loop.
                            endThread = true;
                            break;
                        case ActionAfterMatchType.FINISH_STAGE:
                            stopping_stage = rule.stage;
                            break;
                        case ActionAfterMatchType.NEXT_STAGE:
                            min_stage = rule.stage + 1;
                            stopping_stage = Number.MAX_VALUE;
                            break;
                    }
                    if (endThread) {
                        break;
                    }
                }
            }

            // TODO: revisiting if auto labeling should be done differently
            // update auto labeling
            // if (thread_data.thread_action.auto_label == BooleanActionType.ENABLE) {
            //   thread_data.thread_action.addLabels([
            //     `${session_data.config.auto_labeling_parent_label}/${message_data.list}`]);
            // }

        }
        thread_data.validateActions();
    }

    public static processAllUnprocessedThreads() {
        const start_time = new Date();

        const session_data = new SessionData();
        if (!session_data.rules) {
            return;
        }

        const unprocessed_threads = withTimer("fetchUnprocessedThreads",
            () => GmailApp.search('label:' + session_data.config.unprocessed_label, 0,
                session_data.config.max_threads));
        Logger.log(`Found ${unprocessed_threads.length} unprocessed threads.`);
        if (!unprocessed_threads) {
            Logger.log(`All emails are processed, skip.`);
            return;
        }

        const all_thread_data = withTimer("transformIntoThreadData",
            () => unprocessed_threads.map(thread => new ThreadData(session_data, thread)));

        let processed_thread_count = 0, processed_message_count = 0;
        let all_pass = true;
        withTimer("collectActions", () => {
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

        withTimer("applyAllActions", () => ThreadData.applyAllActions(session_data, all_thread_data));

        withTimer('addStatRecord',
            () => Stats.addStatRecord(start_time, processed_thread_count, processed_message_count));

        assert(all_pass, `Some processing fails, check emails`);
    }
}
