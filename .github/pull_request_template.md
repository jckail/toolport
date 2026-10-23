<!-- Title: commit-subject style with the Linear key, e.g. "ci: move CI to Depot CI (JCK-123)". Branch must contain jck-<n>. -->

## Summary

<!-- What changed, in two or three sentences. -->

## Why

<!-- The problem or request this solves. -->

Linear: JCK-

## Changes

<!-- The notable parts. File by file only where that helps a reviewer. -->

## Verification

<!-- Exact commands you ran and their result, plus the Depot CI run link. Say what you could not verify. -->

- [ ] Depot CI `depot-ci / ci-result` green: <!-- https://depot.dev/orgs/f3bqc4vdfr/workflows/... -->
- [ ] `npm run build` passes
- [ ] `npm run test` passes
- [ ] `npm run audit:prod` passes
- [ ] `npm run test:rust` passes
- [ ] Ran the app (`npm run tauri dev`) and checked the change by hand, if it touches the UI

## Risk and rollback

<!-- What could break, who or what it affects, and how to undo it.
     Confirm no secrets, keys, or personal paths are included in the diff. -->
