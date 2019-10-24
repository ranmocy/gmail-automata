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
            .addItem('Start auto processing (b/117476035)', 'setupTriggers')
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
