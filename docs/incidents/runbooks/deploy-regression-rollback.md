# Runbook: Deploy Regression / Rollback

1. Freeze further deploys.
2. Compare baseline vs new release metrics.
3. Trigger rollback to last stable artifact.
4. Validate critical journey smoke tests.
5. Open postmortem and remediation ticket.
