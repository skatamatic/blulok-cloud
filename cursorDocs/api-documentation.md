# API documentation (OpenAPI / Swagger)

Interactive API documentation is generated from Joi validation schemas registered alongside Express routes. The spec stays in sync with route code via CI drift checks.

## Local development

1. Start the backend (`npm run dev` in `backend/`).
2. Open **http://localhost:3000/api/docs** (Swagger UI).
3. Raw spec: **http://localhost:3000/api/openapi.json**

Swagger UI is **on by default** at `/api/docs` in all environments (including production). Set `ENABLE_OPENAPI_DOCS=false` to disable. The raw spec at `/api/openapi.json` is always served when the backend image includes `dist/openapi/generated.json` (regenerated on every Docker build).

## Regenerate the spec

```bash
cd backend
npm run openapi:generate   # writes openapi/generated.json
npm run openapi:check      # regenerate + fail if git diff
```

Commit `backend/openapi/generated.json` whenever routes or schemas change.

## Adding a new route

Use `registerGet`, `registerPost`, etc. from `@/openapi/register-route` instead of `router.get`:

```typescript
import { registerGet } from '@/openapi/register-route';
import { myQuerySchema } from '@/schemas/my-domain.schemas';

registerGet(
  router,
  '/items',
  {
    openApiPath: '/api/v1/items',
    tags: ['MyTag'],
    summary: 'List items',
    security: 'bearer',
    query: myQuerySchema,
    responses: { 200: myListResponseSchema },
  },
  authenticateToken,
  asyncHandler(handler),
);
```

- Put reusable Joi schemas in `backend/src/schemas/`.
- Use `{param}` syntax in `openApiPath`, not `:param`.
- Set `security: 'none'` for public routes (login, health).
- Standard JSON envelope: `{ success: true, ... }` / `{ success: false, message }`.

## Tag taxonomy

| Tag | Audience |
|-----|----------|
| Auth | Login, tokens, invites |
| App | Mobile app / manager mode |
| Facilities | Facilities and provisioning |
| Units, Devices | Inventory and commissioning |
| Gateway / GatewayInternal | Dashboard and firmware |
| Admin | Dev admin tooling |
| FMS | Facility management system |
| BluDesign | 3D editor |
| System | Health, settings |

Optional: tag a Joi schema with a stable shared name (reused across routes):

```typescript
export const mySchema = Joi.object({ ... }).meta({ openapiName: 'MySharedRequest' });
```

Shared envelopes use `ErrorEnvelope` and `SuccessEnvelope` automatically.

## Related docs

- [App lock/unit assignment APIs](./app-lock-unit-assignment-apis.md)
- [Facility provisioning app guide](./facility-provisioning-app-developer-guide.md)
