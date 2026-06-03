import { useState, useEffect } from 'react';
import axios from 'axios';
import { 
  Container, Typography, TextField, Button, Table, TableBody, 
  TableCell, TableContainer, TableHead, TableRow, Paper, Chip, Box, Tabs, Tab, Alert, AlertTitle
} from '@mui/material';

const API_URL = 'http://localhost:3000/api';

function App() {
  const [tabIndex, setTabIndex] = useState(0); // 0 = Gestão, 1 = Auditoria
  const [users, setUsers] = useState([]);
  const [logs, setLogs] = useState([]);
  const [nome, setNome] = useState('');
  const [uid, setUid] = useState('');

  // Função para ir buscar utilizadores e logs à base de dados
  const fetchData = async () => {
    try {
      const resUsers = await axios.get(`${API_URL}/users`);
      setUsers(resUsers.data);
      
      const resLogs = await axios.get(`${API_URL}/access_logs`);
      setLogs(resLogs.data);
    } catch (error) {
      console.error("Erro ao procurar dados:", error);
    }
  };

  // Corre quando a página abre e atualiza de 5 em 5 segundos (Polling - Tempo Real)
  useEffect(() => {
    fetchData();
    const intervalo = setInterval(fetchData, 5000);
    return () => clearInterval(intervalo);
  }, []);

  const handleAddUser = async (e) => {
    e.preventDefault();
    try {
      await axios.post(`${API_URL}/users`, { nome, uid });
      setNome('');
      setUid('');
      fetchData();
    } catch (error) {
      alert("Erro ao adicionar: " + (error.response?.data?.error || error.message));
    }
  };

  const handleToggleBlock = async (id, currentState) => {
    try {
      await axios.put(`${API_URL}/users/${id}/block`, { is_blocked: !currentState });
      fetchData();
    } catch (error) {
      console.error("Erro ao alterar estado:", error);
    }
  };

  const handleDelete = async (id) => {
    if (window.confirm("Tens a certeza que queres remover este utilizador?")) {
      try {
        await axios.delete(`${API_URL}/users/${id}`);
        fetchData();
      } catch (error) {
        console.error("Erro ao remover:", error);
      }
    }
  };

  // Lógica de Deteção de Anomalias (Intrusão)
  // Verifica se as últimas 3 tentativas foram falhadas
  const multiplasFalhas = logs.length >= 3 && logs.slice(0, 3).every(log => log.success === 0);

  return (
    <Container maxWidth="lg" sx={{ marginTop: 4, paddingBottom: 5 }}>
      <Typography variant="h3" gutterBottom align="center" sx={{ fontWeight: 'bold' }}>
        Sistema de Controlo de Acessos
      </Typography>

      {/* Menu de Navegação (Tabs) */}
      <Box sx={{ borderBottom: 1, borderColor: 'divider', marginBottom: 4 }}>
        <Tabs value={tabIndex} onChange={(e, newValue) => setTabIndex(newValue)} centered>
          <Tab label="Gestão de Identidades" sx={{ fontWeight: 'bold', fontSize: '1.1rem' }} />
          <Tab label="Monitorização e Auditoria" sx={{ fontWeight: 'bold', fontSize: '1.1rem' }} />
        </Tabs>
      </Box>

      {/* ========================================== */}
      {/* SEPARADOR 1: GESTÃO DE UTILIZADORES */}
      {/* ========================================== */}
      {tabIndex === 0 && (
        <Box>
          <Paper sx={{ padding: 3, marginBottom: 4 }} elevation={3}>
            <Typography variant="h5" gutterBottom>Registar Novo Cartão</Typography>
            <Box component="form" onSubmit={handleAddUser} sx={{ display: 'flex', gap: 2, alignItems: 'center' }}>
              <TextField label="Nome do Utilizador" variant="outlined" value={nome} onChange={(e) => setNome(e.target.value)} required fullWidth />
              <TextField label="UID do Cartão (ex: A1B2C3D4)" variant="outlined" value={uid} onChange={(e) => setUid(e.target.value)} required fullWidth />
              <Button type="submit" variant="contained" color="primary" size="large" sx={{ height: '56px' }}>Adicionar</Button>
            </Box>
          </Paper>

          <TableContainer component={Paper} elevation={3}>
            <Table>
              <TableHead sx={{ backgroundColor: '#f5f5f5' }}>
                <TableRow>
                  <TableCell><strong>ID</strong></TableCell>
                  <TableCell><strong>Nome</strong></TableCell>
                  <TableCell><strong>UID do Cartão</strong></TableCell>
                  <TableCell align="center"><strong>Estado</strong></TableCell>
                  <TableCell align="center"><strong>Ações</strong></TableCell>
                </TableRow>
              </TableHead>
              <TableBody>
                {users.length === 0 ? (
                  <TableRow><TableCell colSpan={5} align="center">Nenhum utilizador registado ainda.</TableCell></TableRow>
                ) : (
                  users.map((user) => (
                    <TableRow key={user.id}>
                      <TableCell>{user.id}</TableCell>
                      <TableCell>{user.nome}</TableCell>
                      <TableCell>{user.uid}</TableCell>
                      <TableCell align="center">
                        <Chip label={user.is_blocked ? "Bloqueado" : "Ativo"} color={user.is_blocked ? "warning" : "success"} sx={{ fontWeight: 'bold' }} />
                      </TableCell>
                      <TableCell align="center">
                        <Button variant="outlined" color={user.is_blocked ? "success" : "warning"} onClick={() => handleToggleBlock(user.id, user.is_blocked)} sx={{ marginRight: 1 }}>
                          {user.is_blocked ? "Desbloquear" : "Kill Switch"}
                        </Button>
                        <Button variant="outlined" color="error" onClick={() => handleDelete(user.id)}>Remover</Button>
                      </TableCell>
                    </TableRow>
                  ))
                )}
              </TableBody>
            </Table>
          </TableContainer>
        </Box>
      )}

      {/* ========================================== */}
      {/* SEPARADOR 2: DASHBOARD DE AUDITORIA (LOGS) */}
      {/* ========================================== */}
      {tabIndex === 1 && (
        <Box>
          {/* Alerta Visual de Deteção de Anomalias */}
          {multiplasFalhas && (
            <Alert severity="error" sx={{ marginBottom: 3 }}>
              <AlertTitle><strong>ALERTA DE SEGURANÇA</strong></AlertTitle>
              Múltiplas tentativas de acesso falhadas detetadas! Possível tentativa de intrusão no sistema.
            </Alert>
          )}

          <TableContainer component={Paper} elevation={3}>
            <Table>
              <TableHead sx={{ backgroundColor: '#1e1e1e' }}>
                <TableRow>
                  <TableCell sx={{ color: 'white' }}><strong>Data e Hora</strong></TableCell>
                  <TableCell sx={{ color: 'white' }}><strong>Utilizador</strong></TableCell>
                  <TableCell sx={{ color: 'white' }}><strong>UID Lido</strong></TableCell>
                  <TableCell sx={{ color: 'white' }}><strong>Método</strong></TableCell>
                  <TableCell align="center" sx={{ color: 'white' }}><strong>Resultado</strong></TableCell>
                </TableRow>
              </TableHead>
              <TableBody>
                {logs.length === 0 ? (
                  <TableRow><TableCell colSpan={5} align="center">Sem histórico de acessos.</TableCell></TableRow>
                ) : (
                  logs.map((log) => {
                    const isSuccess = log.success === 1;
                    return (
                      <TableRow key={log.id} sx={{ backgroundColor: isSuccess ? 'inherit' : '#fff0f0' }}>
                        <TableCell>{new Date(log.timestamp).toLocaleString('pt-PT')}</TableCell>
                        <TableCell>{log.nome || "Desconhecido"}</TableCell>
                        <TableCell>{log.uid || "N/A"}</TableCell>
                        <TableCell>{log.method}</TableCell>
                        <TableCell align="center">
                          <Chip 
                            label={isSuccess ? "Autorizado" : "Negado"} 
                            color={isSuccess ? "success" : "error"} 
                            variant="outlined"
                            sx={{ fontWeight: 'bold', backgroundColor: isSuccess ? '#e8f5e9' : '#ffebee' }} 
                          />
                        </TableCell>
                      </TableRow>
                    );
                  })
                )}
              </TableBody>
            </Table>
          </TableContainer>
        </Box>
      )}
    </Container>
  );
}

export default App;