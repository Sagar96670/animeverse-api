const database = require("../storage/database");
const { importAnimeVerse } = require("./importer");

const SYNC_INTERVAL = 30 * 60 * 1000;

let syncRunning = false;
let lastSyncStarted = null;
let lastSyncFinished = null;
let lastSyncStatus = "never";
let lastSyncError = null;

async function runSync() {
  if (syncRunning) {
    return {
      status: false,
      message: "Sync already running"
    };
  }

  syncRunning = true;
  lastSyncStarted = new Date().toISOString();
  lastSyncStatus = "running";
  lastSyncError = null;

  console.log("[SYNC] AnimeVerse sync started:", lastSyncStarted);

  try {
    const result = await importAnimeVerse();

    lastSyncStatus = "success";
    lastSyncFinished = new Date().toISOString();

    console.log("[SYNC] Completed:", JSON.stringify(result));

    return result;
  } catch (error) {
    lastSyncStatus = "failed";
    lastSyncFinished = new Date().toISOString();
    lastSyncError = error.message;

    try {
      const db = database.read();

      db.sync_history = db.sync_history || [];

      db.sync_history.unshift({
        id: Date.now(),
        source: "AnimeVerse",
        status: "failed",
        error: error.message,
        timestamp: lastSyncFinished
      });

      db.sync_history = db.sync_history.slice(0, 100);

      database.write(db);
    } catch (historyError) {
      console.error("[SYNC] History save failed:", historyError.message);
    }

    console.error("[SYNC] Failed:", error.message);

    throw error;
  } finally {
    syncRunning = false;
  }
}

function getStatus() {
  return {
    running: syncRunning,
    intervalMinutes: 30,
    lastSyncStarted,
    lastSyncFinished,
    lastSyncStatus,
    lastSyncError
  };
}

function start() {
  console.log("[SYNC] Automatic sync enabled: every 30 minutes");

  // Initial sync when server starts
  runSync().catch(error => {
    console.error("[SYNC] Initial sync failed:", error.message);
  });

  // Recurring sync
  setInterval(() => {
    runSync().catch(error => {
      console.error("[SYNC] Scheduled sync failed:", error.message);
    });
  }, SYNC_INTERVAL);
}

module.exports = {
  start,
  runSync,
  getStatus
};
