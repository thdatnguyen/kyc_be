# Face match split: on-device liveness, server-authoritative match

Liveness (a blink challenge) runs **on-device** in Flutter; face **matching** between the selfie and
the document photo is recomputed **server-side** and is the only trusted verdict.

The reason is trust and physics: liveness is fundamentally about the moment of capture, so it must
happen on the device holding the camera; identity, meanwhile, must never be decided by a client we
don't control. The app's on-device liveness/quality signals are therefore recorded as hints, while
the backend independently extracts face descriptors (via `@vladmandic/human` + tfjs-node) and
compares them by cosine similarity. If the model can't load or the match is inconclusive, the
submission degrades to `NEEDS_REVIEW` — we never let a client-side claim or an ML failure produce a
false approval or rejection.
