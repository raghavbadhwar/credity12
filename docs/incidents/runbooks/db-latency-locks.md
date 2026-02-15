# Runbook: DB Latency / Locks

1. Check active connections and long-running queries.
2. Identify lock blockers and kill only safe sessions.
3. Scale read replicas or reduce load if needed.
4. Enable protective throttling on heavy endpoints.
5. Verify latency recovery.
