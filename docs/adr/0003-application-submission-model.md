# Domain model: Application + immutable, versioned Submissions

An Applicant has one `Application` (their KYC journey) which holds current status and the
resume/draft point. Every submit — and every resubmission after a rejection — creates a new,
immutable `Submission` version.

We chose versioned immutable Submissions over a single mutable record because KYC needs an audit
trail: a reviewer must be able to see exactly what changed between attempts, and a rejection must
never overwrite the evidence it was based on. The Application remains the "current" pointer, so
clients have a single stable object to poll while history is preserved underneath.
