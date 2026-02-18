# Neo4j Local Scaffold (Reputation Rail v1)

This scaffold is for local development only and is additive to the existing infra setup.

## Files

- `docker-compose.neo4j.yml` - local Neo4j service for Reputation Rail experiments
- `.env.neo4j.example` - local env template for compose variables

## Run locally

```bash
cd infra/neo4j
cp .env.neo4j.example .env.neo4j.local

docker compose --env-file .env.neo4j.local -f docker-compose.neo4j.yml up -d
```

Neo4j endpoints after startup:

- Browser UI: `http://localhost:7474`
- Bolt URI: `bolt://localhost:7687`

## Connect from issuer service scaffold

Set these issuer env vars in local/dev environments:

- `REPUTATION_GRAPH_ENABLED=true`
- `REPUTATION_GRAPH_URI=bolt://localhost:7687`
- `REPUTATION_GRAPH_USERNAME=neo4j`
- `REPUTATION_GRAPH_PASSWORD=<password from NEO4J_AUTH>`
- `REPUTATION_GRAPH_DATABASE=neo4j`

### Safety/readiness guardrails (issuer)

The issuer reputation-graph scaffold now performs explicit config guardrails at startup:

- If `REPUTATION_GRAPH_ENABLED=true` and `REPUTATION_GRAPH_PASSWORD` is missing/empty, startup config parsing throws.
- If enabled and URI is not a Neo4j-compatible scheme (`bolt://` or `neo4j://`), config parsing throws.
- If graph variables are set while `REPUTATION_GRAPH_ENABLED` is not `true`, issuer logs an explicit warning and keeps no-op mode.
- If enabled but URI/database/username are omitted, issuer logs warnings when applying local defaults.

### Non-production defaults (explicit)

These defaults exist for local scaffold convenience and are **not production-safe**:

- URI default: `bolt://localhost:7687`
- Username default: `neo4j`
- Database default: `neo4j`

Use explicit, environment-specific values in staging/production and a managed secret for `REPUTATION_GRAPH_PASSWORD`.

Stop and cleanup:

```bash
docker compose --env-file .env.neo4j.local -f docker-compose.neo4j.yml down
```
