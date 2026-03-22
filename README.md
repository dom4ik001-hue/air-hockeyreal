# 🏒 АэроХоккей — Многопользовательская браузерная игра

Полностью production-ready игра с онлайн-мультиплеером, ELO-рейтингом и таблицей лидеров.

---

## Стек технологий

- **Frontend**: HTML5, CSS3 (Glassmorphism), Vanilla JS (ES Modules, Canvas API)
- **Backend**: Node.js, Express.js, Socket.io
- **Database**: MongoDB (Mongoose)
- **Auth**: JWT + bcrypt
- **Deploy**: Docker, Docker Compose, Nginx

---

## Быстрый старт (локально)

### 1. Установка зависимостей

```bash
npm install
```

### 2. Настройка .env

```bash
cp .env.production .env
```

Отредактируй `.env`:
- `MONGO_URI` — строка подключения к MongoDB
- `JWT_SECRET` — сгенерируй ключ:

```bash
node -e "console.log(require('crypto').randomBytes(64).toString('hex'))"
```

### 3. Запуск в development

```bash
npm run dev
```

Открой: http://localhost:3000

### 4. Запуск в production

```bash
npm start
```

---

## Деплой на VPS (Ubuntu 22.04/24.04)

### Шаг 1 — Обновление системы

```bash
ssh user@YOUR_SERVER_IP
sudo apt update && sudo apt upgrade -y
```

### Шаг 2 — Установка Docker

```bash
# Установка Docker
curl -fsSL https://get.docker.com | sh
sudo usermod -aG docker $USER
newgrp docker

# Проверка
docker --version
docker compose version
```

### Шаг 3 — Перенос проекта

**Вариант A — Git clone:**
```bash
git clone https://github.com/YOUR_USER/airhockey.git
cd airhockey
```

**Вариант B — SCP:**
```bash
# С локальной машины:
scp -r ./airhockey user@YOUR_SERVER_IP:/home/user/
```

### Шаг 4 — Настройка переменных окружения

```bash
cd airhockey
cp .env.production .env
nano .env
# Заполни MONGO_PASSWORD и JWT_SECRET
```

Генерация JWT_SECRET:
```bash
node -e "console.log(require('crypto').randomBytes(64).toString('hex'))"
```

### Шаг 5 — Запуск контейнеров

```bash
# Сборка и запуск в фоне
docker compose up -d --build

# Проверка статуса
docker compose ps

# Просмотр логов
docker compose logs -f app
```

### Шаг 6 — Инициализация БД

```bash
docker compose exec app node server/config/initDb.js
```

### Шаг 7 — Настройка домена в nginx.conf

Замени `server_name _;` на `server_name yourdomain.com www.yourdomain.com;`

```bash
nano nginx.conf
docker compose restart nginx
```

### Шаг 8 — SSL через Let's Encrypt (Certbot)

```bash
# Установка Certbot
sudo apt install certbot -y

# Получение сертификата (nginx должен быть запущен на 80 порту)
sudo certbot certonly --webroot \
  -w /var/www/certbot \
  -d yourdomain.com \
  -d www.yourdomain.com \
  --email your@email.com \
  --agree-tos

# Раскомментируй HTTPS блок в nginx.conf
nano nginx.conf

# Перезапуск nginx
docker compose restart nginx
```

**Автообновление сертификата:**
```bash
sudo crontab -e
# Добавь строку:
0 3 * * * certbot renew --quiet && docker compose -f /home/user/airhockey/docker-compose.yml restart nginx
```

---

## Управление контейнерами

```bash
# Остановка
docker compose down

# Остановка с удалением данных (ОСТОРОЖНО!)
docker compose down -v

# Перезапуск одного сервиса
docker compose restart app

# Просмотр логов
docker compose logs -f

# Обновление после изменений кода
docker compose up -d --build app
```

---

## Структура проекта

```
/
├── public/              # Статический фронтенд
│   ├── css/             # Стили (variables, reset, auth, menu, game, leaderboard)
│   ├── js/
│   │   ├── core/        # engine.js, physics.js, renderer.js, input.js
│   │   ├── entities/    # puck.js, mallet.js, board.js
│   │   ├── network/     # socket-client.js, api.js
│   │   ├── ui/          # navigation.js, modals.js, notifications.js
│   │   └── main.js      # Точка входа
│   └── index.html
├── server/
│   ├── config/          # db.js, initDb.js
│   ├── controllers/     # authController, userController, leaderboardController
│   ├── game/            # engine.js, roomManager.js, matchmaker.js, eloCalculator.js
│   ├── models/          # User.js, Match.js
│   ├── routes/          # authRoutes.js, apiRoutes.js
│   └── server.js        # Точка входа сервера
├── Dockerfile
├── docker-compose.yml
├── nginx.conf
├── .env.production
└── package.json
```

---

## ELO система

| Рейтинг | Победа | Поражение |
|---------|--------|-----------|
| < 1000  | +100..+143 (случайно) | -20 |
| 1000–1500 | +75..+130 (случайно) | -50 |
| > 1500  | Формула Faceit (K=50) | Формула Faceit |

- Минимальный ELO: 0 (защита от отрицательных значений)
- Дисконнект во время матча = техническое поражение

---

## API

| Метод | Путь | Описание |
|-------|------|----------|
| POST | /api/auth/register | Регистрация |
| POST | /api/auth/login | Вход (возвращает JWT) |
| GET  | /api/leaderboard | Топ-100 игроков |
| GET  | /api/user/profile | Профиль (требует JWT) |
