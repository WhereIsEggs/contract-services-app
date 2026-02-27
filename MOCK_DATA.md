# Mock Data Seeder (Reports & Dashboard)

This project includes a synthetic data seeder for testing:
- Dashboard interactive analytics
- Reports page KPIs
- CSV exports (summary + detailed)

It creates a realistic mix of:
- Completed / In Progress / New requests
- Early + late completions
- Profit/loss variance through quoted vs actual internal costs
- Open late services for Late Jobs logic

## Required Environment Variables

Set these in your shell before running:

- `NEXT_PUBLIC_SUPABASE_URL`
- `SUPABASE_SERVICE_ROLE_KEY`

Optional (recommended if you have multiple users):

- `MOCK_USER_EMAIL` (seed rows owned by this user)
- `MOCK_USER_ID` (explicit auth user id; overrides `MOCK_USER_EMAIL`)

If neither is set, the seeder assigns `created_by` to the first auth user it finds.

Use your **Project API URL** for `NEXT_PUBLIC_SUPABASE_URL`, for example:

`https://abcdefghijklmnop.supabase.co`

Do **not** use the Supabase dashboard/studio URL (anything with `/dashboard` or `supabase.com/dashboard`).

> Use service role key only in local/dev or controlled admin environment.

## Commands

- Seed additional mock data:

```bash
npm run seed:mock
```

- Reset old mock records and reseed fresh:

```bash
npm run seed:mock:reset
```

## How mock rows are identified

Requests created by the seeder use `project_details` starting with:

`[MOCK]`

Reset mode removes those mock requests plus their related rows in:
- `request_services`
- `service_actuals`
- linked `quotes`
- linked `quote_items`

## Notes

- The seeder uses your current `cost_settings` rates when available.
- If you deleted all test data, run `seed:mock:reset` once for a clean baseline.
- If your Supabase RLS/policies differ, service role is required for guaranteed inserts.
