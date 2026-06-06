import { useState, useEffect, useMemo } from 'react';
import axios from 'axios';
import { 
  Container, Typography, TextField, Button, Table, TableBody, 
  TableCell, TableContainer, TableHead, TableRow, Paper, Chip, Box, Tabs, Tab, Alert, AlertTitle, Select, MenuItem, InputLabel, FormControl, Switch, FormControlLabel,
  ThemeProvider, createTheme, CssBaseline, Grid, Card, CardContent, AppBar, Toolbar, IconButton
} from '@mui/material';

// Ícones
import DownloadIcon from '@mui/icons-material/Download';
import DarkModeIcon from '@mui/icons-material/DarkMode';
import LightModeIcon from '@mui/icons-material/LightMode';
import PeopleIcon from '@mui/icons-material/People';
import VerifiedUserIcon from '@mui/icons-material/VerifiedUser';
import ImportExportIcon from '@mui/icons-material/ImportExport';
import GppBadIcon from '@mui/icons-material/GppBad';
import RadarIcon from '@mui/icons-material/Radar';

const API_URL = 'http://localhost:3000/api';

function App() {
  const [tabIndex, setTabIndex] = useState(0);
  const [users, setUsers] = useState([]);
  const [logs, setLogs] = useState([]);
  const [waitingForUser, setWaitingForUser] = useState(null);

  // NOVO: Estado para o Tema Escuro
  const [darkMode, setDarkMode] = useState(false);

  // Estados do Formulário
  const [nome, setNome] = useState('');
  const [role, setRole] = useState('Colaborador');
  const [department, setDepartment] = useState('Geral');
  const [isTemporary, setIsTemporary] = useState(false);
  const [validUntil, setValidUntil] = useState('');

  // TEMA CORPORATIVO (Reage ao estado darkMode)
  const theme = useMemo(() => createTheme({
    palette: {
      mode: darkMode ? 'dark' : 'light',
      primary: { main: '#2563eb' }, // Azul premium
      secondary: { main: '#10b981' }, // Verde Esmeralda
      background: {
        default: darkMode ? '#0f172a' : '#f1f5f9',
        paper: darkMode ? '#1e293b' : '#ffffff',
      },
    },
    shape: { borderRadius: 12 },
    typography: {
      fontFamily: '"Inter", "Roboto", "Helvetica", "Arial", sans-serif',
      h4: { fontWeight: 700, letterSpacing: '-0.5px' },
      h6: { fontWeight: 600 },
    },
    components: {
      MuiButton: { styleOverrides: { root: { textTransform: 'none', fontWeight: 600 } } },
      MuiPaper: { styleOverrides: { root: { backgroundImage: 'none' } } },
      MuiTableCell: { styleOverrides: { head: { fontWeight: 700 } } }
    }
  }), [darkMode]);

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

  useEffect(() => {
    fetchData();
    const intervalo = setInterval(fetchData, 5000);
    return () => clearInterval(intervalo);
  }, []);

  // O RADAR DE HARDWARE (Manteve-se a Lógica Intacta)
  useEffect(() => {
    let escutaInterval;
    if (waitingForUser) {
      escutaInterval = setInterval(async () => {
        try {
          const res = await axios.get(`${API_URL}/last-scanned`);
          if (res.data.uid) { 
            clearInterval(escutaInterval); 
            try {
              await axios.put(`${API_URL}/users/${waitingForUser}/card`, { uid: res.data.uid });
              await axios.delete(`${API_URL}/last-scanned`);
              setWaitingForUser(null);
              fetchData();
              alert("Cartão detetado pelo hardware e atribuído com sucesso!");
            } catch (err) {
              await axios.delete(`${API_URL}/last-scanned`);
              setWaitingForUser(null);
              alert("ERRO DE ATRIBUIÇÃO: " + (err.response?.data?.error || err.message));
            }
          }
        } catch (error) {
          console.error("Erro no Radar", error);
        }
      }, 1000);
    }
    return () => clearInterval(escutaInterval);
  }, [waitingForUser]);

  const handleAddUser = async (e) => {
    e.preventDefault();
    try {
      await axios.post(`${API_URL}/users`, { 
        nome, uid: null, role, department, valid_until: isTemporary ? validUntil : null 
      });
      setNome(''); setRole('Colaborador'); setDepartment('Geral'); 
      setIsTemporary(false); setValidUntil('');
      fetchData();
    } catch (error) {
      alert("Erro ao adicionar: " + (error.response?.data?.error || error.message));
    }
  };

  const startWaitingForCard = async (id) => {
    await axios.delete(`${API_URL}/last-scanned`); 
    setWaitingForUser(id); 
  };

  const handleToggleBlock = async (id, currentState) => {
    try {
      await axios.put(`${API_URL}/users/${id}/block`, { is_blocked: !currentState });
      fetchData();
    } catch (error) {}
  };

  const handleDelete = async (id) => {
    if (window.confirm("Atenção: Esta ação irá revogar o acesso permanentemente. Confirmar?")) {
      try {
        await axios.delete(`${API_URL}/users/${id}`);
        fetchData();
      } catch (error) {}
    }
  };

  const exportToCSV = () => {
    let csvContent = "data:text/csv;charset=utf-8,\uFEFF";
    csvContent += "Data e Hora,Utilizador,Departamento,UID Cartao,Metodo,Resultado\n";
    logs.forEach(log => {
      const dataStr = new Date(log.timestamp).toLocaleString('pt-PT');
      const nomeStr = log.nome || "Desconhecido";
      const depStr = log.department || "N/A";
      const uidStr = log.uid ? log.uid.split('-REMOVIDO-')[0] : "N/A";
      const methodStr = log.method;
      const resultStr = log.success === 1 ? "Autorizado" : "Negado";
      csvContent += `"${dataStr}","${nomeStr}","${depStr}","${uidStr}","${methodStr}","${resultStr}"\n`;
    });
    const encodedUri = encodeURI(csvContent);
    const link = document.createElement("a");
    link.setAttribute("href", encodedUri);
    link.setAttribute("download", "Relatorio_Auditoria_RH.csv");
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
  };

  const getStatusBadge = (user) => {
    if (user.is_deleted) return <Chip label="Removido" color="error" size="small" sx={{ fontWeight: 'bold', width: '90px' }} />;
    if (user.is_blocked) return <Chip label="Bloqueado" color="warning" size="small" sx={{ fontWeight: 'bold', width: '90px' }} />;
    if (user.valid_until) {
      const isExpired = new Date() > new Date(user.valid_until);
      if (isExpired) return <Chip label="Expirado" size="small" sx={{ fontWeight: 'bold', backgroundColor: '#94a3b8', color: 'white', width: '90px' }} />;
    }
    if (!user.uid) return <Chip label="Pendente" color="info" size="small" sx={{ fontWeight: 'bold', width: '90px' }} />;
    return <Chip label="Ativo" color="success" size="small" sx={{ fontWeight: 'bold', width: '90px' }} />;
  };

  const formatarData = (dataIso) => {
    if (!dataIso) return "Sem Limite";
    return new Date(dataIso).toLocaleString('pt-PT', { dateStyle: 'short', timeStyle: 'short' });
  };

  // CÁLCULO DE ESTATÍSTICAS (KPIs)
  const totalUsers = users.length;
  const activeUsers = users.filter(u => !u.is_deleted && !u.is_blocked).length;
  const falhasAcesso = logs.filter(l => l.success === 0 && !l.method.includes('ALARME')).length;

  const multiplasFalhas = logs.length >= 3 && logs.slice(0, 3).every(log => log.success === 0);
  const intrusaoFisicaAtiva = logs.length > 0 && logs[0].method === 'ALARME - INTRUSÃO FÍSICA';

  return (
    <ThemeProvider theme={theme}>
      <CssBaseline /> {/* Aplica a cor de fundo dinamicamente a toda a página */}
      
      {/* BARRA DE NAVEGAÇÃO SUPERIOR */}
      <AppBar position="static" color="inherit" elevation={1} sx={{ borderBottom: `1px solid ${theme.palette.divider}` }}>
        <Toolbar>
          <RadarIcon color="primary" sx={{ fontSize: 32, mr: 2 }} />
          <Typography variant="h5" sx={{ flexGrow: 1, fontWeight: 800, color: theme.palette.text.primary, letterSpacing: '-0.5px' }}>
            Acessos<span style={{ color: theme.palette.primary.main }}>IoT</span>
          </Typography>
          <IconButton onClick={() => setDarkMode(!darkMode)} color="inherit" sx={{ ml: 1 }}>
            {darkMode ? <LightModeIcon sx={{ color: '#fbbf24' }} /> : <DarkModeIcon sx={{ color: '#475569' }} />}
          </IconButton>
        </Toolbar>
      </AppBar>

      <Container maxWidth="xl" sx={{ marginTop: 4, paddingBottom: 5 }}>
        
        {/* PAINEL DE ESTATÍSTICAS (KPI CARDS) */}
        <Grid container spacing={3} sx={{ mb: 4 }}>
          <Grid item xs={12} sm={6} md={3}>
            <Card elevation={0} sx={{ border: `1px solid ${theme.palette.divider}`, backgroundColor: theme.palette.background.paper }}>
              <CardContent sx={{ display: 'flex', alignItems: 'center', p: 3 }}>
                <Box sx={{ p: 1.5, borderRadius: 2, bgcolor: `${theme.palette.primary.main}15`, color: theme.palette.primary.main, mr: 2 }}>
                  <PeopleIcon fontSize="large" />
                </Box>
                <Box>
                  <Typography color="textSecondary" variant="subtitle2" fontWeight="600">Total Identidades</Typography>
                  <Typography variant="h4" fontWeight="bold">{totalUsers}</Typography>
                </Box>
              </CardContent>
            </Card>
          </Grid>
          <Grid item xs={12} sm={6} md={3}>
            <Card elevation={0} sx={{ border: `1px solid ${theme.palette.divider}`, backgroundColor: theme.palette.background.paper }}>
              <CardContent sx={{ display: 'flex', alignItems: 'center', p: 3 }}>
                <Box sx={{ p: 1.5, borderRadius: 2, bgcolor: `${theme.palette.secondary.main}15`, color: theme.palette.secondary.main, mr: 2 }}>
                  <VerifiedUserIcon fontSize="large" />
                </Box>
                <Box>
                  <Typography color="textSecondary" variant="subtitle2" fontWeight="600">Perfis Ativos</Typography>
                  <Typography variant="h4" fontWeight="bold">{activeUsers}</Typography>
                </Box>
              </CardContent>
            </Card>
          </Grid>
          <Grid item xs={12} sm={6} md={3}>
            <Card elevation={0} sx={{ border: `1px solid ${theme.palette.divider}`, backgroundColor: theme.palette.background.paper }}>
              <CardContent sx={{ display: 'flex', alignItems: 'center', p: 3 }}>
                <Box sx={{ p: 1.5, borderRadius: 2, bgcolor: `${theme.palette.info.main}15`, color: theme.palette.info.main, mr: 2 }}>
                  <ImportExportIcon fontSize="large" />
                </Box>
                <Box>
                  <Typography color="textSecondary" variant="subtitle2" fontWeight="600">Leituras de Log</Typography>
                  <Typography variant="h4" fontWeight="bold">{logs.length}</Typography>
                </Box>
              </CardContent>
            </Card>
          </Grid>
          <Grid item xs={12} sm={6} md={3}>
            <Card elevation={0} sx={{ border: `1px solid ${theme.palette.divider}`, backgroundColor: theme.palette.background.paper }}>
              <CardContent sx={{ display: 'flex', alignItems: 'center', p: 3 }}>
                <Box sx={{ p: 1.5, borderRadius: 2, bgcolor: `${theme.palette.error.main}15`, color: theme.palette.error.main, mr: 2 }}>
                  <GppBadIcon fontSize="large" />
                </Box>
                <Box>
                  <Typography color="textSecondary" variant="subtitle2" fontWeight="600">Acessos Bloqueados</Typography>
                  <Typography variant="h4" fontWeight="bold">{falhasAcesso}</Typography>
                </Box>
              </CardContent>
            </Card>
          </Grid>
        </Grid>

        <Box sx={{ borderBottom: 1, borderColor: 'divider', marginBottom: 4 }}>
          <Tabs value={tabIndex} onChange={(e, newValue) => setTabIndex(newValue)} centered textColor="primary" indicatorColor="primary">
            <Tab label="Controlo de Identidades (RBAC)" sx={{ fontWeight: 'bold', fontSize: '1rem', textTransform: 'none' }} />
            <Tab label="Auditoria e Relatórios" sx={{ fontWeight: 'bold', fontSize: '1rem', textTransform: 'none' }} />
          </Tabs>
        </Box>

        {/* ============================== SEPARADOR 1 ============================== */}
        {tabIndex === 0 && (
          <Box>
            <Paper sx={{ padding: 4, marginBottom: 5 }} elevation={2}>
              <Typography variant="h6" gutterBottom sx={{ fontWeight: 700, mb: 3 }}>Onboarding de Novo Perfil</Typography>
              
              <Box component="form" onSubmit={handleAddUser}>
                <Grid container spacing={3} alignItems="center">
                  <Grid item xs={12} md={4}>
                    <TextField label="Nome Completo" variant="outlined" value={nome} onChange={(e) => setNome(e.target.value)} required fullWidth />
                  </Grid>
                  
                  <Grid item xs={12} sm={6} md={2}>
                    <FormControl fullWidth>
                      <InputLabel>Privilégio</InputLabel>
                      <Select value={role} label="Privilégio" onChange={(e) => setRole(e.target.value)}>
                        <MenuItem value="Administrador">Administrador</MenuItem>
                        <MenuItem value="Segurança">Segurança</MenuItem>
                        <MenuItem value="Engenheiro">Engenheiro</MenuItem>
                        <MenuItem value="Colaborador">Colaborador</MenuItem>
                        <MenuItem value="Visitante">Visitante</MenuItem>
                      </Select>
                    </FormControl>
                  </Grid>

                  <Grid item xs={12} sm={6} md={2}>
                    <TextField label="Departamento" variant="outlined" value={department} onChange={(e) => setDepartment(e.target.value)} fullWidth />
                  </Grid>

                  <Grid item xs={12} md={4} sx={{ display: 'flex', gap: 2, alignItems: 'center' }}>
                    <FormControlLabel 
                      control={<Switch checked={isTemporary} onChange={(e) => setIsTemporary(e.target.checked)} color="warning" />} 
                      label={<Typography variant="body2" fontWeight="600">Acesso Temporário</Typography>} 
                    />
                    
                    {isTemporary && (
                      <TextField 
                        label="Data Limite" type="datetime-local" variant="outlined" size="small"
                        InputLabelProps={{ shrink: true }} value={validUntil} onChange={(e) => setValidUntil(e.target.value)} required={isTemporary}
                        sx={{ 
                          flex: 1,
                          '& .MuiInputLabel-root': {
                            backgroundColor: theme.palette.background.paper,
                            padding: '0 4px',
                            marginLeft: '-4px'
                          }
                        }}
                      />
                    )}
                  </Grid>
                </Grid>
                
                <Box sx={{ mt: 3, display: 'flex', justifyContent: 'flex-end' }}>
                  <Button type="submit" variant="contained" color="primary" size="large" sx={{ px: 4, py: 1.5, borderRadius: 2 }}>
                    Criar Perfil Seguro
                  </Button>
                </Box>
              </Box>
            </Paper>

            <TableContainer component={Paper} elevation={2} sx={{ borderRadius: 2, overflow: 'hidden' }}>
              <Table>
                <TableHead sx={{ backgroundColor: darkMode ? '#0f172a' : '#f8fafc' }}>
                  <TableRow>
                    <TableCell><strong>Nome</strong></TableCell>
                    <TableCell><strong>Privilégio / Dept.</strong></TableCell>
                    <TableCell><strong>Validade</strong></TableCell>
                    <TableCell><strong>Cartão Físico</strong></TableCell>
                    <TableCell align="center"><strong>Estado</strong></TableCell>
                    <TableCell align="center"><strong>Ações de Segurança</strong></TableCell>
                  </TableRow>
                </TableHead>
                <TableBody>
                  {users.map((user) => (
                    <TableRow key={user.id} sx={{ 
                      '&:hover': { backgroundColor: theme.palette.action.hover },
                      opacity: user.is_deleted ? 0.6 : 1,
                      transition: 'background-color 0.2s'
                    }}>
                      <TableCell><Typography fontWeight="600">{user.nome}</Typography></TableCell>
                      <TableCell>
                        <Chip label={user.role} size="small" color={user.role === 'Administrador' ? 'primary' : 'default'} sx={{ mr: 1, mb: { xs: 1, md: 0 } }} />
                        <Typography variant="caption" color="textSecondary" display="block">{user.department}</Typography>
                      </TableCell>
                      <TableCell><Typography variant="body2" color="textSecondary">{formatarData(user.valid_until)}</Typography></TableCell>
                      <TableCell sx={{ fontFamily: 'monospace', color: theme.palette.text.secondary }}>
                        {user.uid ? user.uid.split('-REMOVIDO-')[0] : <Chip label="Aguardar hardware" size="small" variant="outlined" />}
                      </TableCell>
                      <TableCell align="center">{getStatusBadge(user)}</TableCell>
                      <TableCell align="center">
                        {!user.uid && user.is_deleted === 0 ? (
                          waitingForUser === user.id ? (
                            <Button variant="contained" color="warning" disabled sx={{ mr: 1, borderRadius: 2, animation: 'pulse 1.5s infinite' }}>
                              A LER HARDWARE...
                            </Button>
                          ) : (
                            <Button variant="contained" color="info" size="small" onClick={() => startWaitingForCard(user.id)} sx={{ mr: 1, borderRadius: 2 }}>
                              Atribuir Cartão
                            </Button>
                          )
                        ) : (
                          <Button variant="outlined" size="small" color={user.is_blocked ? "success" : "warning"} onClick={() => handleToggleBlock(user.id, user.is_blocked)} sx={{ mr: 1, borderRadius: 2 }} disabled={user.is_deleted === 1}>
                            {user.is_blocked ? "Desbloquear" : "Bloquear"}
                          </Button>
                        )}
                        <Button variant="contained" size="small" color="error" onClick={() => handleDelete(user.id)} disabled={user.is_deleted === 1} sx={{ borderRadius: 2 }}>
                          Remover
                        </Button>
                      </TableCell>
                    </TableRow>
                  ))}
                  {users.length === 0 && (
                    <TableRow><TableCell colSpan={6} align="center" sx={{ py: 4 }}><Typography color="textSecondary">Nenhum perfil registado.</Typography></TableCell></TableRow>
                  )}
                </TableBody>
              </Table>
            </TableContainer>
          </Box>
        )}

        {/* ============================== SEPARADOR 2 ============================== */}
        {tabIndex === 1 && (
          <Box>
            {intrusaoFisicaAtiva && (
              <Alert 
                severity="error" variant="filled" 
                sx={{ 
                  marginBottom: 3, borderRadius: 2, 
                  boxShadow: '0 0 20px rgba(239, 68, 68, 0.4)',
                  '@keyframes pulseBorder': { '0%': { opacity: 1 }, '50%': { opacity: 0.6 }, '100%': { opacity: 1 } },
                  animation: 'pulseBorder 1s infinite'
                }}
              >
                <AlertTitle sx={{ fontSize: '1.2rem' }}><strong>🚨 ALARME: ARROMBAMENTO FÍSICO DETETADO 🚨</strong></AlertTitle>
                A porta foi aberta à força sem leitura de cartão! Sensor magnético violado.
              </Alert>
            )}

            {multiplasFalhas && !intrusaoFisicaAtiva && (
              <Alert severity="warning" sx={{ marginBottom: 3, borderRadius: 2 }}>
                <AlertTitle><strong>Aviso de Segurança: Múltiplas Falhas</strong></AlertTitle>
                Foram detetadas tentativas repetidas de acesso não autorizado no leitor RFID.
              </Alert>
            )}

            <Box sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 3 }}>
              <Typography variant="h6" fontWeight="700">Histórico de Eventos</Typography>
              <Button variant="contained" color="success" startIcon={<DownloadIcon />} onClick={exportToCSV} sx={{ borderRadius: 2 }}>
                Exportar Relatório (CSV)
              </Button>
            </Box>
            
            <TableContainer component={Paper} elevation={2} sx={{ borderRadius: 2, overflow: 'hidden' }}>
              <Table>
                <TableHead sx={{ backgroundColor: darkMode ? '#0f172a' : '#f8fafc' }}>
                  <TableRow>
                    <TableCell><strong>Data e Hora</strong></TableCell>
                    <TableCell><strong>Identidade</strong></TableCell>
                    <TableCell><strong>Departamento</strong></TableCell>
                    <TableCell><strong>UID Detetado</strong></TableCell>
                    <TableCell><strong>Detalhe de Acesso</strong></TableCell>
                  </TableRow>
                </TableHead>
                <TableBody>
                  {logs.map((log) => {
                    const isSuccess = log.success === 1;
                    return (
                      <TableRow key={log.id} sx={{ 
                        backgroundColor: isSuccess ? 'inherit' : (darkMode ? 'rgba(239, 68, 68, 0.08)' : 'rgba(239, 68, 68, 0.05)'),
                        '&:hover': { backgroundColor: theme.palette.action.hover }
                      }}>
                        <TableCell><Typography variant="body2" color="textSecondary">{new Date(log.timestamp).toLocaleString('pt-PT')}</Typography></TableCell>
                        <TableCell><Typography fontWeight="600">{log.nome || "Não Registado"}</Typography></TableCell>
                        <TableCell><Typography variant="body2">{log.department || "-"}</Typography></TableCell>
                        <TableCell sx={{ fontFamily: 'monospace', color: theme.palette.text.secondary }}>{log.uid ? log.uid.split('-REMOVIDO-')[0] : "N/A"}</TableCell>
                        <TableCell>
                          <Chip 
                            label={log.method} 
                            color={isSuccess ? "success" : "error"} 
                            size="small"
                            variant={darkMode ? "outlined" : "filled"} 
                            sx={{ fontWeight: 'bold', borderRadius: 1 }} 
                          />
                        </TableCell>
                      </TableRow>
                    );
                  })}
                  {logs.length === 0 && (
                    <TableRow><TableCell colSpan={5} align="center" sx={{ py: 4 }}><Typography color="textSecondary">Sem registos de auditoria.</Typography></TableCell></TableRow>
                  )}
                </TableBody>
              </Table>
            </TableContainer>
          </Box>
        )}
      </Container>
    </ThemeProvider>
  );
}

export default App;