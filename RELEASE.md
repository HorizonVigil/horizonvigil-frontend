# Frontend Release Runbook

## Production deployment

1. Merge only after typecheck, lint, unit/component tests, unauthenticated
   browser smoke tests and security checks pass.
2. A push to `main` builds the immutable frontend image and deploys it to the
   `frontend` Cloud Run service in `us-central1`.
3. The post-deploy authenticated suite signs into a dedicated production smoke
   account. If the account has no tenant, setup creates the single stable
   `HorizonVigil Production Smoke` organization before saving browser state.
4. The suite verifies Overview, AI Intelligence and evidence coverage, Cloud
   Accounts, Resources, Monitoring, FinOps, Cloud Security, Alerts, Reports and
   the AWS cluster console.
5. A release is successful only when the deployed revision is ready, receives
   100% traffic, and the post-deploy suite passes.

The smoke account must remain dedicated to automation, have MFA disabled, and
must not own customer data or real cloud credentials.

## Rollback

Rollback when login or tenant bootstrap fails, a key route hits the application
error boundary, AI Intelligence cannot load its live workspace, or the new
revision materially regresses frontend errors or latency.

```sh
gcloud run services update-traffic frontend \
  --project cloudops360 \
  --region us-central1 \
  --to-revisions PREVIOUS_READY_REVISION=100
```

After rollback, rerun the `Go-Live Smoke Test` workflow against production and
confirm AWS evidence and AI Intelligence still load for a signed-in tenant.
