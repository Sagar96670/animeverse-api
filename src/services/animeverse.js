const axios = require("axios");

const FIREBASE = "https://animeverse-9eada-default-rtdb.firebaseio.com";

const NODES = [
  "all_anime",
  "anime",
  "anime_links",
  "server2_links",
  "audio_tracks",
  "subtitles"
];

async function fetchNode(node) {
  const url = `${FIREBASE}/${node}.json`;

  const response = await axios.get(url, {
    timeout: 60000
  });

  return response.data;
}

async function fetchAnimeVerseData() {
  const results = await Promise.all(
    NODES.map(async node => {
      try {
        return [node, await fetchNode(node)];
      } catch (error) {
        throw new Error(`${node}: ${error.message}`);
      }
    })
  );

  return Object.fromEntries(results);
}

module.exports = {
  fetchAnimeVerseData,
  fetchNode,
  NODES,
  FIREBASE
};
