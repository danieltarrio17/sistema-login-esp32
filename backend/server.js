const express = require('express');
const cors = require('cors');
const db = require('./database');
const app = express();
const PORT = 3000;

app.use(cors());
app.use(express.json());

// ==========================================
// CIBERSEGURANÇA: API KEY DO HARDWARE
// ==========================================
const API_KEY_HARDWARE = "CHAVE_ULTRA_SECRETA_ESP32_2026";

// O "Segurança da Porta": Middleware que verifica a chave antes de deixar passar
const verificarApiKey = (req, res, next) => {
    const clientKey = req.headers['x-api-key']; // Procura a chave no cabeçalho invisível
    
    if (clientKey !== API_KEY_HARDWARE) {
        console.warn(`🚨 ALERTA CIBERSEGURANÇA: Tentativa de ataque bloqueada (IP: ${req.ip})`);
        return res.status(401).json({ error: "Acesso Negado: API Key inválida ou ausente." });
    }
    
    next(); // Se a chave estiver certa, deixa o pedido avançar
};

let ultimoCartaoLido = null;

// ==========================================
// 1. ROTAS DO ESP32 (HARDWARE BLINDADO)
// ==========================================

// Rota de verificação de cartão - Agora protegida pelo "verificarApiKey"
app.post('/api/check-access', verificarApiKey, (req, res) => {
    const { uid } = req.body;
    if (!uid) return res.status(400).json({ error: "UID não fornecido" });

    ultimoCartaoLido = uid;

    db.get(`SELECT * FROM users WHERE uid = ? AND is_deleted = 0`, [uid], (err, user) => {
        if (err) return res.status(500).json({ error: err.message });

        if (!user) {
            registarLog(null, uid, false, 'RFID - Desconhecido');
            return res.json({ authorized: false, message: "Cartão Desconhecido" });
        }

        if (user.is_blocked) {
            registarLog(user.id, uid, false, 'RFID - Bloqueado (Kill Switch)');
            return res.json({ authorized: false, message: "Acesso Bloqueado" });
        }

        // Verificação de Validade Automática (Temporários)
        if (user.valid_until) {
            const agora = new Date();
            const dataValidade = new Date(user.valid_until);
            if (agora > dataValidade) {
                registarLog(user.id, uid, false, 'RFID - Expirado');
                return res.json({ authorized: false, message: "Cartão Expirado" });
            }
        }

        registarLog(user.id, uid, true, 'RFID - Autorizado');
        return res.json({ authorized: true, message: "Acesso Concedido", userName: user.nome });
    });
});

// Rota de alarmes - Agora protegida para evitar falsos alarmes disparados por hackers
app.post('/api/alarms', verificarApiKey, (req, res) => {
    db.run(`INSERT INTO access_logs (user_id, uid_lido, success, method) VALUES (NULL, 'N/A', 0, 'ALARME - INTRUSÃO FÍSICA')`, [], function(err) {
        if (err) return res.status(500).json({ error: err.message });
        res.json({ message: "Alarme registado!" });
    });
});


// ==========================================
// 2. ROTAS DO FRONTEND REACT (PAINEL ADMIN)
// ==========================================

// Memória temporária para atribuição de cartões (O React não precisa de API Key para ler isto)
app.get('/api/last-scanned', (req, res) => res.json({ uid: ultimoCartaoLido }));
app.delete('/api/last-scanned', (req, res) => { ultimoCartaoLido = null; res.json({ message: "Memória limpa." }); });

app.get('/api/users', (req, res) => {
    db.all(`SELECT * FROM users ORDER BY is_deleted ASC, id DESC`, [], (err, rows) => {
        if (err) return res.status(500).json({ error: err.message });
        res.json(rows);
    });
});

app.post('/api/users', (req, res) => {
    const { nome, uid, role, department, valid_until } = req.body;
    if (!nome) return res.status(400).json({ error: "Nome é obrigatório" });
    
    const finalUid = uid && uid.trim() !== '' ? uid : null;
    const finalValidUntil = valid_until ? valid_until : null;

    db.run(`INSERT INTO users (nome, uid, role, department, valid_until) VALUES (?, ?, ?, ?, ?)`, 
    [nome, finalUid, role || 'Colaborador', department || 'Geral', finalValidUntil], function(err) {
        if (err) {
            if (err.message.includes('UNIQUE constraint failed')) return res.status(400).json({ error: "Cartão já atribuído a outra pessoa." });
            return res.status(500).json({ error: err.message });
        }
        res.status(201).json({ id: this.lastID, nome, uid: finalUid });
    });
});

app.put('/api/users/:id/card', (req, res) => {
    const { uid } = req.body;
    db.run(`UPDATE users SET uid = ? WHERE id = ?`, [uid, req.params.id], function(err) {
        if (err) return res.status(500).json({ error: err.message });
        res.json({ message: "Cartão atribuído!" });
    });
});

app.put('/api/users/:id/block', (req, res) => {
    const { is_blocked } = req.body;
    db.run(`UPDATE users SET is_blocked = ? WHERE id = ?`, [is_blocked ? 1 : 0, req.params.id], function(err) {
        if (err) return res.status(500).json({ error: err.message });
        res.json({ message: `Estado atualizado.` });
    });
});

app.delete('/api/users/:id', (req, res) => {
    const query = `UPDATE users SET is_deleted = 1, is_blocked = 1, uid = uid || '-REMOVIDO-' || id WHERE id = ?`;
    db.run(query, [req.params.id], function(err) {
        if (err) return res.status(500).json({ error: err.message });
        res.json({ message: `Utilizador removido.` });
    });
});

app.get('/api/access_logs', (req, res) => {
    const query = `
        SELECT access_logs.id, access_logs.timestamp, access_logs.success, access_logs.method, access_logs.uid_lido as uid, users.nome, users.department 
        FROM access_logs 
        LEFT JOIN users ON access_logs.user_id = users.id 
        ORDER BY access_logs.timestamp DESC 
        LIMIT 100
    `;
    db.all(query, [], (err, rows) => {
        if (err) return res.status(500).json({ error: err.message });
        res.json(rows);
    });
});

// Função Auxiliar
function registarLog(userId, uidLido, success, method) {
    db.run(`INSERT INTO access_logs (user_id, uid_lido, success, method) VALUES (?, ?, ?, ?)`, 
    [userId, uidLido, success ? 1 : 0, method], function(err) {
        if (err) console.error("Erro ao guardar log:", err.message);
    });
}

app.listen(PORT, () => {
    console.log(`Servidor ativo e blindado com API Key! API a correr em http://localhost:${PORT}`);
});