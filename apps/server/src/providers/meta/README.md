# Parked: Meta model stubs

Muse Image is implemented, in `services/museImage.ts` (see DECISIONS.md D41). The files here are
what is still unfinished and unused:

- `sam.ts` (SAM 3.1 segmentation) and `spark.ts` (Muse Spark image understanding) are placeholders.
  Nothing in the running server imports them, or `../../prompts/understanding-v1.ts`.
- `shared.ts` holds helpers those two would use.

Meta's documentation for both is at https://dev.meta.ai/docs (SAM: `/docs/sam/overview`). Read it
before filling them in; do not trust the endpoint comments in the stubs.
