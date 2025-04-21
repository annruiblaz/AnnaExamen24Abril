// añadimos librerias
#include <ESP32Servo.h>        //para trabajar con el servo
#include <LiquidCrystal_I2C.h> //para el i2c del lcd
#include <WiFi.h>              //para utilizar wifi
#include <PubSubClient.h>      //y trabjar con el MQTT
#include <ArduinoJson.h>//para trabajar con el obj JSON q trae los datos del topico

// config wifi
const char *ssid = "Wokwi-GUEST";
const char *password = "";

// config para MQTT con adafruit
const char *mqttHost = "io.adafruit.com";
const int mqttPort = 1883;
const char *mqttUser = "anna_dev";
const char *mqttPassword = "";
const char *mqttTopic = "anna_dev/feeds/examenServo";

// instancia del cliente wifi
WiFiClient espClient;
PubSubClient mqttClient(espClient); // y del MQTT

// creamos la instancias para los servos
Servo servo_1;
Servo servo_2;
// y le asignamos el pin
int pinServo_1 = 13;
int pinServo_2 = 32;

// asignamos el pin al led
int pinLed = 2;

// creamos el obj para el lcd (direccion d i2c, columnas del lcd, filas del lcd)
LiquidCrystal_I2C lcd(0x27, 16, 2);

// inicializamos la posicion (grados) del servo
int pos = 0;

// funcion q conecta al broker MQTT
void connectMQTT()
{
  Serial.println("Conectando a MQTT...");

  // creamos un clientID unico para evitar conflictos en AdafruitIO
  String clientId = "ESP32-" + String(random(1000, 9999));

  // bucle mientras no hay conexion mqtt
  while (!mqttClient.connected())
  {
    // si consigue conectarse con exito
    if (mqttClient.connect(clientId.c_str(), mqttUser, mqttPassword))
    {
      Serial.println("Conectado a MQTT!");
      mqttClient.subscribe(mqttTopic); // se suscribe al feed
      Serial.print("Suscrito a:");
      Serial.println(mqttTopic);
    }
    else
    {
      // si hay error, esperamos 5s y volvemos a intentar
      Serial.print("Error MQTT:");
      Serial.println(mqttClient.state());
      Serial.println("Reintentando en 5 segundos...");
      delay(5000);
    }
  }
}

// callback cuando llega un msj MQTT
void mqttCallback(char *topic, byte *payload, unsigned int length)
{
  Serial.print("Mensaje recibido en: ");
  Serial.println(topic);

  String message = ""; // variable para almacenar el msj
  // itera sobre los bytes del payload y los transforma en el caracter q le corresponde
  for (int i = 0; i < length; i++)
  {
    message += (char)payload[i]; // contruimos el msj caracter a caracter
  }

  Serial.print("Contenido: ");
  Serial.println(message);

  //definimos la capacidad del documento JSON
  const size_t capacidad = JSON_OBJECT_SIZE(4) + 60;
  DynamicJsonDocument doc(capacidad);//creamos la instancia d la libreria json y le asignamos la capcidad

  //intenta deserializar el msj con el obj json
  DeserializationError error = deserializeJson(doc, message);
  if(error) {
    Serial.print("Error al parsear JSON");
    Serial.println(error.c_str());
    return;
  }

  //Extraemos los valores del json a variables
  float theta1 = doc["theta1"];
  float theta2 = doc["theta2"];
  String modo = doc["modo"];

  servo_1.write(theta1);
  servo_2.write(theta2);

  lcd.clear();
  lcd.setCursor(0, 0);
  lcd.print("Theta1: " + String(theta1));
  lcd.setCursor(0, 1);
  lcd.print("Theta2: " + String(theta2));

  // enciende o apaga el led segun el msj recibido
  if (modo == "analitica")
  {
    digitalWrite(pinLed, HIGH);
  }
  else
  {
    digitalWrite(pinLed, LOW);
  }

  Serial.println("Angulos recibidos: " + String(theta1) + ", " + String(theta2));
}

void setup()
{
  // establecemos los bits x segundo para la transmisión d datos (consola)
  Serial.begin(115200);

  // inicializamos la posicion del servo
  servo_1.attach(pinServo_1, 500, 2500);
  servo_2.attach(pinServo_2, 500, 2500);

  // inicializamos la pantalla lcd
  lcd.init();
  // y encendemos la luz
  lcd.backlight();

  // establecemos el led como salida
  pinMode(pinLed, OUTPUT);

  // conectamos al wifi
  WiFi.begin(ssid, password);
  Serial.print("Conectando a WiFi...");
  lcd.setCursor(0,0);
  lcd.print("Conectando a ");
  lcd.setCursor(0,1);
  lcd.print("WiFi...");

  // mientras no tenga conexion wifi
  while (WiFi.status() != WL_CONNECTED)
  {
    delay(500); // espera medio segundo y añade un . al printeo x consola
    Serial.print(".");
  }

  // una vez conectado, avisamos x consola
  Serial.println("\n WiFi conectado!");
  lcd.clear();
  lcd.setCursor(0,0);
  lcd.print("WiFi conectado");

  // config del server mqtt
  mqttClient.setServer(mqttHost, mqttPort);
  mqttClient.setCallback(mqttCallback);

  // intenta conectar a mqtt
  connectMQTT();
}

void loop()
{
  if(!mqttClient.connected()) {
    connectMQTT();
  }

  mqttClient.loop();
}
