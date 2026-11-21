const database = require("../src/storage/database");
const { importAnimeVerse } = require("../src/services/importer");

async function main() {
  database.initialize();

  const before = database.read();

  const result = await importAnimeVerse();

  const after = database.read();

  const oldCatalog = JSON.stringify({
    anime: before.anime,
    movies: before.movies,
    episodes: before.episodes
  });

  const newCatalog = JSON.stringify({
    anime: after.anime,
    movies: after.movies,
    episodes: after.episodes
  });

  if (oldCatalog === newCatalog) {
    after.sync_history = before.sync_history || [];
    after.updated_at = before.updated_at || null;
    database.write(after);

    console.log("[AUTO-SYNC] No catalog changes. Database restored without unnecessary update.");
  } else {
    console.log("[AUTO-SYNC] Catalog changes detected. Database updated.");
  }

  console.log(JSON.stringify(result, null, 2));
}

main().catch(error => {
  console.error("[AUTO-SYNC] FAILED:", error.message);
  process.exit(1);
});
