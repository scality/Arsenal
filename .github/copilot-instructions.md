<!-- markdownlint-disable MD013 -->

# Code review instructions

Repo context lives in [CLAUDE.md](../CLAUDE.md) — read it first.

When reviewing a PR, analyze the changes against these criteria:

| Area                   | What to check                                                                                                                                                                                                                                |
| ---------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| TypeScript correctness | Proper typing, no unnecessary `any`, consistent use of strict mode, correct generics usage                                                                                                                                                   |
| Async error handling   | Uncaught promise rejections, missing error callbacks, swallowed errors in streams. Double callbacks in try/catch blocks — watch for `try { cb(); } catch(err) { cb(err); }` where an exception after the first `cb()` triggers a second call |
| Async/await migration  | When code is migrated from callbacks to async/await, verify: no leftover `callback` or `next` params, no mixed callback + promise patterns, proper try/catch around awaited calls, errors are re-thrown or handled (not silently swallowed)  |
| Stream handling        | Backpressure, proper cleanup on error, no leaked file descriptors                                                                                                                                                                            |
| Dependency pinning     | Git-based deps (werelogs, sproxydclient, httpagent) must pin to a tag, not a branch                                                                                                                                                          |
| Logging                | Proper use of werelogs, no `console.log` in production code, log levels match severity                                                                                                                                                       |
| Model compatibility    | Changes to data models (ObjectMD, BucketInfo, etc.) must preserve backward compatibility with older `mdModelVersion`                                                                                                                         |
| Error handling         | Proper use of ArsenalError, correct `.is` proxy checks, no swallowed errors                                                                                                                                                                  |
| API contract           | Breaking changes to exported interfaces in `index.ts`, renamed or removed public methods                                                                                                                                                     |
| Config changes         | Backward compatibility, default values, constants changes                                                                                                                                                                                    |
| Security               | Injection risks, auth bypass, improper input validation, OWASP-relevant issues                                                                                                                                                               |
| Breaking changes       | Anything that changes public APIs or interfaces exported by this library                                                                                                                                                                     |
| Test coverage          | New logic should have corresponding tests, existing tests should not be removed without justification                                                                                                                                        |
