## What and why

<!-- One or two sentences. -->

## Promotion

- [ ] `feature/*` or `release/*` → `development`, or `development` → `staging`, or `staging` → `main` (the **Promotion rules** check enforces this)
- [ ] **Test** is green on this PR
- [ ] Schema change? A new migration with `up` and `down`, backward-compatible with the code currently deployed

## After merge

- [ ] Into `development` or `staging`: **Test** green on the branch after merge (these branches are not deployed)
- [ ] Into `main`: **Deploy to production** green, and `/healthz` shows the new commit
