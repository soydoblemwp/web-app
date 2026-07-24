// Polyfills `indexedDB`/`IDBKeyRange` globally for the Node test environment,
// so src/lib/guest-storage/* (real IndexedDB code, no mocking) can be
// exercised directly in tests exactly as it runs in the browser.
import "fake-indexeddb/auto";
