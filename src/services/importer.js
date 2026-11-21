const { fetchAnimeVerseData } = require("./animeverse");
const database = require("../storage/database");

function slugify(text) {
  return String(text || "")
    .toLowerCase()
    .trim()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-|-$/g, "");
}

function getEpisodeNumber(key) {
  const match = String(key).match(/^E(\d+)$/i);
  return match ? Number(match[1]) : null;
}

function getSeasonNumber(key) {
  const match = String(key).match(/^S(\d+)$/i);
  return match ? Number(match[1]) : null;
}

function normalizeLinks(data = {}) {
  const result = {};

  for (const [quality, value] of Object.entries(data || {})) {
    if (!value) continue;

    if (typeof value === "string") {
      result[quality] = {
        url: value,
        download: null,
        server: null,
        timestamp: null
      };
      continue;
    }

    if (typeof value === "object") {
      result[quality] = {
        url: value.link || null,
        download: value.dl_link || null,
        server: value.server || null,
        timestamp: value.time || null
      };
    }
  }

  return result;
}

function normalizeAnimeCatalog(data = {}) {
  return Object.entries(data || {}).map(([id, item]) => ({
    id,
    title: item.title || id,
    slug: slugify(item.title || id),
    poster: item.poster || item.image || null,
    synopsis: item.synopsis || "",
    genre: item.genre || "",
    rating: item.rating ?? null,
    year: item.year ?? null,
    episode_count: item.episodes ?? 0,
    subDub: item.subDub || null,
    addedAt: item.addedAt || null,
    source: "AnimeVerse"
  }));
}

function normalizeLatestCatalog(data = {}) {
  const map = new Map();

  for (const [title, item] of Object.entries(data || {})) {
    const id = slugify(title);

    const entry = {
      id,
      title,
      poster: item.image || null,
      category: item.category || null,
      language: item.language || null,
      rating: item.rating || null,
      timestamp: item.timestamp || null,
      source: "AnimeVerse"
    };

    if (!map.has(id)) {
      map.set(id, entry);
      continue;
    }

    const old = map.get(id);

    map.set(id, {
      ...old,
      title: old.title.length >= entry.title.length ? old.title : entry.title,
      poster: old.poster || entry.poster,
      category: old.category === "suggestion" ? entry.category || old.category : old.category,
      language: old.language || entry.language,
      rating: old.rating || entry.rating,
      timestamp: old.timestamp || entry.timestamp
    });
  }

  return [...map.values()];
}
function normalizeEpisodes(
  animeCatalog,
  animeLinks = {},
  server2Links = {},
  audioTracks = {},
  subtitles = {}
) {
  const catalogBySlug = new Map(
    animeCatalog.map(anime => [anime.slug, anime])
  );

  const aliases = {
    "the-elusive-samurai": "elusive-samurai",
    "mob-psycho-100": "mob",
    "mob-phycho-100": "mob",
    "mob-pyscho-100": "mob",
    "jojos-bazzare-adventure": "jojos-bizarre-adventure",
    "ramparts-of-ice": "the-ramparts-of-ice",
    "the-ramparts-of-the-ice": "the-ramparts-of-ice",

    "hunter-x-hunter": "hunter-hunter",
    "hunter-×-hunter": "hunter-hunter",

    "mononoke-the-movie-chapter-iii--the-curse-of-the-serpent": "mononoke-the-movie-chapter-iii-the-curse-of-the-serpent",

    "steel-ball-run-jojos-bizarre-adventure": "steel-ball-run-jojo-s-bizarre-adventure",
    "steel-ball-run-jojo's-bizarre-adventure": "steel-ball-run-jojo-s-bizarre-adventure",

    "watari-kun-****-about-to-collapse": "watari-kun-about-to-collapse"
  };

  const canonical = slug => aliases[slug] || slug;

  const allSlugs = new Set([
    ...Object.keys(animeLinks || {}),
    ...Object.keys(server2Links || {}),
    ...Object.keys(audioTracks || {}),
    ...Object.keys(subtitles || {})
  ]);

  const canonicalSlugs = new Set([...allSlugs].map(canonical));
  const groups = [];

  for (const slug of canonicalSlugs) {
    const rawSlugs = [...allSlugs].filter(s => canonical(s) === slug);

    const anime =
      catalogBySlug.get(slug) ||
      rawSlugs.map(s => catalogBySlug.get(s)).find(Boolean);

    const mergeSeasons = node => {
      const result = {};

      for (const rawSlug of rawSlugs) {
        const source = node[rawSlug] || {};

        for (const [seasonKey, episodes] of Object.entries(source)) {
          if (!result[seasonKey]) result[seasonKey] = {};

          for (const [episodeKey, value] of Object.entries(episodes || {})) {
            result[seasonKey][episodeKey] = {
              ...(result[seasonKey][episodeKey] || {}),
              ...(value && typeof value === "object" && !Array.isArray(value)
                ? value
                : value)
            };
          }
        }
      }

      return result;
    };

    const primary = mergeSeasons(animeLinks || {});
    const secondary = mergeSeasons(server2Links || {});
    const audio = mergeSeasons(audioTracks || {});
    const subtitle = mergeSeasons(subtitles || {});

    const seasons = new Set([
      ...Object.keys(primary),
      ...Object.keys(secondary),
      ...Object.keys(audio),
      ...Object.keys(subtitle)
    ]);

    for (const seasonKey of seasons) {
      const seasonNumber = getSeasonNumber(seasonKey);
      if (!seasonNumber) continue;

      const episodeMap = new Map();

      const sources = [
        { data: primary[seasonKey] || {}, server: "server1" },
        { data: secondary[seasonKey] || {}, server: "server2" },
        { data: audio[seasonKey] || {}, server: "audio" },
        { data: subtitle[seasonKey] || {}, server: "subtitles" }
      ];

      for (const source of sources) {
        for (const [episodeKey, value] of Object.entries(source.data || {})) {
          const episodeNumber = getEpisodeNumber(episodeKey);
          if (!episodeNumber) continue;

          if (!episodeMap.has(episodeNumber)) {
            episodeMap.set(episodeNumber, {
              episode: episodeNumber,
              episode_key: episodeKey,
              sources: {
                server1: {},
                server2: {}
              },
              audio: {},
              subtitles: {}
            });
          }

          const episode = episodeMap.get(episodeNumber);

          if (source.server === "server1" || source.server === "server2") {
            episode.sources[source.server] = {
              ...episode.sources[source.server],
              ...normalizeLinks(value)
            };
          } else if (source.server === "audio") {
            if (value && typeof value === "object") {
              episode.audio = {
                ...episode.audio,
                ...value
              };
            }
          } else if (source.server === "subtitles") {
            if (value && typeof value === "object") {
              episode.subtitles = {
                ...episode.subtitles,
                ...value
              };
            }
          }
        }
      }

      const normalizedEpisodes = [...episodeMap.values()]
        .sort((a, b) => a.episode - b.episode);

      if (normalizedEpisodes.length) {
        groups.push({
          anime_id: anime?.id || slug,
          anime_title: anime?.title || slug,
          anime_slug: slug,
          season: seasonNumber,
          season_key: seasonKey,
          episodes: normalizedEpisodes
        });
      }
    }
  }

  return groups;
}

async function importAnimeVerse() {
  const source = await fetchAnimeVerseData();

  const hasSourceData = Object.values(source || {}).some(value => {
    if (Array.isArray(value)) return value.length > 0;
    if (value && typeof value === "object") {
      return Object.keys(value).length > 0;
    }
    return false;
  });

  if (!hasSourceData) {
    throw new Error("AnimeVerse source returned empty data; database was not modified");
  }

  const baseAnime = normalizeAnimeCatalog(source.anime);
  const movies = normalizeLatestCatalog(source.all_anime);

  // Combine anime catalog and latest catalog without duplicate slugs
  const catalogMap = new Map();

  for (const anime of baseAnime) {
    catalogMap.set(anime.slug, anime);
  }

  for (const item of movies) {
    if (!catalogMap.has(item.id)) {
      catalogMap.set(item.id, {
        id: item.id,
        title: item.title,
        slug: item.id,
        poster: item.poster,
        synopsis: "",
        genre: "",
        rating: item.rating,
        year: null,
        episode_count: 0,
        subDub: item.language,
        addedAt: item.timestamp,
        source: "AnimeVerse",
        category: item.category
      });
    }
  }

  // Merge duplicate anime catalog slugs into canonical records
  const catalogAliases = {
    "hunter-x-hunter": "hunter-hunter",
    "hunter-×-hunter": "hunter-hunter",
    "mononoke-the-movie-chapter-iii--the-curse-of-the-serpent": "mononoke-the-movie-chapter-iii-the-curse-of-the-serpent",
    "steel-ball-run-jojos-bizarre-adventure": "steel-ball-run-jojo-s-bizarre-adventure",
    "steel-ball-run-jojo's-bizarre-adventure": "steel-ball-run-jojo-s-bizarre-adventure",
    "watari-kun-****-about-to-collapse": "watari-kun-about-to-collapse"
  };

  for (const [alias, canonical] of Object.entries(catalogAliases)) {
    const oldAnime = catalogMap.get(alias);
    if (!oldAnime) continue;

    let canonicalAnime = catalogMap.get(canonical);

    if (!canonicalAnime) {
      canonicalAnime = {
        ...oldAnime,
        id: canonical,
        slug: canonical
      };
      catalogMap.set(canonical, canonicalAnime);
    } else {
      for (const key of Object.keys(oldAnime)) {
        if (
          (canonicalAnime[key] === null ||
           canonicalAnime[key] === undefined ||
           canonicalAnime[key] === "") &&
          oldAnime[key] !== null &&
          oldAnime[key] !== undefined &&
          oldAnime[key] !== ""
        ) {
          canonicalAnime[key] = oldAnime[key];
        }
      }
    }

    catalogMap.delete(alias);
  }

  let anime = [...catalogMap.values()];

  let episodes = normalizeEpisodes(
    anime,
    source.anime_links,
    source.server2_links,
    source.audio_tracks,
    source.subtitles
  );

  // Create catalog entries for episode titles missing from both catalogs
  for (const group of episodes) {
    if (!catalogMap.has(group.anime_slug)) {
      const title = group.anime_slug
        .split("-")
        .map(word => word.charAt(0).toUpperCase() + word.slice(1))
        .join(" ");

      const synthetic = {
        id: group.anime_slug,
        title,
        slug: group.anime_slug,
        poster: null,
        synopsis: "",
        genre: "",
        rating: null,
        year: null,
        episode_count: 0,
        subDub: null,
        addedAt: null,
        source: "AnimeVerse",
        category: "anime"
      };

      catalogMap.set(group.anime_slug, synthetic);
    }

    const catalogAnime = catalogMap.get(group.anime_slug);
    group.anime_id = catalogAnime.id;
    group.anime_title = catalogAnime.title;
  }

  anime = [...catalogMap.values()];

  const db = database.read();

  db.anime = anime;
  db.movies = movies;
  db.episodes = episodes;
  db.updated_at = new Date().toISOString();

  db.sync_history.unshift({
    id: Date.now(),
    source: "AnimeVerse",
    status: "success",
    anime: anime.length,
    movies: movies.length,
    episodeGroups: episodes.length,
    timestamp: db.updated_at
  });

  db.sync_history = db.sync_history.slice(0, 100);
  database.write(db);

  return {
    status: true,
    source: "AnimeVerse",
    anime: anime.length,
    movies: movies.length,
    episodeGroups: episodes.length,
    totalEpisodes: episodes.reduce(
      (total, group) => total + group.episodes.length,
      0
    ),
    updated_at: db.updated_at
  };
}
module.exports = {
  importAnimeVerse,
  normalizeAnimeCatalog,
  normalizeLatestCatalog,
  normalizeEpisodes,
  slugify
};
