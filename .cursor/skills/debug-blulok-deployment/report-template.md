# Deployment investigation report

**Deployment:** {label} (`{env}`)  
**Generated:** {iso_timestamp}

## Summary

{one_paragraph}

## Findings

- **{severity}** (`{code}`): {message}

## Evidence

{api_or_sql_output_summary}

## Route pass (when relevant)

| Field | Value |
|-------|--------|
| sub | `{user_id}` |
| user_role | `{role}` |
| jti | `{jti}` |
| issued / expires | {iat_iso} / {exp_iso} |
| aud | {aud_list_or_empty} |

Expected aud today: `{lock:serial}` / `{shared_key:owner:serial}`

Issuance log: `GET /api/v1/route-passes/users/{user_id}` (metadata only; JWT is not stored).

## Recommended actions

1. {action}
2. {action}

## References

- Skill: `.cursor/skills/debug-blulok-deployment/SKILL.md`
- API base: `{api_base}`
