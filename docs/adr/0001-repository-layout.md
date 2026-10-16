# Repository layout: `kyc_be` + `kyc_mobile`

We keep the backend and the Flutter app in two top-level folders of one repository, with the
shared domain vocabulary (`CONTEXT.md`) and cross-cutting decisions (`docs/`) at the root.

Two folders (rather than one package) keeps the Node and Flutter toolchains fully isolated — their
builds, CI, and dependency trees never interfere — while a single repo keeps the two in lock-step,
which matters because the domain model (Application → Submission → Verification) spans both. Shared
contracts live in documentation and the OpenAPI spec rather than a shared code package, since the
two runtimes can't import each other's types anyway.
