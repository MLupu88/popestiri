# M0.3B — Social Intake

Social Intake is a manual editorial inbox for public Facebook, TikTok and YouTube links.
It is available at `/admin/social-intake` after operator authentication.

## Workflow

- An operator submits an HTTPS link, the source of the tip, a short description of the claim and why it may deserve investigation.
- The URL is validated against the supported platform hostnames and the exact submitted URL is retained.
- One intake item is created per canonical URL. Re-submitting the same URL does not create another item; each submission is recorded in the item's provenance history and in `audit_events`.
- Operators can filter the list by platform and editorial status, open an item's detail page, add manually confirmed metadata, and change its workflow status.
- Status is workflow state only (`Nouă`, `În evaluare`, `De investigat`, `Închisă`). It is not a truth verdict and does not publish anything.

## Metadata and access limits

This milestone does not fetch social pages, scrape feeds, call platform APIs, or attempt transcript extraction. Metadata starts empty. The detail page permits explicit manual entry of a confirmed title, author, publication date and notes; those values are marked as manually confirmed.

The application never invents engagement numbers, transcript content, post text or author details. The original link remains available when a platform restricts access. Future metadata connectors must use an approved, legally accessible mechanism and preserve the same provenance rules.

## Migration and checks

`0002_social_intake.sql` creates the intake and provenance tables, platform/status constraints, indexes and metadata access status. Apply all migrations with:

```sh
pnpm db:migrate
```

The admin still uses the existing operator session cookie, Origin validation and session-bound CSRF token. URL and text inputs are length-limited, parameterized in SQL, escaped in HTML, and social links are restricted to HTTPS without credentials or custom ports.
