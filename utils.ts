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

export function assert(condition: boolean, msg: string) {
    if (!condition) {
        throw msg;
    }
}

export function withTimer<T>(taskName: string, func: () => T): T {
    const startTime = new Date();
    try {
        const res = func();
        Logger.log(`Finished ${taskName} successfully in ${new Date().getTime() - startTime.getTime()}ms`);
        return res;
    } catch (e) {
        Logger.log(
            `Finished ${taskName} failed in ${new Date().getTime() - startTime.getTime()}ms: ${e.name}\nMessage: ${e.message}`);
        throw e;
    }
}

export function withFailureEmailed<T>(taskName: string, func: () => T): T {
    try {
        return withTimer(taskName, func);
    } catch (e) {
        // Email exceptions
        GmailApp.sendEmail(
            Session.getActiveUser().getEmail(),
            'Log for failure in Gmail Automata',
            `Captured an error: ${e}\n\n${Logger.getLog()}`);
        throw e;
    }
}
