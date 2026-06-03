// ==========================================
// FICHEIRO: backend/server.js
// ==========================================
const express = require('express');
const cors = require('cors');
const db = require('./database');
const app = express();
const PORT = 3000;

app.use(cors());
app.use(express.json());

// ==========================================
// 1. ROTAS DO ESP32 (HARDWARE)
// ==========================================

// Rota Crítica: ESP32 pergunta se pode abrir a porta
app.post('/api/check-access', (req, res) => {
    const { uid } = req.body;

    if (!uid) return res.status(400).json({ error: "UID não fornecido" });

    db.get(`SELECT * FROM users WHERE uid = ? AND is_deleted = 0`, [uid], (err, user) => {
        if (err) return res.status(500).json({ error: err.message });

        if (!user) {
            registarLog(null, false, 'RFID - Cartão Desconhecido');
            return res.json({ authorized: false, message: "Cartão Desconhecido" });
        }

        if (user.is_blocked) {
            registarLog(user.id, false, 'RFID - Bloqueado');
            return res.json({ authorized: false, message: "Acesso Bloqueado" });
        }

        registarLog(user.id, true, 'RFID');
        return res.json({ authorized: true, message: "Acesso Concedido", userName: user.nome });
    });
});


// ==========================================
// 2. ROTAS DO FRONTEND REACT (GESTÃO)
// ==========================================

// Listar todos os utilizadores ativos (Exclui os apagados por soft delete)
app.get('/api/users', (req, res) => {
    db.all(`SELECT * FROM users WHERE is_deleted = 0`, [], (err, rows) => {
        if (err) return res.status(500).json({ error: err.message });
        res.json(rows);
    });
});

// Registar um novo utilizador / cartão
app.post('/api/users', (req, res) => {
    const { nome, uid } = req.body;
    
    if (!nome || !uid) return res.status(400).json({ error: "Nome e UID são obrigatórios" });

    db.run(`INSERT INTO users (nome, uid) VALUES (?, ?)`, [nome, uid], function(err) {
        if (err) {
            // Se tentar inserir um UID que já existe, a base de dados avisa
            if (err.message.includes('UNIQUE constraint failed')) {
                return res.status(400).json({ error: "Este cartão (UID) já está registado." });
            }
            return res.status(500).json({ error: err.message });
        }
        res.status(201).json({ id: this.lastID, nome, uid, is_blocked: 0 });
    });
});

// Kill Switch: Bloquear ou Desbloquear um cartão
app.put('/api/users/:id/block', (req, res) => {
    const userId = req.params.id;
    const { is_blocked } = req.body; // Espera receber { "is_blocked": true/false }

    db.run(`UPDATE users SET is_blocked = ? WHERE id = ?`, [is_blocked ? 1 : 0, userId], function(err) {
        if (err) return res.status(500).json({ error: err.message });
        res.json({ message: `Estado do utilizador ${userId} atualizado para ${is_blocked ? 'Bloqueado' : 'Ativo'}.` });
    });
});

// Soft Delete: Remover um cartão (Muda apenas a flag is_deleted para 1)
app.delete('/api/users/:id', (req, res) => {
    const userId = req.params.id;

    db.run(`UPDATE users SET is_deleted = 1, is_blocked = 1 WHERE id = ?`, [userId], function(err) {
        if (err) return res.status(500).json({ error: err.message });
        res.json({ message: `Utilizador ${userId} removido com sucesso.` });
    });
});

// Listar histórico de acessos (Logs para o Dashboard de Auditoria)
app.get('/api/access_logs', (req, res) => {
    // Faz um JOIN com a tabela users para obtermos o nome da pessoa em vez de apenas o ID
    const query = `
        SELECT access_logs.id, access_logs.timestamp, access_logs.success, access_logs.method, users.nome, users.uid 
        FROM access_logs 
        LEFT JOIN users ON access_logs.user_id = users.id 
        ORDER BY access_logs.timestamp DESC 
        LIMIT 50
    `;
    db.all(query, [], (err, rows) => {
        if (err) return res.status(500).json({ error: err.message });
        res.json(rows);
    });
});

// ==========================================
// FUNÇÃO AUXILIAR
// ==========================================
function registarLog(userId, success, method) {
    db.run(`INSERT INTO access_logs (user_id, success, method) VALUES (?, ?, ?)`, 
    [userId, success ? 1 : 0, method], function(err) {
        if (err) console.error("Erro ao guardar log:", err.message);
    });
}

// ==========================================
// INICIA O SERVIDOR
// ==========================================
app.listen(PORT, () => {
    console.log(`Servidor ativo! API a correr em http://localhost:${PORT}`);
});