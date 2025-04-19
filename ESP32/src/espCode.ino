//añadimos librerias
#include <ESP32Servo.h>//para trabajar con el servo
#include <LiquidCrystal_I2C.h>//para el i2c del lcd

//creamos la instancia al servo
Servo servo;
//y le asignamos el pin
int pinServo_1 = 13;
int pinServo_2 = 32;

//creamos el obj para el lcd (direccion d i2c, columnas del lcd, filas del lcd)
LiquidCrystal_I2C lcd(0x27, 16, 2);

//inicializamos la posicion (grados) del servo
int pos = 0;


void setup() {
  //establecemos los bits x segundo para la transmisión d datos (consola)
  Serial.begin(115200);

  //inicializamos la posicion del servo
  servo.attach(pinServo_1, 500, 2500);
  servo.attach(pinServo_2, 500, 2500);

  //inicializamos la pantalla lcd
  lcd.init();
  //y encendemos la luz
  lcd.backlight();
}

void loop() {
  //**LCD
  lcd.clear();
  lcd.setCursor(4, 0);
  lcd.print("PRUEBA");
 
  lcd.setCursor(6, 1);
  lcd.print(":))");
 
  delay(2000);


  //**Servos
  //los movemos d 0 a 180º para comprobar q funcipna
  //Ciclo que posicionara el servo desde 0 hsta 180 grados
  for (pos = 0; pos <= 180; pos += 1) {
    //Movemos el servo a los grados que le entreguemos
    servo.write(pos);
    //Esperamos 15 milisegundos
    delay(15);
  }
  //Ciclo que posicionara el servo desde 180 hsta 0 grados
  for (pos = 180; pos >= 0; pos -= 1) {
    //Movemos el servo a los grados que le entreguemos
    servo.write(pos);
    //Esperamos 15 milisegundos
    delay(15);
  }
}
