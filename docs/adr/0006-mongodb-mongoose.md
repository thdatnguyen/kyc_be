# Persistence: MongoDB + Mongoose

We use MongoDB with Mongoose for persistence, consistent with `SKILL_BE.md`.

KYC data is a good fit for a document store: the fields on an identity document vary by
`DocumentType`, and the schema is expected to evolve as vendor/regulatory requirements change.
Mongoose gives us schema validation, middleware, and TTL indexes (used for the JWT blacklist), and
`mongodb-memory-server` keeps tests isolated without an external database. The cost — weaker
relational integrity than PostgreSQL — is accepted because the Application/Submission hierarchy is
small and owned by a single service, and integrity rules are enforced at the application layer.
