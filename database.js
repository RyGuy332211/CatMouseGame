const sqlite3 = require('sqlite3').verbose();
const db = new sqlite3.Database('./game.db');

db.serialize(() => {
  db.run("CREATE TABLE IF NOT EXISTS users (id INTEGER PRIMARY KEY AUTOINCREMENT, username TEXT UNIQUE, password TEXT, coins INTEGER DEFAULT 0)");
});

function loginUser(username, password, callback) {
  db.get("SELECT * FROM users WHERE username = ? AND password = ?", [username, password], (err, row) => {
    callback(err, row);
  });
}

function registerUser(username, password, callback) {
  db.run("INSERT INTO users (username, password) VALUES (?, ?)", [username, password], function(err) {
    callback(err, this ? this.lastID : null);
  });
}

module.exports = { db, loginUser, registerUser };
