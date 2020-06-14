// Polyfills

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
    withFailureEmailed("processEmails", () => Processor.processAllUnprocessedThreads());
}

function sanityChecking() {
    withFailureEmailed("sanityChecking", () => {
        Stats.collapseStatRecords();
    });
}

function setupTriggers() {
    cancelTriggers();

    withFailureEmailed("setupTriggers", () => {
        const config = withTimer("getConfigs", () => Config.getConfig());
        withTimer("addingTriggers", () => {
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

            assert(ScriptApp.getProjectTriggers().length === 2,
                `Unexpected trigger lists: ${ScriptApp.getProjectTriggers()
                    .map(trigger => trigger.getHandlerFunction())}`);
        });
    });
}

function cancelTriggers() {
    withFailureEmailed("cancelTriggers", () => {
        ScriptApp.getProjectTriggers().forEach(trigger => {
            Logger.log(`Deleting trigger ${trigger.getHandlerFunction()}...`);
            ScriptApp.deleteTrigger(trigger);
        });
    });
}

function testAll() {
    Condition.testAll();
}
