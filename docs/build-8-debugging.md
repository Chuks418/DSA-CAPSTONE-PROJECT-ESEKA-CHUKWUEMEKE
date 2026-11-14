# Build 8 Debugging Exercise

## Issue: Waitlist service filename case mismatch

**Problem discovered:** The application imported the waitlist service using `waitlistService.js`, but the actual filename was `waitListService.js`.

**Investigation:** I searched the project for both filename variations and checked the imports in `src/server.js` and `src/http/routes.js`. The mismatch was possible to overlook because Windows uses a case-insensitive filesystem by default.

**Root cause:** The filename and import path did not use identical capitalization. This could cause a module resolution error in a case-sensitive environment such as Linux.

**Correction:** Renamed the file to `src/services/waitlistService.js`, matching the import paths.

**Verification:**
- Confirmed that only `waitlistService.js` exists.
- Ran `npm.cmd test`.
- All 159 tests passed across 25 suites.
- No test failures, skipped tests or cancelled tests.

## Lessons learned

1. File and import capitalization should always match exactly.
2. Code that works on Windows should also be checked for compatibility with case-sensitive environments.
3. Search the project for all references before renaming files.
4. Run the complete automated test suite after correcting a defect.

**Note:** This issue was identified during code review. It was not a confirmed production or Linux deployment failure.