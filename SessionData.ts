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

class SessionData {

    private static getLabelMap(): { [key: string]: GoogleAppsScript.Gmail.GmailLabel } {
        let labels: { [key: string]: GoogleAppsScript.Gmail.GmailLabel } = {};
        for (const label of GmailApp.getUserLabels()) {
            labels[label.getName()] = label;
        }
        return labels;
    }

    public readonly user_email: string;
    public readonly config: Config;
    private readonly labels: { [key: string]: GoogleAppsScript.Gmail.GmailLabel };
    public readonly rules: Rule[];

    public readonly processing_start_time: Date;
    public readonly oldest_to_process: Date;

    constructor() {
        this.user_email = withTimer("getEmail", () => Session.getActiveUser().getEmail());
        this.config = withTimer("getConfigs", () => Config.getConfig());
        this.labels = withTimer("getLabels", () => SessionData.getLabelMap());
        this.rules = withTimer("getRules", () => Rule.getRules());

        this.processing_start_time = new Date();
        // Check back two processing intervals to make sure we checked all messages in the thread
        this.oldest_to_process = new Date(
            this.processing_start_time.getTime() - 2 * this.config.processing_frequency_in_minutes * 60 * 1000);
    }

    getOrCreateLabel(name: string) {
        name = name.trim();
        assert(name.length > 0, "Can't get empty label!");

        if (!(name in this.labels)) {
            // Also create parent labels too if necessary.
            const pos = name.lastIndexOf('/');
            if (pos != -1) {
                this.getOrCreateLabel(name.substring(0, pos));
            }

            Logger.log(`Creating missing label ${name}...`);
            this.labels[name] = GmailApp.createLabel(name);
        }
        return this.labels[name];
    }
}
