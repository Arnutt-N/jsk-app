# PRP — shared taxonomy (dedicated tables, user chose Candidate B)

## Files
- NEW `backend/app/models/taxonomy.py` (TaxonomyCategory/TaxonomyTopic, one module owns both)
- NEW alembic revision (create 2 tables + frozen TOPIC_OPTIONS seed, idempotent; downgrade drops both)
- NEW `backend/app/schemas/taxonomy.py` (TaxonomyMapResponse RootModel, TopicRead/CategoryRead/AdminTaxonomyRead, Create/Update DTOs, from_attributes)
- NEW `backend/app/services/taxonomy_service.py` (sole owner: get_taxonomy_map/get_admin_taxonomy/create/update/delete + invalidate; 60s versioned cache; validation at boundary)
- NEW `backend/app/api/v1/endpoints/taxonomy.py` (public GET, no auth) + mount in `api.py`
- NEW `backend/app/api/v1/endpoints/admin_taxonomy.py` (GET + 6 mutations, get_current_admin, 404/409/422)
- NEW `backend/tests/test_taxonomy.py` (seed equality authoring-time, CRUD matrix, public shape)
- NEW `frontend/app/admin/taxonomy/page.tsx` (server gate) + `components/admin/TaxonomyEditor.tsx` (client) + `hooks/useTaxonomyAdmin.ts`

## Data shape first (principle-model-the-domain)
Two tables encode exactly-two-levels (no parent_id/discriminator). Uniqueness in schema (category unique; topic unique per category; shared อื่นๆ allowed across categories). sort_order explicit; is_active soft-hide. History = snapshot text at creation, renames prospective-only, no FK.

## Units (each green before next)
1. Migration + seed + equality test (upgrade/downgrade on dev DB).
2. Models/schemas/service + unit tests (CRUD, 409s, cache invalidate, empty→{}).
3. Public + admin endpoints + endpoint tests (auth gates, error contract).
4. Admin UI + editor test; LIFF fallback untouched (existing tests).

## Boundaries
Validate in service (trim/non-empty/uniqueness→409); endpoints thin (auth + status mapping). Never re-export ORM details. Frontend gets domain types, not wire JSON.

## Validation
- `cd backend && python -m pytest tests/test_taxonomy.py`
- `cd frontend && npm run test:unit -- taxonomy` (new editor tests) + build
- Manual: seed → GET map; rename → old requests unchanged; deactivate → hidden from public map.

## Rollback
Each unit own commit. Migration downgrade drops tables (data loss accepted pre-launch of feature; rows only admin taxonomy).
