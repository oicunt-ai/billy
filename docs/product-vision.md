# BILLY Product Vision

Direction, not implementation. Items marked OPEN have no approved decision
— do not present them as decided, and do not invent segments, roadmaps or
UI specifications beyond this file.

## Established direction

- BILLY is OICUNT AI's first standalone AI chatbot product, powered by the
  shared Platform + AI Platform infrastructure over public HTTP contracts.
- BILLY is developed independently: product UI and BFF live only in this
  repository; platform capabilities are consumed, never duplicated.
- Implemented today (see `README.md`): responsive streaming chat UI,
  development-only browser sign-in, server-side BFF (catalog, conversation
  creation, streaming completions, history), multi-turn Memory continuity,
  reload persistence of saved conversations.
- Verified milestone (historical finding): live AI chat works end-to-end
  through Gateway → admission → orchestration → provider → metering when
  the surrounding stack runs with admission/publishing enabled.

## Product principles (proposed)

- Fast, grounded replies; reasoning internals stay hidden unless the user
  opts in.
- Every chat belongs to a server-created conversation; history reloads
  across sessions.
- The browser holds no platform credentials — all Gateway access is
  server-side.

## OPEN DECISIONS (unapproved — do not assume)

1. Target audience and positioning.
2. Public launch strategy and timelines.
3. Pricing and packaging.
4. Production authentication (provider, sessions, sign-up flow).
5. Feature roadmap (voice, multimodal, tools, agents, mobile).
6. Design language and UX specification.
7. Success metrics and analytics approach.
