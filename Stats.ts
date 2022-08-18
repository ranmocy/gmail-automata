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

export class Stats {

    private static RECORD_SHEET_NAME = 'statistics';
    private static SUMMARY_SHEET_NAME = 'daily_stats';

    public static addStatRecord(
        start_time: Date, processed_thread_count: number, processed_message_count: number) {
        const statsSheet = SpreadsheetApp.getActiveSpreadsheet().getSheetByName(Stats.RECORD_SHEET_NAME);
        if (!statsSheet) {
            Logger.log(`Could not find "${Stats.RECORD_SHEET_NAME}" sheet!`);
            return;
        }
        const duration = new Date().getTime() - start_time.getTime();
        statsSheet.appendRow([start_time, processed_thread_count, processed_message_count, duration]);
    }

    public static collapseStatRecords() {
        const spread_sheet = SpreadsheetApp.getActiveSpreadsheet();
        const record_sheet = spread_sheet.getSheetByName(Stats.RECORD_SHEET_NAME);
        const summary_sheet = spread_sheet.getSheetByName(Stats.SUMMARY_SHEET_NAME);
        if (!record_sheet) {
            Logger.log(`Could not find "${Stats.RECORD_SHEET_NAME}" sheet!`);
            return;
        }
        if (!summary_sheet) {
            Logger.log(`Could not find "${Stats.SUMMARY_SHEET_NAME}" sheet!`);
            return;
        }

        let execution_count = 0;

        let thread_total = 0;
        let thread_min = Number.MAX_VALUE;
        let thread_max = 0;

        let message_total = 0;
        let message_min = Number.MAX_VALUE;
        let message_max = 0;

        let duration_total = 0;
        let duration_min = Number.MAX_VALUE;
        let duration_max = 0;

        const range = record_sheet.getRange(2, 1, record_sheet.getLastRow() - 1, record_sheet.getLastColumn());
        const rows = range.getValues() as number[][];
        for (const row of rows) {
            // [start_time, processed_thread_count, processed_message_count, duration]
            if (!row[0]) {
                continue;
            }
            execution_count++;
            thread_total += row[1];
            thread_min = Math.min(thread_min, row[1]);
            thread_max = Math.max(thread_max, row[1]);

            message_total += row[2];
            message_min = Math.min(message_min, row[2]);
            message_max = Math.max(message_max, row[2]);

            duration_total += row[3];
            duration_min = Math.min(duration_min, row[3]);
            duration_max = Math.max(duration_max, row[3]);
        }

        const thread_avg = thread_total / execution_count;
        const message_avg = message_total / execution_count;
        const duration_avg_per_execution = duration_total / execution_count;
        const duration_avg_per_thread = duration_total / thread_total;
        const duration_avg_per_message = duration_total / message_total;

        const now = new Date();
        const format = spread_sheet.getSpreadsheetLocale() == 'en_US' ? 'MM/dd/yyyy' : 'dd/MM/yyyy';
        summary_sheet.appendRow([
            Utilities.formatDate(now, spread_sheet.getSpreadsheetTimeZone(), format),
            execution_count, thread_total, thread_min, thread_max, thread_avg,
            message_total, message_min, message_max, message_avg, duration_total, duration_min,
            duration_max, duration_avg_per_execution, duration_avg_per_thread, duration_avg_per_message
        ]);

        range.clear();
    }
}