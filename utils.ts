function assert(condition: boolean, msg: string) {
    if (!condition) {
        throw msg;
    }
}

function withTimer<T>(taskName: string, func: () => T): T {
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

function withFailureEmailed<T>(taskName: string, func: () => T): T {
    try {
        return withTimer(taskName, func);
    } catch (e) {
        // Email exceptions
        GmailApp.sendEmail(
            Session.getActiveUser().getEmail(),
            'Log for failure in GMail Label Zen',
            `Captured an error: ${e}\n\n${Logger.getLog()}`);
        throw e;
    }
}
