// Options page behaviour: read and write chrome.storage.local. Nothing else —
// no rule building here (that lives in lib/rules.js), no direct DNR access
// (that is the service worker's job, triggered by storage.onChanged).

// PHASE 1 PLACEHOLDER — no productive code yet.

// TODO Phase 2: implement.
//   load()  -> chrome.storage.local.get -> fill the form
//   save()  -> validate, then chrome.storage.local.set
//
// Validation is a trust boundary, not a nicety: the UPN goes straight into an
// authorize URL. Reject anything that is not a plain user@domain — in
// particular '&', '#', '?', whitespace and non-ASCII control characters, which
// would let a pasted value smuggle additional query parameters into the request.
// An empty UPN is valid and means "inert" (A3); it must clear the stored value,
// not leave the previous one behind.
