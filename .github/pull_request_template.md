## What and why

<!-- One or two sentences. -->

## Promotion

- [ ] `feature/*` or `release/*` → `development`, or `development` → `staging`, or `staging` → `main` (the **Promotion rules** check enforces this)
- [ ] **Test** is green on this PR
- [ ] Schema change? A new migration with `up` and `down`, backward-compatible with the code currently deployed

## After merge

- [ ] Deploy job green for the target environment, and `/healthz` shows the new commit
