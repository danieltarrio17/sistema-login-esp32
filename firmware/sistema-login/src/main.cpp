#include <Arduino.h>
#include <WiFi.h>
#include <HTTPClient.h>
#include <SPI.h>
#include <MFRC522.h>
#include <Preferences.h>
#include "mbedtls/md.h"

// ==========================================
// CONFIGURAÇÕES DE REDE E SEGURANÇA
// ==========================================
const char* ssid = "devolo-319";
const char* password = "DTHYQGNSRKXUTHKN";

// Substitui pelo IP do teu computador onde o Node.js está a correr
const String SERVER_URL = "http://192.168.1.70:3000/api/check-access";
const String ALARM_URL = "http://192.168.1.70:3000/api/alarms";

// A NOSSA CHAVE DE CIBERSEGURANÇA (Para evitar Replay Attacks)
const String API_KEY = "CHAVE_ULTRA_SECRETA_ESP32_2026";

// ==========================================
// CONFIGURAÇÕES DE HARDWARE (PINOS)
// ==========================================
#define SS_PIN 5        // Pino SDA/SS do RFID
#define RST_PIN 22      // Pino RST do RFID
#define RELAY_PIN 15    // Pino do Relé (Fechadura)
#define REED_SWITCH 4   // Pino do Sensor Magnético de Porta

MFRC522 rfid(SS_PIN, RST_PIN);
Preferences cacheMemoria; // Gestor de memória interna para o Modo Offline

// Variáveis de Estado da Porta
bool portaAutorizada = false;
unsigned long tempoAbertura = 0;
const unsigned long TEMPO_DESTRANCADA = 5000; // 5 segundos aberta
bool alarmeAtivo = false;

// ==========================================
// 1. FUNÇÃO DE CRIPTOGRAFIA MILITAR (SHA-256)
// ==========================================
String calcularSHA256(String input) {
    byte shaResult[32];
    mbedtls_md_context_t ctx;
    mbedtls_md_type_t md_type = MBEDTLS_MD_SHA256;

    mbedtls_md_init(&ctx);
    mbedtls_md_setup(&ctx, mbedtls_md_info_from_type(md_type), 0);
    mbedtls_md_starts(&ctx);
    mbedtls_md_update(&ctx, (const unsigned char *) input.c_str(), input.length());
    mbedtls_md_finish(&ctx, shaResult);
    mbedtls_md_free(&ctx);

    String hashString = "";
    for (int i = 0; i < 32; i++) {
        char str[3];
        sprintf(str, "%02x", (int)shaResult[i]);
        hashString += str;
    }
    return hashString; // Retorna algo como "e3b0c44298fc..."
}

// ==========================================
// 2. GESTÃO DO MODO DEGRADADO (OFFLINE CACHE)
// ==========================================
void guardarHashNaCache(String hashUID) {
    cacheMemoria.begin("acessos", false);
    int indiceAtual = cacheMemoria.getInt("indice", 0);

    // Verifica se já existe para não repetir
    bool existe = false;
    for(int i = 0; i < 10; i++) {
        if(cacheMemoria.getString(String("h" + String(i)).c_str(), "") == hashUID) {
            existe = true; break;
        }
    }

    // Se é um cartão novo autorizado, guarda o Hash no espaço atual e avança o índice (Rotativo de 10)
    if(!existe) {
        cacheMemoria.putString(String("h" + String(indiceAtual)).c_str(), hashUID);
        indiceAtual = (indiceAtual + 1) % 10;
        cacheMemoria.putInt("indice", indiceAtual);
        Serial.println("🛡️ Hash criptográfico guardado na cache local.");
    }
    cacheMemoria.end();
}

bool verificarAcessoOffline(String hashUID) {
    cacheMemoria.begin("acessos", true); // Modo leitura
    bool autorizado = false;
    for(int i = 0; i < 10; i++) {
        if(cacheMemoria.getString(String("h" + String(i)).c_str(), "") == hashUID) {
            autorizado = true;
            break;
        }
    }
    cacheMemoria.end();
    return autorizado;
}

// ==========================================
// 3. CONTROLO FÍSICO
// ==========================================
void abrirPorta() {
    Serial.println("🟢 ACESSO CONCEDIDO! A destrancar porta...");
    digitalWrite(RELAY_PIN, HIGH);
    portaAutorizada = true;
    tempoAbertura = millis();
}

void trancarPortaAutomatica() {
    if (portaAutorizada && (millis() - tempoAbertura > TEMPO_DESTRANCADA)) {
        digitalWrite(RELAY_PIN, LOW);
        portaAutorizada = false;
        Serial.println("🔒 Porta trancada automaticamente.");
    }
}

// O ALARME CONTRA ARROMBAMENTO FÍSICO
void verificarSegurancaFisica() {
    // Assume que a porta fechada tem o íman colado (LOW). Aberta = HIGH.
    int estadoSensor = digitalRead(REED_SWITCH); 
    
    if (estadoSensor == HIGH && !portaAutorizada) {
        if (!alarmeAtivo) {
            Serial.println("🚨 INTRUSÃO DETETADA! PORTA ARROMBADA!");
            alarmeAtivo = true;
            
            if (WiFi.status() == WL_CONNECTED) {
                HTTPClient http;
                http.begin(ALARM_URL);
                http.addHeader("Content-Type", "application/json");
                http.addHeader("x-api-key", API_KEY); // Usa a chave também no alarme!
                http.POST("{}");
                http.end();
            }
        }
    } else if (estadoSensor == LOW) {
        alarmeAtivo = false; // O alarme desliga quando fecham a porta
    }
}

// ==========================================
// SETUP E LOOP PRINCIPAL
// ==========================================
void setup() {
    Serial.begin(115200);
    SPI.begin();
    rfid.PCD_Init();
    
    pinMode(RELAY_PIN, OUTPUT);
    digitalWrite(RELAY_PIN, LOW); // Garante que arranca trancada
    pinMode(REED_SWITCH, INPUT_PULLUP);

    WiFi.begin(ssid, password);
    Serial.print("A ligar ao Wi-Fi");
    while (WiFi.status() != WL_CONNECTED) {
        delay(500);
        Serial.print(".");
    }
    Serial.println("\nWi-Fi Ligado! Sistema Pronto.");
}

void processarCartao(String uidLido) {
    // 1. Gerar imediatamente a versão segura (Hash) do cartão
    String hashDoCartao = calcularSHA256(uidLido);
    
    if (WiFi.status() == WL_CONNECTED) {
        HTTPClient http;
        http.begin(SERVER_URL);
        http.addHeader("Content-Type", "application/json");
        
        // A MAGIA ACONTECE AQUI: Injeção da Chave de API
        http.addHeader("x-api-key", API_KEY); 

        String payload = "{\"uid\":\"" + uidLido + "\"}";
        int httpResponseCode = http.POST(payload);

        if (httpResponseCode > 0) {
            String resposta = http.getString();
            if (resposta.indexOf("\"authorized\":true") > 0) {
                abrirPorta();
                guardarHashNaCache(hashDoCartao); // Salva o Hash para quando a NET falhar
            } else {
                Serial.println("🔴 ACESSO NEGADO pelo Servidor Central.");
            }
        } else {
            // Se o Node.js estiver desligado, o POST falha (< 0)
            Serial.println("Falha ao contactar servidor. A entrar em Modo Degradado (Offline)...");
            if (verificarAcessoOffline(hashDoCartao)) {
                abrirPorta();
            } else {
                Serial.println("🔴 ACESSO NEGADO na Cache Offline.");
            }
        }
        http.end();
    } else {
        // Se a própria rede Wi-Fi foi abaixo
        Serial.println("Sem Rede. A entrar em Modo Degradado (Offline)...");
        if (verificarAcessoOffline(hashDoCartao)) {
            abrirPorta();
        } else {
            Serial.println("🔴 ACESSO NEGADO na Cache Offline.");
        }
    }
}

void loop() {
    trancarPortaAutomatica();
    verificarSegurancaFisica();

    if (rfid.PICC_IsNewCardPresent() && rfid.PICC_ReadCardSerial()) {
        String uidFormatado = "";
        for (byte i = 0; i < rfid.uid.size; i++) {
            uidFormatado += String(rfid.uid.uidByte[i] < 0x10 ? "0" : "");
            uidFormatado += String(rfid.uid.uidByte[i], HEX);
        }
        uidFormatado.toUpperCase();
        
        Serial.println("\nCartão lido fisicamente. A validar...");
        processarCartao(uidFormatado);

        rfid.PICC_HaltA();
        rfid.PCD_StopCrypto1();
    }
}