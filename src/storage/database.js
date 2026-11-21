const fs = require("fs");
const path = require("path");

const DB_FILE = path.join(__dirname, "../../data/anime-db.json");

function initialize() {
  if (!fs.existsSync(DB_FILE)) {
    fs.writeFileSync(DB_FILE, JSON.stringify({
      anime: [],
      movies: [],
      episodes: [],
      sync_history: [],
      updated_at: null
    }, null, 2));
  }
}

function read() {
  initialize();
  return JSON.parse(fs.readFileSync(DB_FILE, "utf8"));
}

function write(data) {
  initialize();

  const temp = DB_FILE + ".tmp";

  fs.writeFileSync(temp, JSON.stringify(data, null, 2));
  fs.renameSync(temp, DB_FILE);
}

module.exports = {
  initialize,
  read,
  write,
  DB_FILE
};
