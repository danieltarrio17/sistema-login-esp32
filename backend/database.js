const sqlite3 = require('sqlite3').verbose();

// Cria o ficheiro da base de dados
const db = new sqlite3.Database('./sistema_acessos.db', (err) => {
    if (err) {
        console.error('Erro ao ligar à base de dados:', err.message);
    } else {
        console.log('Ligação à base de dados SQLite com sucesso.');
    }
});

// Força a criação das tabelas
db.serialize(() => {
    db.run(`CREATE TABLE IF NOT EXISTS users (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        nome TEXT NOT NULL,
        uid TEXT UNIQUE NOT NULL,
        is_blocked BOOLEAN DEFAULT 0,
        is_deleted BOOLEAN DEFAULT 0
    )`);

    db.run(`CREATE TABLE IF NOT EXISTS access_logs (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        user_id INTEGER,
        timestamp DATETIME DEFAULT CURRENT_TIMESTAMP,
        success BOOLEAN NOT NULL,
        method TEXT NOT NULL,
        FOREIGN KEY(user_id) REFERENCES users(id)
    )`);
    
    console.log('Tabelas criadas e prontas a usar!');
});

module.exports = db;