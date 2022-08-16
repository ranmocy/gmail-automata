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

// Polyfills

import Condition from './Condition';
import {Config} from './Config';
import {Processor} from './Processor';
import {Stats} from './Stats';
import Utils from './utils';

// String.startsWith polyfill
if (!String.prototype.startsWith) {
    Object.defineProperty(String.prototype, 'startsWith', {
        value: function (search: String, rawPos: number) {
            var pos = rawPos > 0 ? rawPos | 0 : 0;
            return this.substring(pos, pos + search.length) === search;
        }
    });
}

// String.endsWith polyfill
if (!String.prototype.endsWith) {
    String.prototype.endsWith = function (search, this_len) {
        if (this_len === undefined || this_len > this.length) {
            this_len = this.length;
        }
        return this.substring(this_len - search.length, this_len) === search;
    };
}

// Object.assign polyfill
if (typeof Object.assign !== 'function') {
    // Must be writable: true, enumerable: false, configurable: true
    Object.defineProperty(Object, "assign", {
        value: function assign(target: Object, _source1: Object, ..._sources: Array<Object>) { // .length of function is 2
            if (target === null || target === undefined) {
                throw new TypeError('Cannot convert undefined or null to object');
            }

            var to = Object(target);

            for (var index = 1; index < arguments.length; index++) {
                var nextSource = arguments[index];

                if (nextSource !== null && nextSource !== undefined) {
                    for (var nextKey in nextSource) {
                        // Avoid bugs when hasOwnProperty is shadowed
                        if (Object.prototype.hasOwnProperty.call(nextSource, nextKey)) {
                            to[nextKey] = nextSource[nextKey];
                        }
                    }
                }
            }
            return to;
        },
        writable: true,
        configurable: true
    });
}

// Top level functions

// Triggered when Spreadsheet is opened
// noinspection JSUnusedGlobalSymbols
function onOpen(e: { authMode: GoogleAppsScript.Script.AuthMode }) {
    const ui = SpreadsheetApp.getUi();
    const menu = ui.createMenu('Gmail Automata');
    if (e && e.authMode == ScriptApp.AuthMode.NONE) {
        menu.addItem('Configure this spreadsheet', 'configureSpreadsheets');
    } else {
        menu
            .addItem('Process now', 'processEmails')
            .addSeparator()
            .addItem('Start auto processing', 'setupTriggers')
            .addItem('Stop auto processing', 'cancelTriggers')
            .addSeparator()
            .addSubMenu(
                ui.createMenu('DEBUG')
                    .addItem('Run tests', 'testAll'));
    }
    menu.addToUi();
}

// Triggered when time-driven trigger or click via Spreadsheet menu
function processEmails() {
    Utils.withFailureEmailed("processEmails", () => Processor.processAllUnprocessedThreads());
}

function sanityChecking() {
    Utils.withFailureEmailed("sanityChecking", () => {
        Stats.collapseStatRecords();
    });
}

function setupTriggers() {
    cancelTriggers();

    Utils.withFailureEmailed("setupTriggers", () => {
        const config = Utils.withTimer("getConfigs", () => Config.getConfig());
        Utils.withTimer("addingTriggers", () => {
            let trigger = ScriptApp.newTrigger('processEmails')
                .timeBased()
                .everyMinutes(config.processing_frequency_in_minutes)
                .create();
            Logger.log(`Created trigger ${trigger.getHandlerFunction()}: ${trigger.getUniqueId()}`);
            trigger = ScriptApp.newTrigger('sanityChecking')
                .timeBased()
                .atHour(config.hour_of_day_to_run_sanity_checking)
                .everyDays(1)
                .create();
            Logger.log(`Created trigger ${trigger.getHandlerFunction()}: ${trigger.getUniqueId()}`);

            Utils.assert(ScriptApp.getProjectTriggers().length === 2,
                `Unexpected trigger lists: ${ScriptApp.getProjectTriggers()
                    .map(trigger => trigger.getHandlerFunction())}`);
        });
    });
}

function cancelTriggers() {
    Utils.withFailureEmailed("cancelTriggers", () => {
        ScriptApp.getProjectTriggers().forEach(trigger => {
            Logger.log(`Deleting trigger ${trigger.getHandlerFunction()}...`);
            ScriptApp.deleteTrigger(trigger);
        });
    });
}

function testAll() {
    Condition.testAll();
}
