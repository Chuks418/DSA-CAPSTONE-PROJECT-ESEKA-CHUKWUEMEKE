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

## Build 2 (retrospective record)

### Implementation and review
- **What I asked:** Implement and review event publishing, unpublishing, event search, filtering, sorting and the associated booking and inventory requirements.
- **What came back:** Event search and summary functions, a stable merge-sort implementation, publishing and unpublishing functionality, and automated tests covering the Build 2 requirements.
- **What was wrong (or "nothing"):** Some test coverage and validation needed correction during development. These were addressed, and the final Build 2 test run passed all 49 tests with no failures.

## Build 3

### Prompt 1: Build 3 implementation review and verification
- **What I asked:** Review the booking state machine, router, HTTP application, server configuration and automated tests against the Build 3 requirements. Explain the implementation and guide me through testing the server.
- **What came back:** A review of the implementation, identification of the missing `start` script, and guidance for testing the health endpoint, static file serving, unknown API routes and malformed JSON.
- **What was wrong (or "nothing"):** The `start` script was missing from `package.json`. It was added as `node src/server.js`. No critical implementation defects were identified during the review. Manual HTTP checks succeeded, and the final test suite passed all 59 tests with no failures.
## Build 4

### Prompt 1: REST API implementation and review
- **What I asked:** Implement the in-memory REST API for event creation, ticket tiers, publishing, searching, bookings, mock payments and cancellation, following the Build 4 architecture and acceptance criteria.
- **What came back:** An in-memory repository, event and booking services, mock payment gateway, API routes, server integration, API examples and real HTTP API tests.
- **What was wrong (or "nothing"):** The initial API test suite did not include an automated test proving that a cancelled booking cannot be paid. This was identified during review, added to the test suite and verified. The final test run passed all 80 tests with no failures.

## Build 5

### Prompt 1: SQLite persistence and overselling protection
- **What I asked:** Implement SQLite persistence using Node.js `node:sqlite`, create the database schema and SQLite repository, preserve the existing service architecture, add database seeding, and demonstrate the last-ticket overselling problem with 50 concurrent booking attempts.
- **What came back:** SQLite schema and connection, SQLite repository, persistent server integration, seed script, and an overselling demonstration using an in-memory database.
- **What was wrong (or "nothing"):** The original read-then-write reservation approach was vulnerable to a race condition. Fifty concurrent requests could create 50 bookings for one available seat.

### Prompt 2: Atomic overselling fix and regression testing
- **What I asked:** Fix overselling with an atomic conditional SQLite update, add a regression test for 50 concurrent booking attempts, and verify the before-and-after behaviour.
- **What came back:** An atomic `UPDATE` statement that reserves seats only when capacity permits, an updated booking service, and a dedicated overselling regression test.
- **What was wrong (or "nothing"):** The before-fix experiment reproduced 49 oversold tickets. The atomic update corrected the problem: one booking succeeded and 49 requests received `SOLD_OUT`. The final test suite passed all 81 tests with no failures. SQLite persistence was also verified after restarting the server.
An in-memory lock variable is not a reliable database-level safeguard because separate server processes do not share the same lock state. A second check also does not solve the problem because concurrent requests can pass the check before either request updates the database.