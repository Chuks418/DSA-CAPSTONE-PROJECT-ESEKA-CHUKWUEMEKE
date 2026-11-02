# AI log

Every time you give an AI tool a significant prompt, add an entry. Three lines each.
"Nothing was wrong" is allowed, but it is rarely true. Your instructor will read this.
## Build 1

### Prompt 1: Build 1 prompt (docs/build-1.md)
- **What I asked:** Implement the in-memory ticketing domain core, including domain errors, secure ID and booking-reference generation, a linked-list FIFO waitlist queue, inventory management, booking and cancellation logic, a demo, and a lookup benchmark.
- **What came back:** Domain modules for errors, IDs, queue, and inventory; a demo showing ticket sales, sellout, waitlist and cancellation; and a benchmark comparing `Map.get()` with `Array.find()`.
- **What was wrong (or "nothing"):** Some input validation needed strengthening. The booking tests also contained a duplicate missing-user test and lacked a test proving that an unsuccessful booking leaves inventory unchanged. These were corrected, and the full test suite passed.

### Prompt 2: Code review and corrections
- **What I asked:** Review the domain implementation and tests, improve validation, correct the test coverage, and check the lookup benchmark.
- **What came back:** Updated validation for organizer and user IDs, safer booking preparation before inventory mutation, corrected booking tests, and benchmark results demonstrating the performance difference between Map lookup and array search.
- **What was wrong (or "nothing"):** The first attempt to replace the booking test section accidentally removed the file's imports and setup. This caused a `ReferenceError`. The complete test file was restored and corrected. The final test run passed all 46 tests with no failures.
## Build 2

### Prompt 1: Build 2 prompt (docs/build-2.md)
- **What I asked:**
- **What came back:**
- **What was wrong (or "nothing"):**

### Prompt 2:
- **What I asked:**
- **What came back:**
- **What was wrong (or "nothing"):**

## Build 3

### Prompt 1: Build 3 prompt (docs/build-3.md)
- **What I asked:** Add the architecture diagrams, booking state machine, Node HTTP router/server, configuration, startup script, and tests.
- **What came back:** A layered architecture document, explicit booking transitions, static-file HTTP server, `/health` route, startup configuration, and `node:test` coverage.
- **What was wrong (or "nothing"):** The first server draft relied on an implicit response/request property for HEAD handling and had redundant error-status logic; both were simplified. Added a regression test proving static requests cannot escape `public/`.
