// ==========================================
// FICHEIRO: Config.h
// ==========================================
#ifndef CONFIG_H
#define CONFIG_H

// 1. Credenciais de Rede (Muda isto!)
const char* WIFI_SSID = "devolo-319";
const char* WIFI_PASSWORD = "DTHYQGNSRKXUTHKN";

// O IP do computador onde o teu servidor Node.js está a correr
const String API_URL = "http://192.168.1.70:3000/api/check-access"; 
const String API_URL_ALARM = "http://192.168.1.70:3000/api/alarms"; // NOVA LINHA!

// 2. Definição de Pinos - ESP32
// SPI Pins (MFRC522)
#define RST_PIN         4   // CORRIGIDO: Pino 4 para não chocar com o ecrã I2C
#define SS_PIN          5  

// Atuador e Sensores
#define RELAY_PIN       26  // Pino do Relé
#define REED_SWITCH_PIN 27  // Pino do Sensor Magnético

// 3. Constantes de Tempo
#define TEMPO_PORTA_ABERTA 5000 // A porta fica destrancada 5 segundos

#endif