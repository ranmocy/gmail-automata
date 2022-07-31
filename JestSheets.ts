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

// Creates light-weight Jest-compatible functions that can be run on
// an active Sheet.

class JestResultError extends Error {
    constructor(msg: string) {
        super(msg);
        // Set prototype explicitly for TypeScript Breaking-Changes
        Object.setPrototypeOf(this, JestResultError.prototype);
    }
}

class JestExpectOperand {
    private readonly actual: any;
    constructor(actual: any) {
        this.actual = actual;
    }

    toBe(expected: any) {
        if (this.actual !== expected) {
            throw new JestResultError(`Expected: ${expected}, Actual: ${this.actual}`);
        }
    }

    toEqual(expected: any) {
        if (Array.isArray(this.actual) && Array.isArray(expected)) {
            if (this.actual.length != expected.length) {
                throw new JestResultError(
                    `Arrays are wrong size. Expected: ${expected.length}, Actual: ${this.actual.length}`);
            }
            expected.every((item, index) => {
                if (item != this.actual[index]) {
                    throw new JestResultError(`Expected '${item}' in array, but got '${this.actual[item]}'`)
                }
            });
        } else if (this.actual instanceof Set && expected instanceof Set) {
            if (this.actual.size != expected.size) {
                throw new JestResultError(
                    `Sets are wrong size. Expected: ${expected.size}, Actual: ${this.actual.size}`);
            }
            expected.forEach(item => {
                if (!this.actual.has(item)) {
                    throw new JestResultError(`Expected '${item}' in Set.`)
                }
            });
        } else {
            throw new Error(`'toEqual' currently only supports Arrays/Sets, but got '${typeof expected}'`);
        }
    }

    toBeGreaterThan(expected: any) {
        if (this.actual <= expected) {
            throw new JestResultError(`Expected: ${expected} to be Greater Than Actual: ${this.actual}`);
        }
    }

    toThrow() {
        if (typeof this.actual !== 'function') {
            throw new Error('Test expects a function');
        }
        try {
            this.actual();
            throw new JestResultError(`Expected to throw exception, but didn't`);
        }
        catch {
        }
    }
}

export class JestExpect {
    expect(actual: any) {
        return new JestExpectOperand(actual);
    }
}

export class JestIt {
    it(message: string, test_function_callback: Function) {
        try {
            test_function_callback();
        }
        catch(e) {
            if (e instanceof JestResultError) {
                throw new Error(`Test Failure: ${message}. ${e.message}`);
            } else {
                throw e;
            }
        }
    }
}

