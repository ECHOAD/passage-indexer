# Deployment Workflow: Testnet → Mainnet

## Philosophy

- **Testnet**: Bleeding edge - new features, experimental
- **Mainnet**: Stable - only tested and stable code

## Same Dockerfile, Different Code States

Both environments use the same `docker/Dockerfile.node`, but build from different commits/branches.

```
testnet:testnet  ← build from 'main' branch (latest features)
mainnet:mainnet  ← build from tag 'v1.2.3' or 'stable' branch
```

## Complete Workflow

### 1. New Feature Development

```bash
# Create feature branch
git checkout -b feature/reprocess-blocks

# Develop and commit
git add .
git commit -m "Add block reprocessing script"
git push origin feature/reprocess-blocks

# Create PR and merge to main
```

### 2. Deploy to Testnet (Testing)

```bash
# Make sure you're on main with latest code
git checkout main
git pull origin main

# Build testnet image
docker-compose -f docker-compose.testnet.build.yml build

# Deploy to testnet
docker-compose -f docker-compose.testnet.build.yml up -d

# Check logs
docker-compose -f docker-compose.testnet.build.yml logs -f indexer

# Monitor for days/weeks
# - Check for errors
# - Verify feature works
# - Test edge cases
```

### 3. Promotion to Mainnet (Stable Release)

Once testnet has been stable for a while:

```bash
# Option A: Release tag (recommended)
git checkout main
git tag -a v1.3.0 -m "Release v1.3.0: Add block reprocessing"
git push origin v1.3.0

# Option B: Stable branch
git checkout -b stable/v1.3
git push origin stable/v1.3

# Build mainnet image (from stable tag/branch)
git checkout v1.3.0  # or stable/v1.3
docker-compose -f docker-compose.build.yml build

# IMPORTANT: Backup before deploy
# pg_dump ...

# Deploy to mainnet
docker-compose -f docker-compose.build.yml up -d

# Verify
docker-compose -f docker-compose.build.yml logs -f indexer
```

## Common Use Cases

### Case 1: Testnet has bug, need quick fix

```bash
# Fix the bug on main
git checkout main
git pull
# ... fix bug ...
git commit -m "Fix critical bug"
git push origin main

# Rebuild only testnet
docker-compose -f docker-compose.testnet.build.yml build
docker-compose -f docker-compose.testnet.build.yml up -d

# Mainnet is NOT affected (still using old image)
```

### Case 2: Mainnet has bug, need urgent hotfix

```bash
# Hotfix from mainnet tag
git checkout v1.3.0
git checkout -b hotfix/critical-fix

# Fix the bug
# ... fix bug ...
git commit -m "Hotfix: critical bug"

# Merge to main
git checkout main
git merge hotfix/critical-fix

# New tag for mainnet
git tag -a v1.3.1 -m "Hotfix v1.3.1"
git push origin v1.3.1

# Rebuild mainnet
git checkout v1.3.1
docker-compose -f docker-compose.build.yml build
docker-compose -f docker-compose.build.yml up -d

# Also update testnet
git checkout main
docker-compose -f docker-compose.testnet.build.yml build
docker-compose -f docker-compose.testnet.build.yml up -d
```

### Case 3: Testnet with new feature, mainnet stable

```bash
# Testnet running with new feature
git checkout main
docker-compose -f docker-compose.testnet.build.yml build
docker-compose -f docker-compose.testnet.build.yml up -d

# Mainnet running with previous version (stable)
git checkout v1.2.9  # old but stable version
docker-compose -f docker-compose.build.yml build
docker-compose -f docker-compose.build.yml up -d

# Both run simultaneously without conflict
```

## Image Verification

```bash
# Check which image each container uses
docker ps --format "table {{.Names}}\t{{.Image}}\t{{.Status}}"

# Expected output:
# NAMES               IMAGE                      STATUS
# indexer-testnet     passage-indexer:testnet    Up 2 days
# indexer-mainnet     passage-indexer:mainnet    Up 30 days
```

## Branch Strategy

### Option 1: Simple (Recommended for small teams)

```
main          ← Active development (testnet uses this)
tags (v1.x)   ← Stable releases (mainnet uses this)
```

### Option 2: GitFlow (For larger teams)

```
develop       ← Active development (testnet uses this)
main/master   ← Stable code
release/*     ← Release preparation
hotfix/*      ← Urgent fixes
tags (v1.x)   ← Official releases (mainnet uses this)
```

## Deployment Checklist

### Deploy to Testnet (Bleeding Edge)
- [ ] Code merged to main
- [ ] Tests passing (if any)
- [ ] `git checkout main && git pull`
- [ ] `docker-compose -f docker-compose.testnet.build.yml build`
- [ ] `docker-compose -f docker-compose.testnet.build.yml up -d`
- [ ] Check logs for errors
- [ ] Monitor for at least 1-2 weeks

### Deploy to Mainnet (Stable)
- [ ] Testnet has been stable for X time
- [ ] Create release tag: `git tag -a v1.x.x -m "Release v1.x.x"`
- [ ] Backup mainnet database
- [ ] Notify users (if downtime expected)
- [ ] `git checkout v1.x.x`
- [ ] `docker-compose -f docker-compose.build.yml build`
- [ ] `docker-compose -f docker-compose.build.yml up -d`
- [ ] Carefully check logs
- [ ] Monitor metrics for 24-48h
- [ ] Rollback plan ready

## Rollback

### Rollback Mainnet to previous version

```bash
# List available tags
git tag -l

# Checkout previous version
git checkout v1.2.9  # version that was working

# Rebuild with old version
docker-compose -f docker-compose.build.yml build

# Restore DB backup (if needed)
# psql ...

# Deploy previous version
docker-compose -f docker-compose.build.yml up -d

# Verify
docker-compose -f docker-compose.build.yml logs -f
```

## CI/CD (Optional - Automation)

If you want to automate this in the future:

```yaml
# .github/workflows/deploy-testnet.yml
name: Deploy to Testnet
on:
  push:
    branches: [main]

jobs:
  deploy:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v2
      - name: Build testnet image
        run: docker-compose -f docker-compose.testnet.build.yml build
      - name: Deploy to testnet server
        run: |
          # SSH to server and update
          ssh user@testnet-server "cd /app && git pull && docker-compose -f docker-compose.testnet.build.yml up -d"
```

```yaml
# .github/workflows/deploy-mainnet.yml
name: Deploy to Mainnet
on:
  push:
    tags:
      - 'v*'

jobs:
  deploy:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v2
      - name: Build mainnet image
        run: docker-compose -f docker-compose.build.yml build
      - name: Deploy to mainnet server
        run: |
          # SSH to server and update (with more validations)
          ssh user@mainnet-server "cd /app && git fetch --tags && git checkout ${{ github.ref_name }} && docker-compose -f docker-compose.build.yml up -d"
```

## Summary

✅ **Same Dockerfile**: Both environments use the same one
✅ **Different tags**: `testnet` and `mainnet` keep images separate
✅ **Different commits**: Testnet uses bleeding edge, mainnet uses stable
✅ **No conflicts**: Independent builds
✅ **Clear workflow**: Develop → Testnet → Stabilize → Mainnet

This is the industry-standard workflow for managing multiple environments. 🚀
