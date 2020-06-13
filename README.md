# Gmail Automata

[![Build Status](https://travis-ci.com/ranmocy/gmail-automata.svg?branch=master)](https://travis-ci.com/ranmocy/gmail-automata)

## Introduction

The purpose of this project is to do a better job to replace existing Gmail
filters.

The idea is to archive all incoming emails by default, and attach it to
the "unprocessed" label. Then a background script which is included in
this spreadsheet will be automatically triggerred every 5 minutes (or according
to the "configs"). When the script runs, it fetch all emails with "unprocessed"
label, appy actions to those emails according to the "rules. Finally, move them
to the "processed" label and remove them from the "unprocessed" one.

During the process, it goes through all unprocessed email threads. For each
email in the thread, check all rules in order of "stage". If a rule's
"condition" matches that email, the associated actions will be applied to the
thread. If any rule matches, the processing of the email will stop after all
rules with the same stage applied. If no rule matches the thread, it will treat
it as error in case it's a new type of emails. *You could add a rule to match
all emails at the end if you don't like this behavior.*

If any error happens to the processing, the email thread will be moved to inbox
with label "error" by default, so you won't miss it because of this script. Also
script executor will send you email about the failure, so you could check what's
the reason behind.

## Setup

1. Clone this [spreadsheet][spreadsheet]: File -> Make a copy. You need your own
version to process your emails on your behalf. You need to grant permissions for
your new spreadsheet to continue.

    Notice: If you can't see "Gmail Automata" in the spreadsheet menu, you may
    need to manually add the trigger:
    1. In the spreadsheet, open "Tools" -> "Script editor"
    2. In the editor, open "Edit" -> "Current project's triggers"
    3. In Apps Script dashboard, click "Add Trigger"
    4. "Choose which function to run": select "onOpen"
    5. "Select event type": select "On open"
    6. Click "Save"

2. Review sheets "configs" and "rules". Replace "ranmocy@gmail.com" with your
email address in those sheets.
3. In Gmail, create label "0unprocessed"
4. If you want to test before automation, go to step 5; Otherwise, go to step 7.
5. Add some (<=50) emails to "0unprocessed" label. Click menu "Gmail Automata"
-> "Process now" to trigger one time processing. *Notice that if you add too
many threads, each execution would only process the first 50 threads.* *Also if
a thread is too old (twice the processing interval, 10 minutes by default), only
the latest email would be processed.*
6. Check emails result with label "0processed" and update rules and go back to
step 5 until you are satisfied.
7. In Gmail's settings, empty your current filters (better to export them first
as a backup!) and add following ones (*Remember to replace email with yours!*
Also replace "urgent" to a tag you wish to bypass the script to reduce the
latency):

    ```text
    Matches: from:(-apps-scripts-notifications@google.com) -in:chats to:(-YOUR_EMAIL+urgent@gmail.com) -{label:mute}
    Do this: Skip Inbox
    Matches: from:(YOUR_EMAIL@gmail.com) to:(YOUR_EMAIL@gmail.com)
    Do this: Apply label "0unprocessed"
    Matches: from:(-YOUR_EMAIL@gmail.com,-apps-scripts-notifications@google.com) to:(-YOUR_EMAIL+urgent@gmail.com) -in:chats -{label:mute}
    Do this: Apply label "0unprocessed"
    ```

8. [Optional] In Gmail settings -> "Inbox", switch "Inbox type" to
"Important first"
9. Click menu "Gmail Automata" -> "Start auto processing" to setup auto
triggering
10. You are good to go! Enjoy!

## Customization

Check notes of headers of "configs" and "rules" for detailed explaination on
each columns.

## Upgrade

### By forking again

1. In old spreadsheet, click menu "Gmail Automata" -> "Stop auto processing" to
remove auto triggering
2. Re-fork the main [spreadsheet][spreadsheet], copy your settings in "configs",
"rules" from old spreadsheet to the newly forked one
3. In new forked spreadsheet, click menu "Gmail Automata" ->
"Start auto processing" to setup auto triggering
4. Delete old spreadsheet

### By script deploy

See section [Deploy](#Deploy) below.

## OptOut

Click menu "Gmail Automata" -> "Stop auto processing" to remove auto triggering.

## Dev setup

1. Install NodeJs and NPM.
2. Clone source code and install dependencies:
    ```bash
    git clone https://github.com/ranmocy/gmail-automata.git
    cd gmail-automata
    npm install
    ```

## Deploy

1. Setup local development enviroment following the section
[Dev setup](#dev-setup) above.
2. Add ".clasp.json" file: `cp .clasp.json.example .clasp.json`.
3. Update the script id in ".clasp.json" file. To find the script id:
    1. Setup the script following the section [Setup](#Setup) above if you
    haven't do it.
    2. In the spreadsheet, click menu "Tools" -> "Script Editor".
    3. In the script editor, click menu "File" > "Project properties" > "Info".
4. Login CLASP: `npx clasp login` and authorize the app in the browser.
5. Deploy current version: `npx clasp deploy`.

## Changelog

* 2020-01-10: First Google internal beta version
* 2019-04-04: First early adopter alpha version


## Roadmap (TODO)

1. Ignore oldest_to_process when it's manual processing. Otherwise during
  onboarding user may be confused about why old messages are not applied.
2. In-place upgrading
3. Consider to migrate to AppScript library to provide easier upgrading
  experience
3. Auto labeling
6. Auto reply action

[spreadsheet]: https://docs.google.com/spreadsheets/d/1pkx69yw7_gjujuqTPuWhpMiW481RzCeLBizkq0HczcI/edit?usp=sharing
