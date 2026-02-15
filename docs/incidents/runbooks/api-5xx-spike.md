# Runbook: API 5xx Spike

1. Confirm scope (all endpoints vs subset).
2. Check latest deploy marker.
3. Inspect dependency health (DB/queue/cache/auth).
4. If release-correlated and severe, rollback.
5. Verify recovery using smoke tests.
