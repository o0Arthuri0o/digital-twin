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
