#include <Wire.h>
#include <Servo.h>
#include <Adafruit_GFX.h>
#include <Adafruit_SSD1306.h>
#include <avr/pgmspace.h>
#include <string.h>
#include "arduino_image.h"

#define SCREEN_WIDTH 128
#define SCREEN_HEIGHT 64
#define OLED_RESET -1
#define OLED_ADDRESS 0x3C
#define OLED_REQUIRED false
#define SERIAL_BAUD 9600
#define COMMAND_BUFFER_SIZE 97
#define OLED_TEXT_BUFFER_SIZE 81

const byte SERVO_COUNT = 5;
const byte servoPins[SERVO_COUNT] = {9, 6, 5, 3, 11};
const char servoIds[SERVO_COUNT] = {'A', 'B', 'C', 'D', 'E'};
const int servoMin[SERVO_COUNT] = {0, 0, 0, 0, 35};
const int servoMax[SERVO_COUNT] = {180, 180, 180, 180, 90};
int servoAngles[SERVO_COUNT] = {90, 90, 90, 90, 90};
Servo servos[SERVO_COUNT];
bool servosAttached = false;

Adafruit_SSD1306 display(SCREEN_WIDTH, SCREEN_HEIGHT, &Wire, OLED_RESET);

enum OledMode {
  OLED_MODE_TEXT,
  OLED_MODE_BITMAP,
  OLED_MODE_ANGLES
};

char currentText[OLED_TEXT_BUFFER_SIZE] = "Khusainov AA 4241v";
OledMode oledMode = OLED_MODE_TEXT;
bool displayAvailable = false;
char serialBuffer[COMMAND_BUFFER_SIZE] = "";
byte serialBufferLength = 0;
bool discardUntilTerminator = false;

void showText(const char *text) {
  if (!displayAvailable) return;

  display.clearDisplay();
  display.setTextColor(SSD1306_WHITE);
  display.setTextSize(1);
  display.setCursor(0, 0);
  display.print(text);
  display.display();
}

void showBitmap() {
  if (!displayAvailable) return;

  display.clearDisplay();
  display.drawBitmap(0, 0, myBitmap, SCREEN_WIDTH, SCREEN_HEIGHT, SSD1306_WHITE);
  display.display();
}

void sendCurrentText() {
  Serial.print('%');
  Serial.print(currentText);
  Serial.println("%;");
}

void sendImage() {
  const int bufferSize = 32;
  byte buffer[bufferSize];

  Serial.print("#OLED_BITMAP:");
  Serial.println(myBitmapSize);

  for (unsigned int i = 0; i < myBitmapSize; i += bufferSize) {
    int chunkSize = min(bufferSize, (int)(myBitmapSize - i));
    memcpy_P(buffer, &myBitmap[i], chunkSize);
    Serial.write(buffer, chunkSize);
  }
}

void sendServoPacket() {
  for (byte i = 0; i < SERVO_COUNT; i++) {
    Serial.print(servoIds[i]);
    Serial.print(servoAngles[i]);
  }

  Serial.print(';');
}

void buildAnglesText(char *target, size_t targetSize) {
  target[0] = '\0';

  for (byte i = 0; i < SERVO_COUNT; i++) {
    char part[8];
    snprintf(part, sizeof(part), "%c%d", servoIds[i], servoAngles[i]);

    if (i > 0) {
      strncat(target, " ", targetSize - strlen(target) - 1);
    }
    strncat(target, part, targetSize - strlen(target) - 1);
  }
}

void showAngles() {
  buildAnglesText(currentText, sizeof(currentText));
  showText(currentText);
  sendCurrentText();
}

bool parseChannel(const char *command, char channel, int minValue, int maxValue, int &value) {
  const char *cursor = strchr(command, channel);
  if (cursor == NULL) return false;

  cursor++;
  if (!isDigit(*cursor)) return false;

  int parsed = 0;
  while (isDigit(*cursor)) {
    parsed = parsed * 10 + (*cursor - '0');
    cursor++;
  }

  value = constrain(parsed, minValue, maxValue);
  return true;
}

bool parseServoPacket(const char *command, int nextAngles[SERVO_COUNT]) {
  for (byte i = 0; i < SERVO_COUNT; i++) {
    if (!parseChannel(command, servoIds[i], servoMin[i], servoMax[i], nextAngles[i])) {
      return false;
    }
  }

  return true;
}

void applyServoAngles(const int nextAngles[SERVO_COUNT]) {
  setupServos();

  for (byte i = 0; i < SERVO_COUNT; i++) {
    servoAngles[i] = nextAngles[i];
    servos[i].write(servoAngles[i]);
  }

  if (oledMode == OLED_MODE_ANGLES) {
    showAngles();
  }
}

void sendServoStatus() {
  Serial.print("OK SERVOS ");
  sendServoPacket();
  Serial.println();
}

void setupServos() {
  if (servosAttached) return;

  for (byte i = 0; i < SERVO_COUNT; i++) {
    servos[i].attach(servoPins[i]);
  }

  servosAttached = true;
}

char *trimCommand(char *command) {
  while (*command == ' ' || *command == '\t') {
    command++;
  }

  char *end = command + strlen(command);
  while (end > command && (end[-1] == ' ' || end[-1] == '\t')) {
    end--;
  }
  *end = '\0';

  return command;
}

void handleCommand(char *rawCommand) {
  char *command = trimCommand(rawCommand);
  if (command[0] == '\0') return;

  if (strncmp(command, "OLED_TEXT:", 10) == 0) {
    oledMode = OLED_MODE_TEXT;
    strncpy(currentText, command + 10, sizeof(currentText) - 1);
    currentText[sizeof(currentText) - 1] = '\0';
    trimCommand(currentText);
    showText(currentText);
    sendCurrentText();
    return;
  }

  if (strcmp(command, "OLED_READ?") == 0) {
    sendCurrentText();
    return;
  }

  if (strcmp(command, "OLED_ANGLES?") == 0) {
    oledMode = OLED_MODE_ANGLES;
    showAngles();
    return;
  }

  if (strcmp(command, "OLED_BITMAP?") == 0) {
    oledMode = OLED_MODE_BITMAP;
    showBitmap();
    sendImage();
    return;
  }

  if (command[0] == 'A') {
    int nextAngles[SERVO_COUNT];
    if (!parseServoPacket(command, nextAngles)) {
      Serial.print("ERR invalid servo packet: ");
      Serial.println(command);
      return;
    }

    applyServoAngles(nextAngles);
    sendServoStatus();
    return;
  }

  Serial.print("ERR unknown command: ");
  Serial.println(command);
}

void setup() {
  Serial.begin(SERIAL_BAUD);
  Serial.setTimeout(50);

  displayAvailable = display.begin(SSD1306_SWITCHCAPVCC, OLED_ADDRESS);

  if (!displayAvailable) {
    Serial.println("WARN SSD1306 not found, mock mode");
    if (OLED_REQUIRED) {
      Serial.println("ERR SSD1306 init failed");
      while (true) {
        delay(1000);
      }
    }
  }

  if (displayAvailable) {
    showText(currentText);
    Serial.println("OK OLED ready");
  } else {
    Serial.println("OK OLED mock ready");
  }

  sendCurrentText();
}

void loop() {
  while (Serial.available() > 0) {
    char c = Serial.read();

    if (c == ';') {
      if (discardUntilTerminator) {
        discardUntilTerminator = false;
        serialBufferLength = 0;
        serialBuffer[0] = '\0';
        continue;
      }

      serialBuffer[serialBufferLength] = '\0';
      handleCommand(serialBuffer);
      serialBufferLength = 0;
      serialBuffer[0] = '\0';
      continue;
    }

    if (c == '\n' || c == '\r') continue;

    if (discardUntilTerminator) {
      continue;
    }

    if (serialBufferLength < COMMAND_BUFFER_SIZE - 1) {
      serialBuffer[serialBufferLength] = c;
      serialBufferLength++;
      serialBuffer[serialBufferLength] = '\0';
    } else {
      discardUntilTerminator = true;
      serialBufferLength = 0;
      serialBuffer[0] = '\0';
      Serial.println("ERR command too long");
    }
  }
}
