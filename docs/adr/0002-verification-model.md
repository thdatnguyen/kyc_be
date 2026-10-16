# Verification model: internal rules engine + admin review

Verification is implemented as a real server-side pipeline — a deterministic rules engine plus a
server-authoritative face match — with a `VerificationProvider` interface so a commercial vendor
(Onfido/Jumio/SumSub) can be swapped in later without touching the rest of the app.

We chose an internal engine over a vendor because it needs no API keys and can be demoed end-to-end
offline, while still being genuine logic rather than a mocked API. The interface is the deliberate
"no": the rules engine is not called directly from controllers, so the decision boundary stays
vendor-swappable. Anything the engine can't confidently decide (low face-match confidence, ML
failure) falls to an `NEEDS_REVIEW` outcome that a human Admin resolves — never a silent pass/fail.
