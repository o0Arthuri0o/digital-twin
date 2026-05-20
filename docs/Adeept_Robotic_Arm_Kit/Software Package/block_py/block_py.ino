/*
 * When BUZZER is 1, the infrared sensor cannot be used, but the BUZZER can be used
 * When BUZZER is 0, the infrared sensor can be used, but the BUZZER cannot be used
 *(you can change these values as you apply them)
*/

#define BUZZER   1

#include <ArduinoJson.h>
#if !BUZZER
#include <IRremote.h>
#endif
#include <Servo.h>


// OLED
#include <SSD1306Ascii.h>
#include <SSD1306AsciiWire.h>
// #define OLED_RESET     4
SSD1306AsciiWire display;




#if !BUZZER
char RECV_PIN = 11;//The definition of the infrared receiver pin 11
IRrecv irrecv(RECV_PIN);
decode_results results;
#endif
Servo myservo[5];



char line[60] = ""; // Serial data
int ret = 0;
char pingPin,trigPin;



void setup() {
  memset(line, 0, sizeof(line));
Serial.begin(115200); // Open the serial port and set the data transmission rate of 115200

}

void loop() {
  DynamicJsonDocument  jsonBuffer(100);
// Operate when the serial port is available
if (Serial.available() > 0) {
  
//  read incoming data: read up to \n, or up to 500 characters
ret = Serial.readBytesUntil('\n', line, 100);
//Serial.println(line);
  deserializeJson(jsonBuffer, line);
JsonObject root = jsonBuffer.as<JsonObject>();

  my_cmp(root);

memset(line, 0, sizeof(line));
}

}
void my_cmp(JsonObject root)
{
  /* parses the JSon data and executes the corresponding function */
  const char *python_char =  root["start"][0];
  const char *python_one =  root["start"][1];
  long one = root["start"][1],two = root["start"][2];
  long three = root["start"][3],four = root["start"][4];

  const char *Oledone = root["start"][1];
  
  //Serial.println(one);Serial.println(two);
  //Serial.println(one);
  if(strcmp(python_char,"setup")==0)
  {
      Serial.println("succes");
      memset(line, 0, sizeof(line));
  }

//OLED
  else if(strcmp(python_char,"OLED_init")==0)
  {
    Wire.begin();
    Wire.setClock(400000L);
    display.begin(&Adafruit128x64, 0x3C);
    display.setFont(Adafruit5x7);
  }
  else if(strcmp(python_char,"OLED_Ts")==0)
  {
    if (one == 1){
      display.set1X();
    }else if (one == 2){
      display.set2X();
    }else {
      display.set2X();
    }
  }

  else if(strcmp(python_char,"OLED_Cursor")==0)
  {
    display.setCursor(one, two); // (x,y)
    memset(line, 0, sizeof(line));
  }
  else if(strcmp(python_char,"OLED_Show")==0)
  {
    display.print(Oledone);
    memset(line, 0, sizeof(line));
  }
  else if(strcmp(python_char,"OLED_Clear")==0)
  {
    display.clear();
    memset(line, 0, sizeof(line));
  }
  else if(strcmp(python_char,"lcd_print")==0)
  {
    display.print(Oledone);
    memset(line, 0, sizeof(line));
  }



  
  else if(strcmp(python_char,"pinmode")==0)
  {
      int q,w;
      q = root["start"][1];
      w = root["start"][2];
      //input 0,output 1
      pinMode(one, two);
      memset(line, 0, sizeof(line));
      
  }
   else if(strcmp(python_char,"pulseIn")==0)
  {
      int q,w;
      q = root["start"][1];
      w = root["start"][2];
      //input 0,output 1
      Serial.println(pulseIn(one, two));
      memset(line, 0, sizeof(line));
      
  }
  else if(strcmp(python_char,"digitalWrite")==0)
  {
      int q,w;
      q = root["start"][1];
      w = root["start"][2];
      //input 0,output 1
      digitalWrite(one, two);
      memset(line, 0, sizeof(line));
      
  }
  else if(strcmp(python_char,"digitalRead")==0)
  {
      int q,w;
      q = root["start"][1];
      
      //input 0,output 1
      w = digitalRead(one);
      Serial.println(w);
      memset(line, 0, sizeof(line));
      
  }
  else if(strcmp(python_char,"analogRead")==0)
  {
      int q,w;
      q = root["start"][1];
      
      //input 0,output 1
      w = analogRead(one);
      //Serial.print("text:");
      Serial.println(w);
      memset(line, 0, sizeof(line));
      
  }
  else if(strcmp(python_char,"analogWrite")==0)
  {
    
      int q,w;
      //q = root["start"][1];
      //w = root["start"][2];
      //Serial.println(q);
      //input 0,output 1
      analogWrite(one, two);
      memset(line, 0, sizeof(line));
      
  }
  #if BUZZER
  else if(strcmp(python_char,"tone")==0)
  {
    
      int q,w;
      //q = root["start"][1];
      //w = root["start"][2];
      //Serial.println(q);
      //input 0,output 1
      tone(one, two);
      memset(line, 0, sizeof(line));
      
  }
  else if(strcmp(python_char,"noTone")==0)
  {
    
      int q,w;
      //q = root["start"][1];
      //w = root["start"][2];
      //Serial.println(q);
      //input 0,output 1
      noTone(one);
      memset(line, 0, sizeof(line));
      
  }
  #endif
  
  
  
  
   
  
  
  else if(strcmp(python_char,"servo_attach")==0)
  {
   
    myservo[one].attach(two);
    memset(line, 0, sizeof(line));
  }
  else if(strcmp(python_char,"servo_write")==0)
  {
    int q,w;
    

    
    myservo[one].write(two);
    
    memset(line, 0, sizeof(line));
  }
  #if !BUZZER
  else if(strcmp(python_char,"irrecv_init")==0)
  {
    int q,w;
    q = root["start"][1];
    w = root["start"][2];
    irrecv.enableIRIn();
    memset(line, 0, sizeof(line));
  }
  else if(strcmp(python_char,"irrecv_recv")==0)
  {
      if (irrecv.decode(&results)) 
      {
        int irr_data = results.value;
        int irr_recv = switch_irr(irr_data);
        Serial.println(irr_recv);
        //Serial.println(results.value, HEX);//Wrap output in hex receive code
        irrecv.resume(); //Receiving the next value
      }
      else
      {
        Serial.println(-1);  
      }
      memset(line, 0, sizeof(line));
  }
  #endif
  
  else if(strcmp(python_char,"ultra_init")==0)
  {
     pingPin = one;
     trigPin = two;
     pinMode(pingPin, INPUT); //Set the connection pin output mode Echo pin
     pinMode(trigPin, OUTPUT);//Set the connection pin output mode trog pin
    memset(line, 0, sizeof(line));
  }
   
  
  
  
  
  
}
