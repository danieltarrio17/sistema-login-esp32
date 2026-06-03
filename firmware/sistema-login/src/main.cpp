// ==========================================
// FICHEIRO: src/main.cpp
// ==========================================
#include <Arduino.h>
#include <SPI.h>
#include <MFRC522.h>
#include <Wire.h>
#include <LiquidCrystal_I2C.h>
#include <WiFi.h>
#include <HTTPClient.h>
#include <Preferences.h> // A nossa "Base de Dados" Offline
#include "Config.h"

// ==========================================
// PROTÓTIPOS DE FUNÇÃO
// ==========================================
void conectarWiFi();
bool verificarAcessoAPI(String uidCartao);
void guardarNaCache(String uidCartao);
bool verificarAcessoOffline(String uidCartao);
void executarAcao(bool autorizado, bool offline);
void gerirFechadura();
void monitorizarPortaFisica();
void atualizarEcra(String linha1, String linha2);

// ==========================================
// VARIÁVEIS GLOBAIS
// ==========================================
MFRC522 rfid(SS_PIN, RST_PIN);
LiquidCrystal_I2C lcd(0x27, 16, 2); 
Preferences preferencias; // Objeto para gerir a memória Flash

enum EstadoSistema { IDLE, VALIDACAO, ACAO };
EstadoSistema estadoAtual = IDLE;

unsigned long tempoAbertura = 0;
bool portaDestrancada = false;

void setup() {
  Serial.begin(115200);
  
  pinMode(RELAY_PIN, OUTPUT);
  digitalWrite(RELAY_PIN, HIGH);
  pinMode(REED_SWITCH_PIN, INPUT_PULLUP); 

  lcd.init();
  lcd.backlight();
  atualizarEcra("A Iniciar...", "");

  SPI.begin();
  rfid.PCD_Init();
  
  // Inicia a memória Flash criando uma "pasta" chamada "seguranca"
  preferencias.begin("seguranca", false);
  
  conectarWiFi();

  atualizarEcra("Sistema Pronto", "Aproxime o Cartao");
}

void loop() {
  monitorizarPortaFisica();
  gerirFechadura(); 

  switch (estadoAtual) {
    case IDLE:
      if (rfid.PICC_IsNewCardPresent() && rfid.PICC_ReadCardSerial()) {
        estadoAtual = VALIDACAO;
      }
      break;

    case VALIDACAO:
      {
        String uidLido = "";
        for (byte i = 0; i < rfid.uid.size; i++) {
          uidLido += String(rfid.uid.uidByte[i] < 0x10 ? "0" : "");
          uidLido += String(rfid.uid.uidByte[i], HEX);
        }
        uidLido.toUpperCase();
        
        Serial.println("Cartao detetado: " + uidLido);
        rfid.PICC_HaltA(); 
        
        bool autorizado = false;
        bool modoOffline = false;

        // VERIFICA SE TEM INTERNET
        if (WiFi.status() == WL_CONNECTED) {
          atualizarEcra("A Validar...", "(Online)");
          autorizado = verificarAcessoAPI(uidLido);
          modoOffline = false;
        } else {
          // MODO DEGRADADO (OFFLINE)
          atualizarEcra("A Validar...", "(Modo OFFLINE)");
          autorizado = verificarAcessoOffline(uidLido);
          modoOffline = true;
        }

        executarAcao(autorizado, modoOffline);
        estadoAtual = IDLE; 
      }
      break;

    case ACAO:
      break;
  }
}

// ==========================================
// FUNÇÕES DE REDE E CACHE (O CÉREBRO)
// ==========================================

bool verificarAcessoAPI(String uidCartao) {
  HTTPClient http;
  http.begin(API_URL);
  http.addHeader("Content-Type", "application/json");

  String jsonPayload = "{\"uid\":\"" + uidCartao + "\"}";
  int httpResponseCode = http.POST(jsonPayload);
  bool acessoAutorizado = false;

  if (httpResponseCode > 0) {
    String response = http.getString();
    if (response.indexOf("\"authorized\":true") > 0 || response.indexOf("\"authorized\": true") > 0) {
      acessoAutorizado = true;
      guardarNaCache(uidCartao); // <--- Guarda o cartão autorizado para quando a rede falhar!
    }
  } else {
    Serial.println("Erro no Servidor. A forçar verificação offline...");
    return verificarAcessoOffline(uidCartao);
  }
  
  http.end();
  return acessoAutorizado;
}

void guardarNaCache(String uidCartao) {
  // Vai buscar a lista de cartões já guardados
  String cacheAtual = preferencias.getString("uids_validos", "");
  
  // Se o cartão ainda não está na lista, adiciona-o
  if (cacheAtual.indexOf(uidCartao) == -1) {
    // Evita que a memória encha infinitamente limitando a string
    if (cacheAtual.length() > 200) cacheAtual = ""; 
    
    cacheAtual += uidCartao + ",";
    preferencias.putString("uids_validos", cacheAtual);
    Serial.println(">>> Cartao guardado na Cache Offline interna!");
  }
}

bool verificarAcessoOffline(String uidCartao) {
  String cacheAtual = preferencias.getString("uids_validos", "");
  
  if (cacheAtual.indexOf(uidCartao) >= 0) {
    Serial.println(">>> Autorizado pela Memoria Interna (Sem Wi-Fi)!");
    return true;
  } else {
    Serial.println(">>> Negado (Nao encontrado na memoria interna).");
    return false;
  }
}

void conectarWiFi() {
  Serial.print("A ligar ao Wi-Fi...");
  WiFi.begin(WIFI_SSID, WIFI_PASSWORD);
  int tentativas = 0;
  
  while (WiFi.status() != WL_CONNECTED && tentativas < 20) {
    delay(500);
    Serial.print(".");
    tentativas++;
  }
  
  if (WiFi.status() == WL_CONNECTED) {
    Serial.println("\nWi-Fi Conectado!");
  } else {
    Serial.println("\nFalha de Wi-Fi! A iniciar em MODO OFFLINE.");
  }
}

void executarAcao(bool autorizado, bool offline) {
  lcd.clear();
  if (autorizado) {
    lcd.print("Acesso Concedido");
    if (offline) {
      lcd.setCursor(0, 1);
      lcd.print("(Usando Cache)");
    }
    digitalWrite(RELAY_PIN, LOW); 
    portaDestrancada = true;
    tempoAbertura = millis(); 
  } else {
    lcd.print("Acesso Negado!");
    delay(2000); 
    atualizarEcra("Sistema Pronto", "Aproxime o Cartao");
  }
}

void gerirFechadura() {
  if (portaDestrancada) {
    if (millis() - tempoAbertura >= TEMPO_PORTA_ABERTA) {
      digitalWrite(RELAY_PIN, HIGH); 
      portaDestrancada = false;
      atualizarEcra("Sistema Pronto", "Aproxime o Cartao");
    }
  }
}

void monitorizarPortaFisica() {
  static bool estadoAnteriorPorta = LOW; 
  bool estadoAtualPorta = digitalRead(REED_SWITCH_PIN);
  
  if (estadoAtualPorta != estadoAnteriorPorta) {
    if (estadoAtualPorta == HIGH) {
      Serial.println("ALERTA: Porta aberta fisicamente!");
    }
    estadoAnteriorPorta = estadoAtualPorta;
    delay(50); 
  }
}

void atualizarEcra(String linha1, String linha2) {
  lcd.clear();
  lcd.setCursor(0, 0);
  lcd.print(linha1);
  lcd.setCursor(0, 1);
  lcd.print(linha2);
}