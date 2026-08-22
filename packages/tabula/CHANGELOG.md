# @thinkly/tabula-js

## 0.3.0

### Minor Changes

- Publish the feature-complete pre-1.0 API candidate for Tabula's deliberately narrow
  same-origin workspace model:

  - deterministic workspace lifecycle and tab identity;
  - convergent typed shared UI state;
  - bounded presence and recovery;
  - Web-Lock-authorized leadership;
  - atomic, fenced named views;
  - framework-neutral integration and deterministic test adapters; and
  - zero-dependency ESM/CJS/types packaging with provenance-backed releases.

  This is a preview under the `next` tag, not a stable semver 1.x commitment.

## 0.2.0

### Minor Changes

- 59f8fad: Keep the package root focused on application coordination by removing internal
  protocol-envelope, state-operation, synchronization-payload, and storage-projection
  types from the public exports. Publish a canonical API reference and executable
  packed-package examples for browser, React, ESM, CJS, and testing consumers.
- c6832d8: Harden workspace coordination with versioned validation, stable tab identity,
  Web-Lock-authorized leadership and views, convergent state operations, repairable
  startup synchronization, and deterministic test adapters.

## 0.2.0-alpha.0

### Minor Changes

- 59f8fad: Keep the package root focused on application coordination by removing internal
  protocol-envelope, state-operation, synchronization-payload, and storage-projection
  types from the public exports. Publish a canonical API reference and executable
  packed-package examples for browser, React, ESM, CJS, and testing consumers.
- c6832d8: Harden workspace coordination with versioned validation, stable tab identity,
  Web-Lock-authorized leadership and views, convergent state operations, repairable
  startup synchronization, and deterministic test adapters.

## 0.1.0 (unpublished source baseline)

- Established the initial framework-neutral workspace API for shared UI state,
  presence, leadership, named views, and deterministic testing utilities.
- This source version was never published to npm. The unscoped names `tabula` and
  `tabula-js` were already owned by unrelated projects and were never release targets
  for this repository.
- The selected package name is `@thinkly/tabula-js`; its first registry
  artifact will be a pre-1.0 preview published with the `next` dist-tag.
