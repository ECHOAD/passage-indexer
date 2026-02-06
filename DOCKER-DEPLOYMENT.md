# Docker Deployment Guide

## Problem Solved
This project has two environments (mainnet and testnet) that can run simultaneously on the same machine. To avoid Docker image conflicts, each environment uses **separate tags**.

## Image Configuration

### Mainnet (docker-compose.build.yml)
- API: `passage-api:mainnet`
- Indexer: `passage-indexer:mainnet`

### Testnet (docker-compose.testnet.build.yml)
- API: `passage-api:testnet`
- Indexer: `passage-indexer:testnet`

## Usage Commands

### Mainnet

```bash
# Build images
docker-compose -f docker-compose.build.yml build

# Start services
docker-compose -f docker-compose.build.yml up -d

# View logs
docker-compose -f docker-compose.build.yml logs -f

# Stop services
docker-compose -f docker-compose.build.yml down
```

### Testnet

```bash
# Build images
docker-compose -f docker-compose.testnet.build.yml build

# Start services
docker-compose -f docker-compose.testnet.build.yml up -d

# View logs
docker-compose -f docker-compose.testnet.build.yml logs -f indexer

# Stop services
docker-compose -f docker-compose.testnet.build.yml down
```

## Safe Rebuild

### Option 1: Rebuild without affecting the other environment

```bash
# Rebuild mainnet (doesn't affect testnet)
docker-compose -f docker-compose.build.yml build
docker-compose -f docker-compose.build.yml up -d

# Rebuild testnet (doesn't affect mainnet)
docker-compose -f docker-compose.testnet.build.yml build
docker-compose -f docker-compose.testnet.build.yml up -d
```

### Option 2: Rebuild with minimal downtime

```bash
# Mainnet
docker-compose -f docker-compose.build.yml build  # Build new image
docker-compose -f docker-compose.build.yml up -d  # Recreate containers with new image

# Testnet
docker-compose -f docker-compose.testnet.build.yml build
docker-compose -f docker-compose.testnet.build.yml up -d
```

### Option 3: Forced rebuild (recreate everything)

```bash
# Mainnet
docker-compose -f docker-compose.build.yml down
docker-compose -f docker-compose.build.yml build --no-cache
docker-compose -f docker-compose.build.yml up -d

# Testnet
docker-compose -f docker-compose.testnet.build.yml down
docker-compose -f docker-compose.testnet.build.yml build --no-cache
docker-compose -f docker-compose.testnet.build.yml up -d
```

## Verify Images

```bash
# View all images
docker images | grep passage

# Expected output:
# passage-api        mainnet    abc123    2 hours ago    500MB
# passage-api        testnet    def456    3 hours ago    500MB
# passage-indexer    mainnet    ghi789    2 hours ago    450MB
# passage-indexer    testnet    jkl012    3 hours ago    450MB
```

## Troubleshooting

### Problem: "Image changed but container still uses the old one"

**Solution**: Recreate containers
```bash
docker-compose -f docker-compose.build.yml up -d --force-recreate
```

### Problem: "Both environments are using the same image"

**Verify tags**:
```bash
docker ps --format "table {{.Names}}\t{{.Image}}"
```

Should show:
```
NAMES               IMAGE
indexer-mainnet     passage-indexer:mainnet
indexer-testnet     passage-indexer:testnet
```

If both show `latest`, you need to rebuild with the new tags:
```bash
docker-compose -f docker-compose.build.yml build
docker-compose -f docker-compose.testnet.build.yml build
docker-compose -f docker-compose.build.yml up -d --force-recreate
docker-compose -f docker-compose.testnet.build.yml up -d --force-recreate
```

### Problem: "Building one affects the other"

**Cause**: You're probably not using the correct `-f` flag.

**Solution**: Always specify the docker-compose file:
```bash
# ❌ INCORRECT (uses docker-compose.yml by default)
docker-compose build

# ✅ CORRECT
docker-compose -f docker-compose.build.yml build
docker-compose -f docker-compose.testnet.build.yml build
```

## Useful Commands

### View running containers
```bash
docker ps --filter "name=indexer"
docker ps --filter "name=api"
```

### View resource usage
```bash
docker stats indexer-mainnet indexer-testnet
```

### Access a container
```bash
# Mainnet
docker exec -it indexer-mainnet sh

# Testnet
docker exec -it indexer-testnet sh
```

### Clean up old images
```bash
# Remove untagged images
docker image prune

# Remove old passage images (careful!)
docker images | grep passage | grep '<none>' | awk '{print $3}' | xargs docker rmi
```

## Environment Variables (Advanced)

If you need to use a custom tag:

```bash
# Mainnet with custom tag
API_TAG=mainnet-v1.2.3 INDEXER_TAG=mainnet-v1.2.3 \
  docker-compose -f docker-compose.build.yml build

# Testnet with custom tag
API_TAG=testnet-v1.2.3 INDEXER_TAG=testnet-v1.2.3 \
  docker-compose -f docker-compose.testnet.build.yml build
```

## Deployment Checklist

### Pre-deploy
- [ ] Verify code is on correct branch
- [ ] Build the image
- [ ] Verify tag is correct (`docker images | grep passage`)

### Deploy
- [ ] Backup database (if necessary)
- [ ] Rebuild image: `docker-compose -f [file] build`
- [ ] Recreate containers: `docker-compose -f [file] up -d`
- [ ] Check logs: `docker-compose -f [file] logs -f`
- [ ] Verify indexer is processing: check latest blocks in DB

### Post-deploy
- [ ] Monitor for 5-10 minutes
- [ ] Verify no errors in logs
- [ ] Check metrics (if available)

## Complete Isolation

Environments are completely isolated:

| Aspect | Mainnet | Testnet |
|---------|---------|---------|
| API Container | api-mainnet | api-testnet |
| Indexer Container | indexer-mainnet | indexer-testnet |
| Postgres Container | db_passage_indexer | db_passage_indexer_testnet |
| API Image | passage-api:mainnet | passage-api:testnet |
| Indexer Image | passage-indexer:mainnet | passage-indexer:testnet |
| API Port | 3001 | 3002 |
| Postgres Port | 5432 | 5433 |
| Env file | .env.api / .env.indexer | .env.api / .env.indexer |
| Volumes | mainnet volumes | testnet volumes |

## Important Notes

1. **Always use the `-f` flag** to specify which docker-compose to use
2. **Tags are important**: mainnet uses `mainnet`, testnet uses `testnet`
3. **Rebuild doesn't affect the other environment** thanks to separate tags
4. **You can build both simultaneously** without conflicts
5. **Volumes are independent** - each environment has its own data
