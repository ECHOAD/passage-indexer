import express from "express";
import packageJson from "../package.json";
import { initDatabase } from "./db/buildDatabase";
import { syncPriceHistory } from "./db/priceHistoryProvider";
import { getSyncStatus, syncBlocks } from "./chain/chainSync";
import { activeChain, executionMode, ExecutionMode, isProd } from "./shared/constants";
import * as Sentry from "@sentry/node";
import { statsProcessor } from "./chain/statsProcessor";
import { Scheduler } from "./scheduler";
import { fetchValidatorKeybaseInfos } from "./db/keybaseProvider";
import { bytesToHumanReadableSize } from "./shared/utils/files";
import { getCacheSize } from "./chain/dataStore";
import { env } from "./shared/utils/env";
import { nodeAccessor } from "./chain/nodeAccessor";
import { addressBalanceMonitor } from "./monitors";
import { sleep } from "./shared/utils/delay";
import { createStakingSnapshots } from "./schedulers/stakingSnapshotScheduler";

const app = express();

const { PORT = 3079 } = process.env;

Sentry.init({
  dsn: env.SentryDSN,
  environment: env.NODE_ENV,
  serverName: env.SentryServerName,
  release: packageJson.version,
  enabled: isProd,
  integrations: [],
  ignoreErrors: ["[NodeAccessError]"],

  // Set tracesSampleRate to 1.0 to capture 100%
  // of transactions for performance monitoring.
  // We recommend adjusting this value in production
  tracesSampleRate: 0.01
});

Sentry.setTag("chain", env.ActiveChain);

const scheduler = new Scheduler({
  healthchecksEnabled: env.HealthchecksEnabled === "true",
  errorHandler: (task, error) => {
    console.error(`Task "${task.name}" failed: `, error);
    Sentry.captureException(error, { tags: { task: task.name } });
  }
});

app.get("/status", async (req, res) => {
  try {
    const version = packageJson.version;
    const tasksStatus = scheduler.getTasksStatus();
    const syncStatus = await getSyncStatus();
    const cacheSize = await getCacheSize();
    const memoryInBytes = process.memoryUsage();
    const activeNodeCount = nodeAccessor.getActiveNodeCount();
    const memory = {
      rss: bytesToHumanReadableSize(memoryInBytes.rss),
      heapTotal: bytesToHumanReadableSize(memoryInBytes.heapTotal),
      heapUsed: bytesToHumanReadableSize(memoryInBytes.heapUsed),
      external: bytesToHumanReadableSize(memoryInBytes.external)
    };

    res.send({ version, ...cacheSize, memory, activeNodeCount, tasks: tasksStatus, sync: syncStatus });
  } catch (err) {
    Sentry.captureException(err);
    res.status(500).send("An error occured");
  }
});

app.get("/nodes", async (req, res) => {
  try {
    const nodeStatus = nodeAccessor.getNodeStatus();
    res.send(nodeStatus);
  } catch (err) {
    Sentry.captureException(err);
    res.status(500).send("An error occured");
  }
});

function startScheduler() {
  scheduler.registerTask("Sync Blocks", syncBlocks, "7 seconds", true, {
    id: env.HealthChecks_SyncBlocks!
  });
  scheduler.registerTask("Sync Price History", syncPriceHistory, "1 hour", true, {
    id: env.HealthChecks_SyncAKTPriceHistory!,
    measureDuration: true
  });
  scheduler.registerTask("Address Balance Monitor", () => addressBalanceMonitor.run(), "10 minutes");
  scheduler.registerTask("Create Staking Snapshots", createStakingSnapshots, "1 hour", false);

  if (!activeChain.startHeight) {
    scheduler.registerTask("Sync Keybase Info", fetchValidatorKeybaseInfos, "6 hours", true, {
      id: env.HealthChecks_SyncKeybaseInfo!,
      measureDuration: true
    });
  }

  scheduler.start();
}

/**
 * Initialize database schema
 * Populate db
 * Create backups per version
 * Load from backup if exists for current version
 */
async function initApp() {
  try {
    if (env.Standby) {
      console.log("Standby mode enabled. Doing nothing.");
      while (true) {
        await sleep(5_000);
      }
    }

    await initDatabase();
    await nodeAccessor.loadNodeStatus();

    if (executionMode === ExecutionMode.RebuildStats) {
      //await statsProcessor.rebuildStatsTables();
    } else if (executionMode === ExecutionMode.RebuildAll) {
      console.time("Rebuilding all");
      await syncBlocks();
      console.timeEnd("Rebuilding all");
    } else if (executionMode === ExecutionMode.SyncOnly) {
      startScheduler();
    } else {
      throw "Invalid execution mode";
    }

    app.listen(PORT, () => {
      console.log("server started at http://localhost:" + PORT);
    });
  } catch (err) {
    console.error("Error while initializing app", err);

    Sentry.captureException(err);
  }
}

initApp();

export default app;
