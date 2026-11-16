# QuestKeeps team

The lead selects the smallest useful set of roles from `.codex/agents/` and integrates the results. Small fixes can go straight to the relevant developer. Assign distinct file ownership when work runs in parallel.

- **Architect** designs cross-cutting changes and reviews failure and rollback paths.
- **Frontend** implements the interface. **Frontend quality** checks responsive behavior, accessibility and browser regressions independently.
- **Backend** owns APIs, authorization, provider integrations and workers. **Database** owns SQLite migrations, queries and data integrity.
- **Designer** defines interactions and follows the shared brand across surfaces. **Marketing** proposes acquisition and retention experiments with success measures.
- **Business systems analyst** turns user intent into rules and testable scenarios. **Product owner** reviews scope and acceptance from the business perspective. The human requester retains decision authority.

For a substantial feature, agree on outcomes and acceptance criteria, settle interface and data contracts, then assign implementation and independent review. Verify through the normal entry points. Releases follow [Docker deployment](DOCKER-DEPLOY.md).

## Graphify

Use the local code graph for cross-cutting navigation, such as tracing a guest media request or following a sync job from its API to the worker. Check key links in the source because generated links can be inferred or stale. Use runtime measurements for latency and tests for behavior.

For local indexing, use the official `graphifyy` CLI on a source-only snapshot of the repository. From that snapshot, set `GRAPHIFY_BACKEND=none` in the process environment and run `graphify extract . --code-only`. Query the generated graph from the same snapshot, using a focused symbol and a shallow traversal. Keep generated files local. Exclude secrets, databases, user media and production data from the snapshot. Refresh after changes that affect the area being investigated.

Graphify is development tooling. If a product feature needs a graph, first define the user-facing benefit, data boundary and update costs, then evaluate it separately.
