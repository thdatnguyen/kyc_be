# KYC Flow Backward Navigation & Draft State Restoration

## Status
Accepted

## Context
During the identity verification flow (`Identity & Details` → `Selfie` → `Review`), Applicants may need to navigate backward to review or adjust previously entered information or captured document photos. Previously, the flow only supported forward progression via the "Continue" CTA, leaving Applicants unable to return to earlier steps without restarting or exiting.

## Decision
1. **Multi-Touchpoint Backward Navigation**:
   - **AppBar Leading Back Arrow**: On Steps 2 and 3, tapping the back arrow decrements the active step (`_step - 1`). On Step 1, tapping back exits to the Home view while preserving the Draft on the server.
   - **Form Bottom Actions**: On Steps 2 and 3, an explicit `Back` button is rendered alongside `Continue` / `Submit Application`.
   - **System Back Gesture (`PopScope`)**: Intercepts device back gestures to step backward when `_step > 0`.

2. **Draft State Restoration**:
   - Stepping backward re-populates all form inputs and document thumbnail photos directly from the active `Draft` (`application.draft`), allowing the Applicant to inspect previously entered values.
   - Editing fields or adding/removing document photos on Step 1 updates the server Draft when "Continue" is tapped.

3. **Multiple Document Photos**:
   - Multiple captured document photos are stored as a comma-separated string in `document.imagePublicId`.
