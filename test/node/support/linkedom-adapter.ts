// The reference adapter now ships as `scrapling-js/node`; keep this alias so
// the Node tests exercise the public entry point instead of a private copy.
export { createNodeDomAdapter as createLinkedomAdapter } from '../../../src/node'
