# Rutube Downloader — Руководство пользователя

## 📋 Описание

`Rutube Downloader` — кроссплатформенное приложение для скачивания видео с популярных платформ:

| Платформа | Протокол | Поддержка |
|-----------|----------|-----------|
| **RuTube** | HLS (m3u8) | ✅ Видео, private-ссылки |
| **VK Video** | HLS (m3u8) | ✅ Видео от пользователей/каналов, live-трансляции |
| **Одноклассники** | HLS (m3u8) | ✅ Видео и embed |
| **YouTube** | yt-dlp | ✅ Все форматы, плейлисты (опционально) |
| **Aser.pro** | HLS (m3u8) | ✅ Стримы и видео |

---

## Быстрый старт

### Установка

```powershell
# 1. Клонируйте репозиторий
git clone https://github.com/username/rutube-downloader.git
cd rutube-downloader

# 2. Установите зависимости
npm install
```

### Запуск

#### CLI режим (консоль)

```powershell
# Скачивание одного видео
node index.js <url>

# Скачивание нескольких видео
node index.js <url1> <url2> <url3>

# С пользовательским названием файла
node index.js https://rutube.ru/video/abc123/ -t "Мое видео"

# С выбором качества
node index.js https://vkvideo.ru/video-123_456 -q

# Извлечение аудио
node index.js https://rutube.ru/video/abc123/ -a mp3
```

#### Electron GUI (графический интерфейс)

```powershell
npm start
```

---

## ⚙️ Параметры запуска

| Параметр | Описание | По умолчанию |
|----------|----------|--------------|
| `-t "название"` | Задать имя выходного файла | Берётся с платформы |
| `-p N` | Количество параллельных потоков скачивания | 5 |
| `-f формат` | Выходной формат: `mp4`, `mkv`, `avi`, `mov`, `webm` | `mp4` |
| `-a формат` | Извлечь аудио после скачивания: `mp3`, `wav`, `flac` | — |
| `-q` | Ручной выбор качества перед скачиванием | Авто (лучшее) |
| `-l язык` | Язык интерфейса: `ru`, `en`, `zh` | `ru` |
| `-h` | Показать справку | — |

### Примеры сложных сценариев

```powershell
# Скачать видео с VK в MKV
node index.js https://vkvideo.ru/video-18255722_456244249 -f mkv

# Скачать 3 видео с разными названиями
node index.js \
  https://rutube.ru/video/aaa/ -t "Видео 1" \
  https://vkvideo.ru/video-bbb/ -t "Видео 2" \
  https://ok.ru/video/ccc/ -t "Видео 3"

# Скачать с извлечением аудио FLAC
node index.js https://rutube.ru/video/abc123/ -a flac

# Скачивание с ограничением потоков (для стабильности)
node index.js https://vkvideo.ru/video-123_456 -p 2

# Скачивание с выбором качества
node index.js https://rutube.ru/video/abc123/ -q
```

---

## 📂 Поддерживаемые URL

### RuTube
```
https://rutube.ru/video/<video_id>/
https://rutube.ru/video/private/<video_id>/?p=<share_token>
```

### VK Video
```
# Видео от пользователя
https://vk.com/video643853031_456271286
https://vkvideo.ru/video643853031_456271286

# Видео от канала
https://vk.com/video-18255722_456244249
https://vkvideo.ru/video-18255722_456244249

# Прямые трансляции (live)
https://vkvideo.ru/live-183207497_456242848

# Ссылки с плейлистов
https://vkvideo.ru/playlist/62764098_2/video62764098_456239055
```

### Одноклассники
```
https://ok.ru/video/123456
https://ok.ru/videoembed/123456
```

### YouTube
```
https://www.youtube.com/watch?v=<video_id>
https://youtu.be/<video_id>
https://www.youtube.com/shorts/<video_id>
```

### Aser.pro
```
https://aser.pro/content/stream/<path>/hls/index.m3u8
```

---

## 🎬 Доступные форматы

### Видео форматы
| Формат | Расширение | Описание |
|--------|-----------|----------|
| MP4 | `.mp4` | Универсальный, максимальная совместимость |
| MKV | `.mkv` | Поддержка множества дорожек |
| AVI | `.avi` | Старый формат |
| MOV | `.mov` | Формат Apple |
| WebM | `.webm` | Открытый формат |

### Аудио форматы
| Формат | Расширение | Описание |
|--------|-----------|----------|
| MP3 | `.mp3` | Сжатый, универсальный |
| WAV | `.wav` | Без потерь качества |
| FLAC | `.flac` | Сжатие без потерь |

---

## 🔧 Настройки

Настройки сохраняются в файле `settings.json` в папке данных приложения:

| Параметр | Описание |
|----------|----------|
| `downloadParallel` | Количество параллельных загрузок |
| `lastFolder` | Последняя папка сохранения |
| `defaultFormat` | Формат по умолчанию |
| `defaultAudioFormat` | Аудио-формат по умолчанию |

### Изменение настроек

1. Откройте `settings.json` в текстовом редакторе
2. Измените нужные параметры
3. Сохраните файл
4. Перезапустите приложение

---

## 📊 Структура файлов

```
rutube-downloader/
├── index.js              # Точка входа CLI
├── app/                  # Electron GUI
├── src/                  # Исходный код
│   ├── videoProviders/   # Загрузчики для каждой платформы
│   │   ├── vk.js         # VK Video
│   │   ├── rutube.js     # RuTube
│   │   ├── ok.js         # Одноклассники
│   │   ├── youtube.js    # YouTube
│   │   └── aserPro.js    # Aser.pro
│   ├── downloadFile.js   # Логика скачивания
│   ├── FFmpeg.js         # Конвертация видео
│   ├── m3u8Utils.js      # Работа с HLS
│   ├── parallelFor.js    # Параллельное скачивание
│   └── locales/          # Переводы (ru, en, zh)
├── bin/                  # Бинарники (ffmpeg, yt-dlp)
├── package.json
└── Manual.md             # Этот файл
```

---

## ❓ Решение проблем

### Видео скачивается частично / прерывается

**Причины и решения:**

1. **Проблема с VK Video (rate limiting)**
   - VK ограничивает количество одновременных подключений
   - **Решение:** Уменьшите параллельность: `-p 2` или `-p 3`
   ```powershell
   node index.js https://vkvideo.ru/video-123_456 -p 2
   ```

2. **Нестабильное интернет-соединение**
   - **Решение:** Уменьшите `downloadParallel` в `settings.json`
   ```json
   {
     "downloadParallel": 2
   }
   ```

3. **Ошибки сегментов**
   - Скрипт автоматически повторяет скачивание до 5 раз
   - Если ошибка повторяется — проверьте соединение

### Ошибка "Не удалось получить HLS ссылку"

- Видео может быть удалено или ограничено по геополитике
- Проверьте, что видео доступно в браузере
- Для YouTube может потребоваться VPN

### Ошибка "yt-dlp не найден" (YouTube)

```
YouTube: yt-dlp not found. Run npm install again.
```

**Решение:**
```powershell
# Удалите node_modules и переустановите
rm -r node_modules
npm install
```

### FFmpeg не найден / ошибка конвертации

- Убедитесь, что `bin/ffmpeg.exe` присутствует
- Добавьте ffmpeg в PATH системы
- Проверьте, что ffmpeg не заблокирован антивирусом

### Медленное скачивание

1. **Увеличьте параллельность:**
   ```powershell
   node index.js <url> -p 10
   ```

2. **Используйте проводник (VPN)** для YouTube и некоторых платформ

3. **Проверьте скорость соединения**

### MaxListenersExceededWarning

Предупреждение не влияет на работу. Исправлено в последних версиях.

---

## 🛠️ Для разработчиков

### Структура проекта

```
├── index.js          # CLI entry point
├── app/              # Electron desktop app
└── src/
    ├── videoProviders/   # Platform-specific downloaders
    ├── downloadFile.js   # Segment download & merge
    ├── FFmpeg.js         # Video conversion
    └── m3u8Utils.js      # HLS manifest parsing
```

### Добавление новой платформы

1. Создайте файл `src/videoProviders/<name>.js`
2. Реализуйте интерфейс:
   ```javascript
   module.exports = {
     mayUse: url => /regex/.test(url),
     loadVideo: async cfg => {
       // cfg.url, cfg.title, cfg.video, cfg.quality, cfg.parallelNum
       // Возвращает [filename, quality]
     }
   };
   ```
3. Платформа автоматически подключится через `videoProviders/index.js`

### Локализация

Файлы переводов: `src/locales/{ru,en,zh}.json`

```json
{
  "error.segmentFailed": "ОШИБКА Сегмент не скачан",
  "cli.download": "СКАЧИВАНИЕ:"
}
```

---

## 📝 Логи

При ошибке скачивания выводится:
```
Ошибка скачивания сегмента #42: HTTP 429 Too Many Requests
```

Номер сегмента и причина помогут диагностировать проблему.

---

## 📄 Лицензия

MIT

---

## 👥 Авторы

- **Дуплей Максим Игоревич** — основной разработчик
- **ProjectSoft** — проект
- **valera-steb** — контрибьютор

---

## 🔗 Ссылки

- [GitHub](https://github.com/)
- [Документация Koda](https://docs.kodacode.ru)
- [Сообщество Telegram](https://t.me/kodacommunity)

