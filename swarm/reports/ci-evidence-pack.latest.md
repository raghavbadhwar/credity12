# CI Evidence Pack (Hosted)

Generated: 14 Feb 2026, 8:49:43 pm (IST)

## Release metadata
- Commit SHA: testsha
- Release ref: refs/heads/release/test

## Hosted workflow links
- quality-gates-ci: https://github.com/org/repo/actions/runs/1
- contract-security-ci: https://github.com/org/repo/actions/runs/2
- launch-gate: https://github.com/org/repo/actions/runs/3

## Artifact checklist
- [ ] quality-gates-evidence-<run_id> artifact downloaded/linked
- [ ] contract-security-evidence-<run_id> artifact downloaded/linked
- [ ] launch-gate-evidence-<run_id> artifact downloaded/linked

## GO/NO-GO mapping (S28)
- P0-03 Cross-service quality gates pass
  - Evidence: quality-gates-ci run + launch-gate run
  - Status: [ ] DONE [ ] PARTIAL [ ] OPEN [ ] BLOCKED
- P0-04 CI release workflow validation on GitHub Actions
  - Evidence: quality-gates-ci green run URL + artifact
  - Status: [ ] DONE [ ] PARTIAL [ ] OPEN [ ] BLOCKED
- P0-05 Security high/critical sweep
  - Evidence: dependency-security + contracts-security job results from quality-gates + contract-security-ci
  - Status: [ ] DONE [ ] PARTIAL [ ] OPEN [ ] BLOCKED

## Notes
- Paste this section into swarm/reports/credity-s28-release-board.md Evidence/Notes column.
- For final release board decision, mark GO only when all P0 rows are DONE.
