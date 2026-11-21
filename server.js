require("dotenv").config();

const express = require("express");
const cors = require("cors");
const database = require("./src/storage/database");
const { fetchAnimeVerseData } = require("./src/services/animeverse");
const { importAnimeVerse } = require("./src/services/importer");

const app = express();

app.use(cors());
app.use(express.json());

database.initialize();

app.get("/", (req, res) => {
  res.json({
    status: true,
    project: "animeverse-api",
    source: "AnimeVerse",
    message: "AnimeVerse API is running"
  });
});

app.get("/api/health", (req, res) => {
  res.json({
    status: true,
    project: "animeverse-api",
    database: "connected",
    uptime: process.uptime(),
    timestamp: new Date().toISOString()
  });
});

app.get("/api/database", (req, res) => {
  const db = database.read();

  res.json({
    status: true,
    anime: db.anime.length,
    movies: db.movies.length,
    episodeGroups: db.episodes.length,
    updated_at: db.updated_at
  });
});



function getAnimeById(id, db) {
  return db.anime.find(a =>
    String(a.id) === String(id) ||
    a.slug === String(id)
  );
}

app.get("/api/anime", (req, res) => {
  const db = database.read();
  let list = db.anime;

  const search = String(req.query.search || "").trim().toLowerCase();

  if (search) {
    list = list.filter(a =>
      String(a.title || "").toLowerCase().includes(search)
    );
  }

  const page = Math.max(1, Number(req.query.page) || 1);
  const limit = Math.min(100, Math.max(1, Number(req.query.limit) || 50));
  const start = (page - 1) * limit;

  res.json({
    status: true,
    total: list.length,
    page,
    limit,
    totalPages: Math.ceil(list.length / limit),
    data: list.slice(start, start + limit)
  });
});

app.get("/api/search", (req, res) => {
  const db = database.read();
  const q = String(req.query.q || "").trim().toLowerCase();

  if (!q) {
    return res.status(400).json({
      status: false,
      message: "Search query q is required"
    });
  }

  const anime = db.anime.filter(a =>
    String(a.title || "").toLowerCase().includes(q) ||
    String(a.slug || "").toLowerCase().includes(q) ||
    String(a.synopsis || "").toLowerCase().includes(q)
  );

  const latest = db.movies.filter(a =>
    String(a.title || "").toLowerCase().includes(q) ||
    String(a.slug || "").toLowerCase().includes(q) ||
    String(a.synopsis || "").toLowerCase().includes(q)
  );

  res.json({
    status: true,
    query: q,
    anime: {
      total: anime.length,
      data: anime
    },
    latest: {
      total: latest.length,
      data: latest
    }
  });
});

app.get("/api/latest", (req, res) => {
  const db = database.read();

  const page = Math.max(1, Number(req.query.page) || 1);
  const limit = Math.min(100, Math.max(1, Number(req.query.limit) || 50));
  const start = (page - 1) * limit;

  res.json({
    status: true,
    total: db.movies.length,
    page,
    limit,
    totalPages: Math.ceil(db.movies.length / limit),
    data: db.movies.slice(start, start + limit)
  });
});

app.get("/api/anime/:id/seasons", (req, res) => {
  const db = database.read();
  const anime = getAnimeById(req.params.id, db);

  if (!anime) {
    return res.status(404).json({
      status: false,
      message: "Anime not found"
    });
  }

  const groups = db.episodes.filter(g =>
    String(g.anime_id) === String(anime.id) ||
    g.anime_slug === anime.slug
  );

  const seasons = groups.map(g => ({
    season: g.season,
    season_key: g.season_key,
    episode_count: g.episodes.length
  })).sort((a, b) => a.season - b.season);

  res.json({
    status: true,
    anime: {
      id: anime.id,
      title: anime.title,
      slug: anime.slug
    },
    totalSeasons: seasons.length,
    data: seasons
  });
});

app.get("/api/anime/:id/episodes", (req, res) => {
  const db = database.read();
  const anime = getAnimeById(req.params.id, db);

  if (!anime) {
    return res.status(404).json({
      status: false,
      message: "Anime not found"
    });
  }

  const season = Number(req.query.season || 1);

  const group = db.episodes.find(g =>
    (String(g.anime_id) === String(anime.id) ||
     g.anime_slug === anime.slug) &&
    Number(g.season) === season
  );

  if (!group) {
    return res.json({
      status: true,
      anime: anime.title,
      season,
      totalEpisodes: 0,
      data: []
    });
  }

  res.json({
    status: true,
    anime: anime.title,
    season,
    totalEpisodes: group.episodes.length,
    data: group.episodes
  });
});

app.get("/api/anime/:id", (req, res) => {
  const db = database.read();
  const anime = getAnimeById(req.params.id, db);

  if (!anime) {
    return res.status(404).json({
      status: false,
      message: "Anime not found"
    });
  }

  const groups = db.episodes.filter(g =>
    String(g.anime_id) === String(anime.id) ||
    g.anime_slug === anime.slug
  );

  res.json({
    status: true,
    data: {
      ...anime,
      seasons: groups.map(g => ({
        season: g.season,
        episode_count: g.episodes.length
      })).sort((a, b) => a.season - b.season),
      total_seasons: groups.length,
      total_episodes: groups.reduce(
        (total, g) => total + g.episodes.length,
        0
      )
    }
  });
});

app.post("/api/sync/import", async (req, res) => {
  try {
    const result = await importAnimeVerse();
    res.json({
      status: true,
      message: "AnimeVerse import completed",
      ...result
    });
  } catch (error) {
    res.status(500).json({
      status: false,
      message: "AnimeVerse import failed",
      error: error.message
    });
  }
});

app.get("/api/source/check", async (req, res) => {
  try {
    const data = await fetchAnimeVerseData();

    const counts = {};

    for (const [key, value] of Object.entries(data || {})) {
      counts[key] = Array.isArray(value)
        ? value.length
        : value && typeof value === "object"
          ? Object.keys(value).length
          : value === null
            ? 0
            : 1;
    }

    res.json({
      status: true,
      source: "AnimeVerse",
      connected: true,
      nodes: counts,
      timestamp: new Date().toISOString()
    });
  } catch (error) {
    res.status(502).json({
      status: false,
      source: "AnimeVerse",
      connected: false,
      error: error.message
    });
  }
});

const PORT = process.env.PORT || 3000;

app.listen(PORT, () => {
  console.log("================================");
  console.log(" AnimeVerse API");
  console.log("================================");
  console.log("Port:", PORT);
  console.log("Database:", database.DB_FILE);
  console.log("Source: AnimeVerse");
  console.log("================================");
});
