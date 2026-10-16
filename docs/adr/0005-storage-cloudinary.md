# Storage: Cloudinary (private, signed) with a local fallback

Document and selfie images are stored in Cloudinary as **private** assets and are never served
publicly. The mobile app fetches them only through an authenticated backend endpoint that returns a
short-lived **signed** Cloudinary URL.

We chose Cloudinary for production (matches the backend skill, no self-managed bucket) but put a
`StorageProvider` interface in front of it with a local-disk implementation selected automatically
when `CLOUDINARY_*` env vars are absent. This lets local development and CI run with zero keys
today, and switches to Cloudinary the moment keys are provided — with no code change. Signed,
short-lived URLs (rather than public URLs) are a deliberate security choice: a leaked media URL
expires and only works after authentication.
