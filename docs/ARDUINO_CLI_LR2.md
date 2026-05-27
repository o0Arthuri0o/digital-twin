# Arduino CLI: ЛР2 OLED

Команды рассчитаны на подключенную плату на `/dev/ttyUSB0`, которая определяется как USB Serial и прошивается как `arduino:avr:nano:cpu=atmega328old`. Скорость Serial — `9600`.

Сервоприводы роборуки подключаются к цифровым пинам Arduino:

| Канал | Пин Arduino | Диапазон |
|---|---:|---:|
| A | D9 | 0–180 |
| B | D6 | 0–180 |
| C | D5 | 0–180 |
| D | D3 | 0–180 |
| E | D11 | 35–90 |

Для текущей механики захвата канал `E` читается так: `E35` — захват открыт, `E90` — захват закрыт.

## Подготовка

```bash
arduino-cli core update-index
arduino-cli core install arduino:avr
arduino-cli lib install "Adafruit GFX Library"
arduino-cli lib install "Adafruit SSD1306"
arduino-cli lib install "Adafruit BusIO"
arduino-cli lib install Servo
```

## Поиск порта

```bash
arduino-cli board list
```

Дальше замените `<PORT>` на найденный порт. В текущей проверке использовался `/dev/ttyUSB0`.

## Компиляция

```bash
arduino-cli compile --fqbn arduino:avr:nano:cpu=atmega328old arduino/oled_lab2
```

## Загрузка

```bash
arduino-cli upload -p <PORT> --fqbn arduino:avr:nano:cpu=atmega328old arduino/oled_lab2
```

Если используется настоящая Arduino Uno, можно заменить FQBN на `arduino:avr:uno`.

## Проверка через монитор

```bash
arduino-cli monitor -p <PORT> -c baudrate=9600
```

Команды для ручной проверки:

```text
Актуаторы:
A90B90C90D90E90;
SERVO_STATUS?;
SERVO_HOME;

OLED:
OLED_TEXT:Khusainov AA 4241v;
OLED_READ?;
OLED_ANGLES?;
OLED_BITMAP?;
```

Ожидаемый ответ на `OLED_READ?;`:

```text
%Khusainov AA 4241v%;
```

Ожидаемый ответ на пакет сервоприводов:

```text
OK SERVOS A90B90C90D90E90;
```

Диагностика сервоприводов:

```text
SERVO_STATUS?;
```

До первой servo-команды ожидается `attached=0`, после `SERVO_HOME;` или пакета `A...E...;` — `attached=1`:

```text
OK SERVO_STATUS attached=1 pins=A:D9=90,B:D6=90,C:D5=90,D:D3=90,E:D11=90;
```

Команда `SERVO_HOME;` подключает сервоприводы и выставляет документированное home-положение `90`:

```text
OK SERVOS A90B90C90D90E90;
```

Для отдельной проверки захвата:

```text
A90B90C90D90E35;  // открыть
A90B90C90D90E90;  // закрыть
```

`OLED_ANGLES?;` включает режим live-отображения углов. После этого каждый принятый пакет сервоприводов обновляет OLED строкой вида:

```text
A100 B120 C60 D80 E70
```

Чтобы вернуть обычный текстовый режим, отправьте:

```text
OLED_TEXT:Khusainov AA 4241v;
```

## Диагностика без роборуки

Если физической модели сейчас нет, можно проверить контур связи по Serial:

1. Откройте монитор на `9600`.
2. Отправьте `OLED_ANGLES?;` и убедитесь, что пришло `%A90 B90 C90 D90 E90%;`.
3. Отправьте `A100B120C60D80E70;`.
4. Если пришло `OK SERVOS A100B120C60D80E70;`, значит браузер/Serial/парсер Arduino работают, а `Servo.write(...)` был вызван.

Если позже с подключенной роборукой есть `OK SERVOS ...`, но движения нет, проверяйте не прошивку, а питание и подключение сервоприводов: отдельные 5V для серв, общий GND с Arduino и совпадение пинов `D9/D6/D5/D3/D11`.
