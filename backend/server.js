// backend/server.js
const express = require('express');
const cors = require('cors');
const app = express();
const PORT = 3000;

app.use(cors());
app.use(express.json());

// Rota de Teste
app.get('/api/status', (req, res) => {
    res.json({ mensagem: "Servidor a funcionar perfeitamente!" });
});

app.listen(PORT, () => {
    console.log(`Servidor a correr na porta http://localhost:${PORT}`);
});