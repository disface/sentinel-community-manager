# 🛡️ Сводный инженерный аудит Sentinel Community Manager (GitHub Open Source) — Claude Opus 4.8

**Дата актуализации**: 2026-09-22 15:28:43  
**Модель**: `claude-opus-4-8` (Claude Opus 4.8 Thinking via JustDoWork)  
**Архитектура аудита**: Focused Micro-Batching (TTFT < 35s)  
**Целевой проект**: Общедоступная версия десктопного клиента Sentinel Community Manager (`c:\CODE\SENTINEL_CM`)  
**Репозиторий GitHub**: `https://github.com/disface/sentinel-community-manager`  
**Стек**: Electron 34, React 19, TypeScript, Vite, Tailwind CSS, Bots Long Poll 5.199, Windows DPAPI  

---

## МОДУЛЬ 1: БЕЗОПАСНОСТЬ ХРАНИЛИЩА, WINDOWS DPAPI И УТЕЧКИ ТОКЕНОВ

ВЕРДИКТ: Хранилище небезопасно для продакшена. Токен VK утекает на диск в plaintext минимум в двух сценариях (недоступность и сбой DPAPI), при этом расшифровка через `safeStorage` может вызываться до `app.whenReady()`, что делает результат `isEncryptionAvailable()` недетерминированным. Записи неатомарны — любой сбой питания оставляет 0-байтные/битые `config.json`/`templates.json`/`activity.json`. Требуется срочный рефакторинг записи токена и всех файловых операций.

P0 — критические

- `129-150` Plaintext-утечка токена при недоступном DPAPI. Если `isEncAvailable === false`, блок шифрования пропускается, `toSave.token` не удаляется и записывается открытым текстом в `config.json` (`147`). Токен VK — фактически пароль от сообщества.
- `137-144` Plaintext-утечка при сбое шифрования. Если `encryptString` бросает исключение, `delete toSave.token` (`140`) не выполняется, но запись на `147` всё равно происходит — токен пишется открытым текстом.
- `55-114 / 41-53` Использование `safeStorage` до `app.whenReady()`. Конструктор синхронно вызывает `loadConfig()` → `safeStorage.isEncryptionAvailable()` (`87`) и `decryptString` (`94`). Если `StoreService` создаётся до `whenReady()`, на ряде платформ (Linux/keyring, ранняя инициализация Windows) API либо бросает, либо возвращает `false`. Итог: расшифровка молча падает (`95-98`), токен теряется, а последующий `saveConfig` при `false` пишет plaintext.
- `93-98` Тихая потеря/деградация токена. При ошибке расшифровки `token = parsed.token || ''` — токен становится пустым в памяти. Любой последующий `saveConfig` затирает валидный `encryptedToken` мусорным состоянием (`126`: `toSave.token=''` пишется, старый шифротекст частично перетирается). Данные теряются без предупреждения пользователя.

P1 — высокие

- `147, 179, 226, 242, 257, 266` Неатомарная запись. Прямой `writeFileSync` усекает файл и пишет по месту. Сбой/отключение питания в момент записи → пустой или частично записанный JSON, который затем не парсится (`81, 159, 207`) и молча заменяется дефолтами → потеря всех шаблонов/истории. Нужен паттерн temp-file + `fsync` + `rename`.
- `108, 120` Утечка шифротекста/полей в рендерер. `loadConfig` делает `...parsed`, затягивая `encryptedToken` в `this.config`; `getConfig()` (`119-121`) отдаёт объект целиком. Если он проходит по IPC в рендерер — туда уходит и `token` (plaintext в памяти), и `encryptedToken`. Для UI токен отдавать нельзя.

P2/P3 — рекомендации

- `159-162, 207-210` Нет валидации схемы. Любой массив принимается как валидные `templates`/`activity`. Битый/подменённый файл даёт непредсказуемые объекты в UI. Добавить проверку формата элементов.
- `168` `loadTemplates` при ошибке чтения перезаписывает пользовательские шаблоны дефолтными без бэкапа повреждённого файла. Стоит сохранять `*.corrupt` копию.
- `224` Магическое число `299`. Вынести лимит истории в константу.
- `126` `toSave: any` — теряется типобезопасность полей записи. Ввести явный тип `PersistedConfig`.

Исправления

Атомарная запись + fsync (общий helper):

```ts
private atomicWriteJson(file: string, data: unknown): void {
  const json = JSON.stringify(data, null, 2);
  const tmp = `${file}.${process.pid}.${Date.now()}.tmp`;
  const fd = fs.openSync(tmp, 'w');
  try {
    fs.writeFileSync(fd, json, 'utf-8');
    fs.fsyncSync(fd); // гарантируем сброс на диск до rename
  } finally {
    fs.closeSync(fd);
  }
  fs.renameSync(tmp, file); // атомарная замена в пределах одного тома
}
```

Замените все `fs.writeFileSync(<file>, JSON.stringify(...), 'utf-8')` на `this.atomicWriteJson(<file>, <obj>)` в строках `147, 179, 226, 242, 257, 266`.

Безопасное сохранение токена — никогда не писать plaintext:

```ts
public saveConfig(updates: Partial<AppConfig>): AppConfig {
  this.config = { ...this.config, ...updates };

  // Пишем только известные поля, token сюда НЕ включаем
  const { token, ...rest } = this.config as AppConfig & { encryptedToken?: string };
  const toSave: PersistedConfig = { ...rest };
  delete (toSave as any).encryptedToken;

  if (token) {
    let isEncAvailable = false;
    try {
      isEncAvailable = safeStorage.isEncryptionAvailable();
    } catch {
      isEncAvailable = false;
    }

    if (!isEncAvailable) {
      // P0-фикс: отказываемся писать токен в plaintext.
      // Сохраняем остальной конфиг, но токен НЕ персистим.
      console.error('[StoreService] DPAPI недоступно — токен НЕ будет сохранён на диск (plaintext запрещён).');
    } else {
      try {
        toSave.encryptedToken = safeStorage.encryptString(token).toString('base64');
      } catch (e) {
        // P0-фикс: при сбое шифрования не пишем plaintext, оставляем прежний encryptedToken
        console.error('[StoreService] Сбой шифрования токена, токен не будет обновлён на диске:', e);
        const prev = this.readRawConfig()?.encryptedToken;
        if (prev) toSave.encryptedToken = prev;
      }
    }
  }

  try {
    this.atomicWriteJson(this.configFile, toSave);
  } catch (e) {
    console.error('[StoreService] Ошибка записи config.json:', e);
  }
  return this.getConfig();
}

private readRawConfig(): any | null {
  try {
    if (fs.existsSync(this.configFile)) {
      return JSON.parse(fs.readFileSync(this.configFile, 'utf-8'));
    }
  } catch { /* ignore */ }
  return null;
}
```

Загрузка без тихой потери токена и без деградации до plaintext:

```ts
if (parsed.encryptedToken) {
  let isEncAvailable = false;
  try { isEncAvailable = safeStorage.isEncryptionAvailable(); } catch { isEncAvailable = false; }

  if (!isEncAvailable) {
    // DPAPI недоступно — НЕ трактуем как отсутствие токена, помечаем состояние
    console.error('[StoreService] DPAPI недоступно при загрузке — токен временно недоступен.');
    token = '';
    this.tokenLocked = true; // флаг: не перезаписывать encryptedToken при следующем save
  } else {
    try {
      token = safeStorage.decryptString(Buffer.from(parsed.encryptedToken, 'base64'));
    } catch (e) {
      console.error('[StoreService] Ошибка расшифровки токена (DPAPI):', e);
      token = '';
      this.tokenLocked = true; // не затираем валидный шифротекст мусором
    }
  }
} else {
  // Legacy plaintext token: расшифровки нет — принимаем и перешифруем при первом save
  token = parsed.token || '';
}
```

Инициализация после `whenReady()` (P0 — жизненный цикл). Убедитесь, что `StoreService` создаётся строго после готовности приложения:

```ts
// main.ts
app.whenReady().then(() => {
  const store = new StoreService(app.getPath('userData'));
  // ... регистрация IPC
});
```

Изоляция секретов от рендерера (P1):

```ts
// Полный конфиг — только для main
public getConfig(): AppConfig {
  return { ...this.config };
}

// Для IPC/рендерера — без токена и шифротекста
public getConfigForRenderer(): Omit<AppConfig, 'token'> & { hasToken: boolean } {
  const { token, ...safe } = this.config as any;
  delete (safe as any).encryptedToken;
  return { ...safe, hasToken: Boolean(this.config.token) };
}
```

Валидация данных с диска (P2):

```ts
private isTemplate(x: any): x is QuickTemplate {
  return x && typeof x.id === 'string' && typeof x.title === 'string'
    && typeof x.category === 'string' && typeof x.text === 'string';
}
// в loadTemplates:
if (Array.isArray(list) && list.every((t) => this.isTemplate(t)) && list.length > 0) {
  return list;
}
```

Ключевое: два P0 (`136-144` и недоступность DPAPI) устраняются запретом на plaintext-запись токена, потеря данных — флагом `tokenLocked` + атомарной записью, а недетерминизм `safeStorage` — переносом инициализации за `app.whenReady()`.

---

## МОДУЛЬ 2А: ЯДРО BOTS LONG POLL 5.199, СЕТЕВАЯ УСТОЙЧИВОСТЬ И ОБРЫВЫ

ВЕРДИКТ: Сетевое ядро неустойчиво к потере данных. Порядок продвижения `ts` нарушает главную гарантию Long Poll («сначала обработай, потом двигай ts») — при любой ошибке в пачке апдейты теряются безвозвратно. Дедупликация сообщений отсутствует, поэтому `failed=2` гарантированно порождает дубликаты. Восстановление после сна Windows не реализовано (нет `powerMonitor`), а `failed=2/3` крутятся без бэкоффа. Бэкофф на HTTP-ошибках и таймауты сокета сделаны корректно, но этого недостаточно.

---

P0 — Потеря входящих сообщений: `ts` продвигается ДО обработки пачки
`строка 774-782`. `this.lpTs = data.ts` присваивается раньше цикла `handleUpdate`. Если `handleUpdate` бросит исключение (сеть в `getUser`, `obj.text` undefined и т.д.), управление уходит в `catch` (783), `ts` уже указывает на конец пачки — необработанные апдейты потеряны навсегда. Двигать `ts` нужно только после успешной обработки.

```ts
// БЫЛО (774-782)
if (data.ts) {
  this.lpTs = data.ts;
}
if (data.updates && Array.isArray(data.updates)) {
  for (const update of data.updates) {
    await this.handleUpdate(update);
  }
}

// СТАЛО — ts продвигается ТОЛЬКО после успешной обработки всей пачки
if (data.updates && Array.isArray(data.updates)) {
  for (const update of data.updates) {
    try {
      await this.handleUpdate(update);
    } catch (e) {
      // изоляция сбойного апдейта (см. P1), пачку не роняем
      console.error('[VkService] Ошибка обработки update:', update?.type, e);
    }
  }
}
if (data.ts) {
  this.lpTs = data.ts; // commit ts после дренажа пачки
}
```

---

P1 — Один сбойный апдейт роняет всю пачку
`строка 779-781`. Голый `await this.handleUpdate(update)` без изоляции. Исправлено в фрагменте P0 (try/catch на итерацию).

P1 — Дубликаты сообщений: нет дедупликации, а `failed=2` реплеит пачку
`строка 760-763`. При `failed=2` вы обновляете только `key`, `ts` остаётся прежним — следующий `a_check` вернёт ту же пачку апдейтов. Так как дедупа нет (`handleUpdate` эмитит `message_new` по факту прихода, 802-825), пользователь получит дубли. Нужен LRU-набор обработанных id.

```ts
// поле класса
private seenEventIds = new Set<string>();
private seenOrder: string[] = [];
private markSeen(id: string): boolean {
  if (this.seenEventIds.has(id)) return false;
  this.seenEventIds.add(id);
  this.seenOrder.push(id);
  if (this.seenOrder.length > 2000) {
    const old = this.seenOrder.shift()!;
    this.seenEventIds.delete(old);
  }
  return true;
}

// в начале handleUpdate (после строки 800) — ключ по стабильным полям
if (type === 'message_new') {
  const m = update.object?.message;
  if (m && !this.markSeen(`msg:${m.peer_id}:${m.conversation_message_id ?? m.id}`)) return;
}
if (type === 'message_reaction_event' || type === 'callback_message_reaction_event') {
  const o = update.object;
  if (!this.markSeen(`react:${o.peer_id}:${o.cmid}:${o.reacted_id}:${o.reaction_id ?? 0}`)) return;
}
```

P1 — Нет восстановления при выходе из сна Windows
Во всём диапазоне отсутствует `powerMonitor`. После `resume` сокет `fetch` может висеть до срабатывания `AbortSignal.timeout(35000)` (743), а `ts` часто протухает → лишний цикл `failed`. Нужно рвать текущий запрос и форсировать реинициализацию сразу при `resume`.

```ts
// при инициализации сервиса (один раз)
import { powerMonitor } from 'electron';

powerMonitor.on('resume', () => {
  if (!this.isRunning) return;
  console.log('[VkService] resume: форсирую переподключение Long Poll');
  this.abortController?.abort();      // мгновенно рвём висящий fetch
  this.lpServer = '';                 // заставляем pollLoop заново дёрнуть fetchLpServer
  this.lpKey = '';
  this.lpTs = '';
});
```
Примечание: `catch` уже корректно давит `AbortError` (786-788) и продолжит цикл, а сброс `lpServer/lpKey/lpTs` уведёт его на `fetchLpServer` (738-740).

---

P2 — `failed=2/3` крутятся без задержки → tight-loop и риск rate-limit
`строка 760-766`. Оба ветвления делают `continue` без бэкоффа. Если VK устойчиво отдаёт `failed=2` (или `getLongPollServer` флапает), получаем плотный цикл запросов к API. Добавьте паузу и не сбрасывайте `retryAttempt` до фактического успеха обработки.

```ts
} else if (data.failed === 2) {
  const srv = await this.callApi('groups.getLongPollServer', { group_id: this.groupId });
  this.lpKey = srv.key;
  this.lpServer = srv.server;          // сервер тоже мог смениться
  await new Promise((r) => setTimeout(r, 1000));
  continue;
} else if (data.failed === 3) {
  await this.fetchLpServer();
  await new Promise((r) => setTimeout(r, 1000));
  continue;
}
```
И перенести `retryAttempt = 0` (754) ниже блока `failed`, ближе к успешному дренажу пачки.

P2 — Нет сигнала восстановления связи
`строка 792` эмитит `{ connected: false }`, но `connected: true` не эмитится нигде после успешного цикла — UI зависнет в состоянии «отключено». Добавьте после успешного `res.json()`:

```ts
this.emit('network-status', { connected: true });
```

P2 — Дедуп лайков теряет валидные события и течёт по памяти
`строка 923-931`. Окно 8с завязано только на `likerId`, без учёта объекта — если пользователь лайкнул два разных поста за 8с, второй лайк молча отбрасывается. При этом `lastLikeObjectTypes` пишется (931), но в условии дедупа (926) не участвует. Плюс обе Map никогда не чистятся. Ключуйте по объекту и добавьте TTL-очистку.

```ts
const dedupKey = `${likerId}:${objectType}:${obj.object_id ?? ''}`;
const lastLike = this.lastLikeTimestamps.get(dedupKey);
if (lastLike && (now - lastLike) < 8000) {
  console.log(`[VkService] Агрегирован каскадный лайк ${dedupKey}`);
  return;
}
this.lastLikeTimestamps.set(dedupKey, now);
// периодическая очистка протухших ключей, чтобы Map не рос бесконечно
if (this.lastLikeTimestamps.size > 500) {
  for (const [k, t] of this.lastLikeTimestamps) {
    if (now - t > 60000) this.lastLikeTimestamps.delete(k);
  }
}
```

P2 — `obj.text.length` бросает исключение
`строка 982`. Для `wall_reply_new` без текста (только вложение) `obj.text` undefined → `.length` кинет TypeError → уронит апдейт (нейтрализуется P0, но сам баг чинится так):

```ts
const text = obj.text || '';
details: `Комментарий: «${text.length > 50 ? text.slice(0, 50) + '...' : text}»`,
```

P3 — `failed=4` завершает работу навсегда без чтения версии
`строка 767-770`. VK при `failed=4` возвращает `min_version`/`max_version`. Полный `stop()` без попытки согласования версии — жёстко. Как минимум залогируйте `data.min_version`/`data.max_version` в сообщении об ошибке для диагностики.

P3 — `abortController` не обнуляется после итерации
`строка 742`. Новый `AbortController` создаётся каждый цикл, старый остаётся в поле до перезаписи. Утечки нет, но `stop()`/`resume` могут дёрнуть уже отработавший контроллер. Обнуляйте в `finally` цикла после завершения запроса.

---

## МОДУЛЬ 2Б: API МЕТОДЫ, МЕДИА, РЕАКЦИИ И ДЕДУПЛИКАЦИЯ

# Аудит VK API-клиента `electron/vk-service.ts`

## Вердикт

Клиент функционально покрывает нужный набор методов и аккуратно маппит вложения, но с точки зрения устойчивости он написан под «happy path». Три системных пробела делают его ненадёжным в проде:

1. Нет ни одной реакции на бизнес-ошибки VK (код 6/9/14/5) и нет таймаутов — при первом же всплеске RPS или flood control клиент начнёт бросать голые исключения и не восстановится.
2. `updateCredentials` не умеет поднимать сервис из остановленного состояния — типичный сценарий «ввёл токен в настройках» не заведёт Long Poll.
3. Загрузки и реакции не валидируют входные данные и ответы серверов, а `userCache` не ограничен — утечка памяти на длинной дистанции.

Это не блокеры для демо, но P1 по надёжности. Ниже разбор и готовые патчи.

---

## P0/P1 дефекты

### P1-1. `updateCredentials` не стартует остановленный сервис — `строка 33-40`
`restart()` вызывается только при `this.isRunning`. Сценарий «сервис не стартовал из-за отсутствия токена → пользователь ввёл токен» не обрабатывается: `isRunning === false`, ветка не срабатывает, Long Poll не поднимается. Пользователь вынужден перезапускать приложение.

### P1-2. `callApi` не обрабатывает ошибки VK, таймауты и сетевые сбои — `строка 42-64`
- Любая ошибка VK превращается в одинаковый `Error` со строкой. Код `6` (RPS) и `9` (flood control) требуют backoff-ретрая, а не падения. Код `14` (captcha) несёт `captcha_sid`/`captcha_img`, которые здесь теряются. Код `5` (auth) должен останавливать сервис и сигналить UI, а не молча ретраиться.
- `fetch` без `AbortController`/таймаута — при зависшем соединении промис висит бесконечно, блокируя очередь Long Poll.
- Сетевой сбой (`fetch` reject: ECONNRESET, DNS) пробрасывается сырым.
- `access_token` уходит в query-string (`строка 47-53`) — попадает в логи/трейсы. VK принимает POST-body, туда токен и надо класть.

### P1-3. Загрузки не проверяют HTTP-ответ и падают на undefined — `строка 434-435`, `строка 471-482`
- `postRes.json()` вызывается без проверки `postRes.ok`. Сервер загрузки VK при 5xx может вернуть HTML — получаем невнятный `SyntaxError` вместо понятной ошибки.
- В `sendVoiceMessage` `audioDoc` (`строка 482`) может быть `undefined`, если `docs.save` вернул неожиданную структуру — далее `audioDoc.owner_id` бросит `TypeError`, маскируя реальную причину.
- Оба upload-`fetch` без таймаута.

---

## P2/P3 рекомендации

### P2-1. `userCache` неограничен — `строка 16`
`getConversations`/`getHistory`/`getPeerStatus` пишут в кэш без верхней границы и без TTL. У долгоживущего менеджера с активной перепиской кэш растёт монотонно + данные (online, last_seen) протухают. Нужен LRU с cap и TTL.

### P2-2. Реакции не валидируют вход — `строка 369-384`
`sendReaction`/`deleteReaction` шлют `cmid`/`peer_id`/`reaction_id` как есть. `undefined`/`0`/`NaN` уходят на сервер и возвращают невнятную VK-ошибку. Дешевле отсечь на клиенте.

### P2-3. Синхронный I/O блокирует event loop — `строка 387, 414, 459`
`fs.statSync`/`readFileSync`/`writeFileSync` в async-методах замораживают main-процесс Electron на время чтения/записи (до 50 МБ). Замените на `fs.promises`.

### P2-4. Валидация JPEG — только по расширению, комментарий вводит в заблуждение — `строка 391-397, 412`
Комментарий обещает «строгую валидацию формата JPEG», а по факту проверяется лишь `path.extname`. Файл `evil.jpg` с PNG-контентом пройдёт. Плюс текст ошибки говорит «только JPG/JPEG», хотя код принимает png/webp/gif и конвертирует. Стоит проверять magic bytes и синхронизировать текст с реальным поведением.

### P2-5. Токен в URL — см. P1-2, вынесен отдельно как security-пункт — `строка 47-53`

### P3-1. Коллизия имени temp-файла — `строка 457`
`scm_voice_${Date.now()}.ogg`: два вызова в одну миллисекунду перезапишут друг друга. Используйте `crypto.randomUUID()` или `fs.mkdtemp`.

### P3-2. `getGroupInfo`/`getUser` полагаются на форму ответа `groups.getById` — `строка 68, 79`
На `v5.199` `groups.getById` возвращает `{ groups: [...] }`. Тернарники `res.groups ? ... : res[0]` — защитная заглушка, но при пустом массиве `res.groups[0]` даст `undefined` без диагностики. Некритично, оставил как P3.

---

## Готовый код исправлений

### 1. Типизированные ошибки + устойчивый `callApi`

```ts
// Вверху файла, рядом с константами
const VK_API_TIMEOUT_MS = 15_000;
const VK_MAX_RETRIES = 3;

export class VkApiError extends Error {
  constructor(
    public readonly code: number,
    message: string,
    public readonly captchaSid?: string,
    public readonly captchaImg?: string,
  ) {
    super(message);
    this.name = 'VkApiError';
  }
}

export class VkNetworkError extends Error {
  constructor(message: string, public readonly cause?: unknown) {
    super(message);
    this.name = 'VkNetworkError';
  }
}
```

```ts
private async callApi(method: string, params: Record<string, any> = {}): Promise<any> {
  if (!this.token) {
    throw new Error('VK токен не задан');
  }

  // Токен и параметры уходят в body, а не в query-string.
  const body = new URLSearchParams({
    access_token: this.token,
    v: VK_API_VERSION,
    ...params,
  });

  let attempt = 0;
  // Задержки для кода 6 (RPS): экспоненциальный backoff.
  const backoff = [300, 800, 1500];

  while (true) {
    attempt++;
    const timeout = new AbortController();
    const timer = setTimeout(() => timeout.abort(), VK_API_TIMEOUT_MS);

    let json: any;
    try {
      const res = await fetch(`${VK_API_URL}${method}`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
        body,
        signal: timeout.signal,
      });

      if (!res.ok) {
        // 5xx на транспортном уровне — ретраим как сетевую флуктуацию.
        if (res.status >= 500 && attempt <= VK_MAX_RETRIES) {
          await this.delay(backoff[Math.min(attempt - 1, backoff.length - 1)]);
          continue;
        }
        throw new VkNetworkError(`HTTP ${res.status}: ${res.statusText}`);
      }

      json = await res.json();
    } catch (e: any) {
      if (e instanceof VkNetworkError) throw e;
      if (e?.name === 'AbortError') {
        if (attempt <= VK_MAX_RETRIES) {
          await this.delay(backoff[Math.min(attempt - 1, backoff.length - 1)]);
          continue;
        }
        throw new VkNetworkError(`Таймаут запроса ${method} (${VK_API_TIMEOUT_MS} мс)`);
      }
      // fetch reject: ECONNRESET, DNS, offline.
      if (attempt <= VK_MAX_RETRIES) {
        await this.delay(backoff[Math.min(attempt - 1, backoff.length - 1)]);
        continue;
      }
      throw new VkNetworkError(`Сетевая ошибка при вызове ${method}`, e);
    } finally {
      clearTimeout(timer);
    }

    if (json.error) {
      const err = json.error;
      const code = err.error_code;

      switch (code) {
        case 6: // Too many requests per second
          if (attempt <= VK_MAX_RETRIES) {
            await this.delay(backoff[Math.min(attempt - 1, backoff.length - 1)]);
            continue;
          }
          break;
        case 9: // Flood control
          if (attempt <= VK_MAX_RETRIES) {
            await this.delay(2000 * attempt);
            continue;
          }
          break;
        case 14: // Captcha needed — пробрасываем данные наверх для UI.
          throw new VkApiError(
            code,
            'Требуется ввод капчи',
            err.captcha_sid,
            err.captcha_img,
          );
        case 5: // Auth failed / токен протух — сигналим и останавливаем.
          this.emit('auth-error', err.error_msg);
          throw new VkApiError(code, `Ошибка авторизации VK: ${err.error_msg}`);
      }

      throw new VkApiError(code, `VK Error [${code}]: ${err.error_msg}`);
    }

    return json.response;
  }
}

private delay(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}
```

Примечание по безопасности: `emit('auth-error')` требует, чтобы вызывающий код подписался и остановил сервис. Убедитесь, что в месте, где создаётся `VkService`, есть `service.on('auth-error', () => service.stop())`, иначе клиент продолжит долбить API протухшим токеном.

Для передачи капчи повторно понадобится проброс `captcha_sid`/`captcha_key` в `params` — сигнатуру `callApi` можно расширить опциональным третьим аргументом, когда UI будет готов.

### 2. `updateCredentials` поднимает сервис из простоя

```ts
public updateCredentials(groupId: number, token: string) {
  const changed = this.groupId !== groupId || this.token !== token;
  this.groupId = groupId;
  this.token = token;

  if (!changed) return;

  if (this.isRunning) {
    this.restart();
  } else if (this.token && this.groupId) {
    // Сервис был остановлен или не стартовал из-за отсутствия токена —
    // теперь данные есть, поднимаем.
    this.start();
  }
}
```

Здесь предполагается, что `start()` идемпотентен и сам проверяет наличие токена (он уже это делает через `callApi`). Если `start()` async — оберните вызов в `void this.start()` или пробросьте промис по вашему контракту.

### 3. Валидация реакций

```ts
public async sendReaction(peerId: number, cmid: number, reactionId: number): Promise<boolean> {
  if (!Number.isInteger(peerId) || peerId === 0) {
    throw new Error('sendReaction: некорректный peer_id');
  }
  if (!Number.isInteger(cmid) || cmid <= 0) {
    throw new Error('sendReaction: некорректный cmid');
  }
  if (!Number.isInteger(reactionId) || reactionId <= 0) {
    throw new Error('sendReaction: некорректный reaction_id');
  }

  await this.callApi('messages.sendReaction', {
    peer_id: peerId,
    cmid,
    reaction_id: reactionId,
  });
  return true;
}

public async deleteReaction(peerId: number, cmid: number): Promise<boolean> {
  if (!Number.isInteger(peerId) || peerId === 0) {
    throw new Error('deleteReaction: некорректный peer_id');
  }
  if (!Number.isInteger(cmid) || cmid <= 0) {
    throw new Error('deleteReaction: некорректный cmid');
  }

  await this.callApi('messages.deleteReaction', {
    peer_id: peerId,
    cmid,
  });
  return true;
}
```

### 4. Загрузки: async I/O, magic bytes, проверка ответов, защита от undefined

```ts
// helper: определяем реальный тип по сигнатуре, а не по расширению
private detectImageType(buf: Buffer): 'jpeg' | 'png' | 'webp' | 'gif' | null {
  if (buf.length < 12) return null;
  if (buf[0] === 0xff && buf[1] === 0xd8 && buf[2] === 0xff) return 'jpeg';
  if (buf[0] === 0x89 && buf[1] === 0x50 && buf[2] === 0x4e && buf[3] === 0x47) return 'png';
  if (buf[0] === 0x47 && buf[1] === 0x49 && buf[2] === 0x46) return 'gif';
  if (
    buf[0] === 0x52 && buf[1] === 0x49 && buf[2] === 0x46 && buf[3] === 0x46 &&
    buf[8] === 0x57 && buf[9] === 0x45 && buf[10] === 0x42 && buf[11] === 0x50
  ) return 'webp';
  return null;
}

private async fetchUpload(url: string, form: FormData): Promise<any> {
  const ctrl = new AbortController();
  const timer = setTimeout(() => ctrl.abort(), 60_000); // upload крупнее — таймаут выше
  try {
    const res = await fetch(url, { method: 'POST', body: form, signal: ctrl.signal });
    if (!res.ok) {
      throw new Error(`Сервер загрузки VK вернул HTTP ${res.status}: ${res.statusText}`);
    }
    return await res.json();
  } catch (e: any) {
    if (e?.name === 'AbortError') throw new Error('Таймаут загрузки файла на сервер VK');
    throw e;
  } finally {
    clearTimeout(timer);
  }
}
```

```ts
public async uploadAttachment(peerId: number, filePath: string): Promise<string> {
  const stats = await fs.promises.stat(filePath);
  const fileName = path.basename(filePath);

  if (stats.size > 50 * 1024 * 1024) {
    throw new Error(`Изображение «${fileName}» весит ${(stats.size / 1024 / 1024).toFixed(1)} МБ. Лимит VK API — 50 МБ.`);
  }

  const originalBuffer = await fs.promises.readFile(filePath);

  // Валидация по сигнатуре, а не по расширению.
  const detected = this.detectImageType(originalBuffer);
  if (!detected) {
    throw new Error(
      `Файл «${fileName}» не является изображением. От имени сообщества VK принимает только ` +
      `изображения (JPEG/PNG/WebP/GIF); аудио и видео файлы загружать нельзя.`
    );
  }

  const serverParams: Record<string, any> = {};
  if (peerId > 0 && peerId < 2000000000) {
    serverParams.peer_id = peerId;
  }
  const up = await this.callApi('photos.getMessagesUploadServer', serverParams);
  const uploadUrl = up?.upload_url;
  if (!uploadUrl) {
    throw new Error('VK не вернул upload_url для загрузки изображения');
  }

  // VK устойчивее принимает чистый JPEG. Конвертируем всё, кроме уже валидного JPEG.
  let uploadBuffer: Buffer = originalBuffer;
  let uploadName = fileName;
  if (detected !== 'jpeg') {
    try {
      const nImg = nativeImage.createFromBuffer(originalBuffer);
      if (!nImg.isEmpty()) {
        uploadBuffer = nImg.toJPEG(92);
        uploadName = `${path.parse(fileName).name}.jpg`;
      }
    } catch (e) {
      console.warn('[vk-service] Ошибка конвертации в JPEG, отправляем оригинал:', e);
    }
  }

  const fileBlob = new Blob([new Uint8Array(uploadBuffer)], { type: 'image/jpeg' });
  const form = new FormData();
  form.append('photo', fileBlob, uploadName);

  const postJson = await this.fetchUpload(uploadUrl, form);
  if (postJson.error) {
    throw new Error(`Ошибка загрузки фото на сервер VK: ${postJson.error}`);
  }
  if (!postJson.photo || postJson.photo === '[]') {
    throw new Error(`Сервер VK не принял изображение «${fileName}». Попробуйте сохранить файл в стандартном формате JPG и повторить.`);
  }

  const saveRes = await this.callApi('photos.saveMessagesPhoto', {
    photo: postJson.photo,
    server: postJson.server,
    hash: postJson.hash,
  });

  const photoObj = saveRes?.[0];
  if (!photoObj?.owner_id || !photoObj?.id) {
    throw new Error('VK не вернул сохранённое фото (photos.saveMessagesPhoto)');
  }
  return `photo${photoObj.owner_id}_${photoObj.id}`;
}
```

```ts
public async sendVoiceMessage(peerId: number, buffer: Buffer): Promise<number> {
  // Уникальное имя — исключаем коллизию при параллельных вызовах.
  const tempDir = await fs.promises.mkdtemp(path.join(os.tmpdir(), 'scm_voice_'));
  const tempFile = path.join(tempDir, 'voice.ogg');
  try {
    await fs.promises.writeFile(tempFile, buffer);

    const up = await this.callApi('docs.getMessagesUploadServer', {
      peer_id: peerId,
      type: 'audio_message',
    });
    const uploadUrl = up?.upload_url;
    if (!uploadUrl) {
      throw new Error('VK не вернул upload_url для аудиосообщения');
    }

    const fileBlob = await fs.openAsBlob(tempFile);
    const form = new FormData();
    form.append('file', fileBlob, 'voice.ogg');

    const postJson = await this.fetchUpload(uploadUrl, form);
    if (postJson.error) {
      throw new Error(`Ошибка загрузки аудиосообщения: ${postJson.error}`);
    }
    if (!postJson.file) {
      throw new Error('Сервер VK не принял аудиосообщение (пустой ответ file)');
    }

    const saveRes = await this.callApi('docs.save', { file: postJson.file });
    const audioDoc = saveRes?.audio_message || saveRes?.doc || saveRes?.[0];
    if (!audioDoc?.owner_id || !audioDoc?.id) {
      throw new Error('VK не вернул сохранённый документ (docs.save)');
    }

    const attachId = `doc${audioDoc.owner_id}_${audioDoc.id}`;
    return await this.sendMessage(peerId, '', attachId);
  } finally {
    // rm -rf временной директории — гарантированная очистка.
    await fs.promises.rm(tempDir, { recursive: true, force: true }).catch(() => {});
  }
}
```

`fs.openAsBlob` не оставляет открытый дескриптор после чтения потоком, а `mkdtemp` + `rm(recursive)` в `finally` устраняет и файл, и каталог даже при исключении.

### 5. `userCache` → LRU + TTL

```ts
// Заменить: private userCache: Map<number, UserProfile> = new Map();
private userCache = new LruTtlCache<number, UserProfile>(2000, 15 * 60_000);
```

```ts
// Отдельный модуль или верх файла
class LruTtlCache<K, V> {
  private map = new Map<K, { value: V; expires: number }>();

  constructor(private maxSize: number, private ttlMs: number) {}

  has(key: K): boolean {
    const e = this.map.get(key);
    if (!e) return false;
    if (e.expires < Date.now()) {
      this.map.delete(key);
      return false;
    }
    return true;
  }

  get(key: K): V | undefined {
    const e = this.map.get(key);
    if (!e) return undefined;
    if (e.expires < Date.now()) {
      this.map.delete(key);
      return undefined;
    }
    // touch: перемещаем в конец (свежий хвост LRU)
    this.map.delete(key);
    this.map.set(key, e);
    return e.value;
  }

  set(key: K, value: V): void {
    if (this.map.has(key)) this.map.delete(key);
    this.map.set(key, { value, expires: Date.now() + this.ttlMs });
    // вытеснение самого старого
    while (this.map.size > this.maxSize) {
      const oldest = this.map.keys().next().value;
      if (oldest === undefined) break;
      this.map.delete(oldest);
    }
  }

  delete(key: K): void {
    this.map.delete(key);
  }
}
```

Cap 2000 профилей и TTL 15 минут закрывают и рост памяти, и протухание online/last_seen — статусные поля перестанут «залипать». API `has/get/set/delete` совпадает с текущим использованием `Map`, так что остальной код не меняется.

---

Замечу, что метод `getUser` при cache-miss в `getConversations` (`строка 156-158`) дергается последовательно в цикле — на 20 диалогах это до 20 отдельных API-вызовов. Если профилей в `res.profiles` не хватает, эффективнее собрать недостающие `peerId` и запросить их одним `users.get` батчем. Это уже P3-оптимизация, вне пяти критериев, но стоит держать в бэклоге.

Патчи не меняют публичные сигнатуры (кроме новых типов ошибок), так что интеграция сводится к замене тел методов и подписке на событие `auth-error`.

---

## МОДУЛЬ 3А: ELECTRON RUNTIME, ПОРТАТИВНОСТЬ, ИНИЦИАЛИЗАЦИЯ И ТРЕЙ

ВЕРДИКТ: Архитектура нарушает контракт жизненного цикла Electron. Тяжёлые сервисы (`StoreService`, `VkService`) инстанцируются на верхнем уровне модуля до `app.whenReady()`, что ломает `safeStorage` и делает расшифровку токена недетерминированной. Рендерер изолирован частично: нет CSP, нет `will-navigate`, глобально снят `X-Frame-Options` для всех запросов, `sandbox:false`. Портативность не деградирует безопасно на read-only носителе. Требуется рефакторинг порядка инициализации и hardening сессии.

## P0 — критические

**1. `StoreService`/`VkService` создаются до `whenReady()` → `safeStorage` недоступен `53-56`**
`safeStorage` по контракту Electron работает только после события `ready`. Вызов `storeService.getConfig()` на `54` (если он расшифровывает токен через `safeStorage.decryptString`) до готовности app даёт исключение либо мусор на выходе, а `VkService` на `56` получает битый/пустой токен и Long Poll стартует нерабочим.

```ts
// БЫЛО (53-56): выполняется на этапе загрузки модуля
const storeService = new StoreService(appRoot);
let config = storeService.getConfig();
const vkService = new VkService(config.groupId, config.token);

// СТАЛО: объявляем, инициализируем внутри whenReady
let storeService: StoreService;
let vkService: VkService;
let config: AppConfig;

app.whenReady().then(() => {
  storeService = new StoreService(appRoot);   // safeStorage теперь доступен
  config = storeService.getConfig();
  vkService = new VkService(config.groupId, config.token);

  createWindow();
  createTray();
  updateTrayBadge(0);
  registerIpcHandlers();

  if (config.token && config.groupId) {
    vkService.start();          // автозапуск Long Poll только с валидным конфигом
  }
});
```
Проверьте, что `before-quit` (`68`) и обработчики трея, ссылающиеся на `vkService`/`config`, вызываются только после этой инициализации (guard `if (vkService)`).

**2. Глобальное снятие `X-Frame-Options` для всей `defaultSession` `135-140`**
Хендлер вешается на `session.defaultSession` и удаляет `X-Frame-Options` из ответов **всех** запросов, а не только `video_ext.php`. Это открывает clickjacking/встраивание произвольных origin. Дополнительно `onHeadersReceived` регистрируется внутри `createWindow()` — при повторном создании окна хендлеры дублируются.

```ts
// СТАЛО: фильтруем по URL, регистрируем один раз вне createWindow
function setupSession() {
  session.defaultSession.webRequest.onHeadersReceived((details, callback) => {
    const rh = details.responseHeaders || {};
    if (/(^|\.)vk(video)?\.(com|ru)\//.test(details.url) && /video_ext\.php/.test(details.url)) {
      delete rh['x-frame-options'];
      delete rh['X-Frame-Options'];
    }
    callback({ cancel: false, responseHeaders: rh });
  });
}
// вызвать один раз в whenReady, до createWindow()
```

## P1 — высокие

**3. Отсутствует блокировка внутренней навигации (`will-navigate`) `127-132`**
`setWindowOpenHandler` перехватывает только `window.open`/новые окна. Переход через `location.href`/`<a target=_self>` на внешний origin не блокируется — рендерер может уйти с локального `index.html` на произвольный сайт с сохранением привилегий preload.

```ts
mainWindow.webContents.on('will-navigate', (event, url) => {
  const allowed = process.env.VITE_DEV_SERVER_URL; // dev
  const isLocalFile = url.startsWith('file://');
  if (!isLocalFile && url !== allowed) {
    event.preventDefault();
    if (/^https?:\/\//.test(url)) shell.openExternal(url);
  }
});
mainWindow.webContents.on('will-attach-webview', (e) => e.preventDefault());
```

**4. Нет CSP `93-161`**
Локальный `index.html` загружается без Content-Security-Policy. При XSS в рендерере (VK-контент, вложения) нет второго рубежа. Добавьте CSP через `onHeadersReceived` или meta.

```ts
session.defaultSession.webRequest.onHeadersReceived((details, callback) => {
  const rh = details.responseHeaders || {};
  rh['Content-Security-Policy'] = [
    "default-src 'self'; img-src 'self' data: https:; media-src 'self' https:; " +
    "frame-src https://vk.com https://*.vk.com https://*.vkvideo.ru; " +
    "connect-src 'self' https://api.vk.com https://*.vk.com; " +
    "style-src 'self' 'unsafe-inline'; script-src 'self'"
  ];
  callback({ cancel: false, responseHeaders: rh });
});
```

**5. `sandbox: false` `107`**
Preload использует только `ipcRenderer`, `webUtils`, `webFrame`, `contextBridge` — всё доступно в sandbox. Отключение sandbox снимает изоляцию процесса рендерера без необходимости.

```ts
webPreferences: {
  preload: path.join(__dirname, 'preload.js'),
  contextIsolation: true,
  nodeIntegration: false,
  sandbox: true,            // было false
  webSecurity: true,        // явно зафиксировать
  spellcheck: false,
},
```
Если `StoreService`/нативный код тянется в preload — вынести его в main через IPC.

**6. Портативность падает на read-only носителе `23-36`**
`mkdirSync` обёрнут в try/catch (`23-29`), но `app.setPath()` (`32-36`) вызывается безусловно, и первая же запись (`tray.ico` на `320`, сохранение конфига) кинет `EACCES/EROFS` на флешке/read-only. Нет fallback на системный `userData`.

```ts
let effectiveRoot = userDataPath;
try {
  fs.mkdirSync(userDataPath, { recursive: true });
  fs.accessSync(userDataPath, fs.constants.W_OK);   // проверка записи
} catch (e) {
  console.warn('[Main] data/ недоступна для записи, fallback на системный userData:', e);
  effectiveRoot = app.getPath('userData');          // не переопределяем пути
}
if (effectiveRoot === userDataPath) {
  app.setPath('appData', userDataPath);
  app.setPath('userData', userDataPath);
  app.setPath('sessionData', sessionDataPath);
  app.setPath('crashDumps', crashesPath);
  app.setPath('logs', logsPath);
}
```

**7. `process.exit(0)` после `app.quit()` во второй копии `45-46`**
`process.exit(0)` обрывает event loop до завершения `app.quit()`. Достаточно `return` после `app.quit()` — приложение и так не должно продолжать инициализацию.

```ts
if (!gotTheLock) {
  app.quit();
  // process.exit(0) — убрать; ниже весь код обернуть в whenReady (см. P0-1),
  // либо явно завершить модуль:
  // eslint-disable-next-line no-process-exit — оставить только если нет асинхронных ресурсов
}
```
После рефакторинга P0-1 весь код инициализации живёт в `whenReady`, который для второй копии не наступит — `process.exit` не нужен.

## P2/P3 — рекомендации

**8. `P2` Нет `window-all-closed` `142-147`**
Окно скрывается при закрытии, но обработчик `window-all-closed` отсутствует. Если окно когда-либо реально закроется (при `isQuitting`), поведение выхода зависит от платформы неявно. Зафиксируйте явно.
```ts
app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') app.quit();
});
```

**9. `P2` `setTimeout(...,1200)` как «страховка» показа окна `118-125`**
Костыль поверх `ready-to-show`. Если рендер завис, окно всё равно всплывёт пустым. Лучше слушать `did-finish-load`/таймаут с логированием, а не показывать безусловно.

**10. `P2` Токен `config.token` держится в памяти main и передаётся в конструктор `56`**
После рефакторинга не логируйте `config` целиком; в `VkService` держите токен приватным. При `community:validate` (preload `9`) не эхойте токен обратно в рендерер.

**11. `P3` Автозапуск через `reg.exe` указывает на путь носителя `186`**
Для portable `targetExe` = путь на флешке; при её отсутствии автозапуск молча падает. Рассмотрите проверку существования пути при построении меню и предупреждение пользователю.

**12. `P3` `shell.openExternal` без белого списка хоста `128-129`**
Протокол проверяется (`http/https`), но хост — нет. Для строгости ограничьте доменами VK или явно подтверждайте открытие неизвестных доменов.

**13. `P3` Дублирование списка `candidates` `71-84` и `310-316`**
Одинаковый резолвинг иконки в двух местах — вынести в общую функцию, снизит риск рассинхрона путей.

Ключевой порядок после фикса: `setPath` (с проверкой записи) → `setAppUserModelId` → `requestSingleInstanceLock` → `app.whenReady()` → `setupSession()` → `new StoreService` → `getConfig` → `new VkService` → `createWindow`/`createTray` → условный `vkService.start()`.

---

## МОДУЛЬ 3Б: IPC ВЗАИМОДЕЙСТВИЕ, АВТОЗАПУСК И СИСТЕМНЫЕ УВЕДОМЛЕНИЯ

## Вердикт по надёжности системной интеграции

Слой IPC функционально полный, но написан в «доверяющем» стиле: аргументы из рендерера принимаются без валидации и типизации, а часть обработчиков даёт рендереру примитивы для чтения произвольных файлов (`file:get-data-url`, `media:upload`) и сетевых запросов (`media:download-track`). Для системной интеграции есть два блокирующих момента: `powerMonitor.on(...)` регистрируется на верхнем уровне модуля (строки 482–492), то есть до `app.whenReady()`, что на актуальных версиях Electron бросает исключение и роняет старт; а ключевые для Windows-нотификаций вещи (`app.setAppUserModelId`) и вся реализация автозапуска через `reg.exe` находятся **вне предоставленного диапазона 381–739** — по этому коду я их подтвердить не могу.

Итого: интеграция работоспособна в «счастливом пути», но не готова к продакшену без правок по безопасности IPC и порядку инициализации. Ниже — то, что видно в присланном фрагменте. Для полной оценки автозапуска и AppUserModelID мне нужны соответствующие участки файла.

---

## P0/P1 дефекты

### P1-1. `powerMonitor` подписки до `app.whenReady` — риск краша при старте
`строки 482–492`. Модуль `powerMonitor` нельзя использовать до события `ready`. Регистрация на верхнем уровне модуля срабатывает при импорте `main.ts`, то есть раньше готовности приложения. На части версий Electron это бросает `Cannot use powerMonitor module before app is ready` и убивает процесс до `createWindow()`.

### P1-2. Отсутствует подтверждаемый `app.setAppUserModelId` (Windows notifications)
`вне диапазона (проверьте секцию инициализации app)`. Без установленного AppUserModelId на Windows 10/11 уведомления показываются под именем/иконкой хоста (`electron.exe`), могут не группироваться и не всегда всплывают. Критерий 3 (показ имени/аватара, клик) без него нестабилен. В присланном фрагменте вызова нет — если его нет и выше, это P1.

### P1-3. Произвольное чтение файлов из рендерера
`строки 647–659` (`file:get-data-url`) и `строки 623–625` (`media:upload`). Рендерер передаёт любой абсолютный путь, main его читает. `file:get-data-url` ограничен картинками, но это всё равно чтение произвольного файла ФС по запросу рендерера (path traversal / exfiltration через скомпрометированный или инъектированный контент). Нет привязки к путям, полученным ранее через `dialog:*`.

### P1-4. Нет валидации отправителя и типов аргументов в IPC
`строки 494–716`. Ни один `handle`/`on` не проверяет `event.senderFrame` (origin) и не валидирует типы. При наличии `<webview>`, iframe или загрузке внешнего URL любой фрейм получает доступ ко всем каналам. Плюс `config:save` (`строки 496–504`) применяет произвольный `Partial<AppConfig>` без схемы — рендерер может записать мусор в конфиг и, косвенно, в автозапуск/креды.

---

## P2/P3 рекомендации

### P2-1. Клик по уведомлению не восстанавливает свёрнутое окно
`строки 435–441`. `isVisible()` возвращает `true` для свёрнутого окна, поэтому `show()` не вызывается, а `focus()` на minimized-окне на Windows часто не поднимает его. Нужен `restore()` и приём с временным `alwaysOnTop` для обхода блокировки фокуса Windows.

### P2-2. Загрузка аватара без таймаута
`строки 417–425`. `fetch(user.photo_100)` без AbortController: медленный ответ VK CDN задерживает показ уведомления (оно ждёт `await` перед `new Notification`). Уведомление о новом сообщении должно быть мгновенным.

### P2-3. `media:download-track` — нет валидации схемы URL и синхронная запись
`строки 670–691`. `fetch(url)` принимает любой `url` от рендерера (SSRF-поверхность), нет проверки `http(s)`. `fs.writeFileSync` (`строка 689`) блокирует main-поток на больших файлах. Ошибка `throw` (`строка 687`) улетает в рендерер без осмысленного контекста.

### P2-4. `shell:open-external` без строгой проверки
`строки 693–697`. `url` не приводится к строке и не парсится через `new URL()`; `startsWith` можно обойти пробелами/переносами. Лучше парсить и проверять `protocol`.

### P2-5. `resume` может накапливать рестарты
`строки 487–492`. При нескольких событиях `resume` подряд создаются несколько отложенных `restart()`. Нужен дебаунс одного таймера и `try/catch` вокруг `restart()`.

### P3-1. Обработчики `vkService.*` без единой обёртки ошибок
`строки 571–633`. Часть возвращает `{ error }` (555–561), часть пробрасывает reject как есть — неконсистентный контракт для рендерера. Стоит унифицировать.

### P3-2. `window-all-closed` пуст без комментария о поведении в трее
`строки 737–739` — ок, но стоит явно не выходить на не-Windows платформах, если приложение только для Windows это не критично.

---

## Готовые патчи

### Патч 1 — перенос `powerMonitor` в `whenReady` + дебаунс/устойчивость (P1-1, P2-5)

Удалите блок `строки 482–492` и внесите логику внутрь `app.whenReady()`:

```ts
// УДАЛИТЬ верхнеуровневые powerMonitor.on(...) (строки 482–492)

let resumeTimer: NodeJS.Timeout | null = null;

function setupPowerMonitor() {
  powerMonitor.on('suspend', () => {
    console.log('[Power] Сон. Останавливаем Long Poll...');
    try {
      vkService.stop();
    } catch (err) {
      console.error('[Power] stop error:', err);
    }
  });

  powerMonitor.on('resume', () => {
    console.log('[Power] Пробуждение. Рестарт Long Poll через 3с...');
    if (resumeTimer) clearTimeout(resumeTimer);
    resumeTimer = setTimeout(() => {
      resumeTimer = null;
      try {
        vkService.restart();
      } catch (err) {
        console.error('[Power] restart error:', err);
      }
    }, 3000);
  });
}
```

```ts
app.whenReady().then(() => {
  setupIpcHandlers();
  setupVkEvents();
  setupPowerMonitor();   // <-- добавлено, после ready
  createWindow();
  createTray();
  // ...остальное без изменений (строки 724–734)
});
```

### Патч 2 — AppUserModelId для Windows-нотификаций (P1-2)

Добавьте как можно раньше, до создания окна (в начале `whenReady` или сразу после `app` импорта):

```ts
if (process.platform === 'win32') {
  // Должен совпадать с appId в electron-builder (nsis) конфиге,
  // иначе клик по нотификации и группировка в панели задач ломаются.
  app.setAppUserModelId('com.yourcompany.vkmanager');
}
```

Замечание: значение обязано совпадать с `appId` вашего установщика (electron-builder). Если оно задаётся где-то выше — сверьте идентичность строки.

### Патч 3 — безопасный клик по уведомлению с восстановлением окна (P2-1)

```ts
function focusMainWindow() {
  if (!mainWindow) return;
  if (mainWindow.isMinimized()) mainWindow.restore();
  if (!mainWindow.isVisible()) mainWindow.show();
  // Обход блокировки фокуса на Windows
  mainWindow.setAlwaysOnTop(true);
  mainWindow.focus();
  mainWindow.setAlwaysOnTop(false);
}

notif.on('click', () => {
  focusMainWindow();
  mainWindow?.webContents.send('vk:open-chat', message.peer_id);
});
```

### Патч 4 — таймаут для загрузки аватара (P2-2)

```ts
let notifIcon: Electron.NativeImage | string | undefined = getIconPath() || undefined;
if (user?.photo_100) {
  try {
    const ac = new AbortController();
    const t = setTimeout(() => ac.abort(), 2000);
    const resp = await fetch(user.photo_100, { signal: ac.signal });
    clearTimeout(t);
    if (resp.ok) {
      const buf = Buffer.from(await resp.arrayBuffer());
      const img = nativeImage.createFromBuffer(buf);
      if (!img.isEmpty()) notifIcon = img;
    }
  } catch {
    // тихо откатываемся на дефолтную иконку
  }
}
```

### Патч 5 — валидация отправителя и типов IPC (P1-4)

Добавьте хелперы и оберните регистрацию:

```ts
// Разрешённый origin рендерера. Для собранного приложения обычно file://,
// для dev — ваш devServer URL. Настройте под проект.
function isTrustedSender(event: Electron.IpcMainInvokeEvent | Electron.IpcMainEvent): boolean {
  const url = event.senderFrame?.url ?? '';
  return url.startsWith('file://') || url.startsWith('http://localhost:');
}

function handleSecure(
  channel: string,
  fn: (event: Electron.IpcMainInvokeEvent, ...args: any[]) => any,
) {
  ipcMain.handle(channel, (event, ...args) => {
    if (!isTrustedSender(event)) {
      throw new Error(`IPC ${channel}: недоверенный отправитель`);
    }
    return fn(event, ...args);
  });
}
```

Далее замените `ipcMain.handle('config:save', ...)` на валидируемую версию:

```ts
const ALLOWED_CONFIG_KEYS = new Set<keyof AppConfig>([
  'autoLaunch', 'dndMode', 'soundEnabled', 'groupId', 'token', 'downloadDir',
  // ...перечислите реальные ключи AppConfig
]);

function sanitizeConfig(input: unknown): Partial<AppConfig> {
  if (!input || typeof input !== 'object') return {};
  const out: Partial<AppConfig> = {};
  for (const [k, v] of Object.entries(input as Record<string, unknown>)) {
    if (ALLOWED_CONFIG_KEYS.has(k as keyof AppConfig)) {
      (out as any)[k] = v;
    }
  }
  return out;
}

handleSecure('config:save', (_, raw) => {
  const newCfg = sanitizeConfig(raw);
  config = storeService.saveConfig(newCfg);
  if (typeof newCfg.autoLaunch === 'boolean') {
    updateAutoLaunch(config.autoLaunch);
  }
  vkService.updateCredentials(config.groupId, config.token);
  updateTrayMenu();
  return config;
});
```

### Патч 6 — ограничение чтения файлов путями из диалога (P1-3)

Ведите whitelist путей, выданных через `dialog:select-file`, и проверяйте его в `file:get-data-url` / `media:upload`:

```ts
const allowedFilePaths = new Set<string>();

ipcMain.handle('dialog:select-file', async () => {
  if (!mainWindow) return null;
  const res = await dialog.showOpenDialog(mainWindow, {
    title: 'Выберите изображение для отправки в чат',
    properties: ['openFile'],
    filters: [
      { name: 'Изображения (*.jpg, *.jpeg, *.png, *.webp)', extensions: ['jpg', 'jpeg', 'png', 'webp'] },
    ],
  });
  if (res.canceled || !res.filePaths[0]) return null;
  const picked = path.resolve(res.filePaths[0]);
  allowedFilePaths.add(picked);
  return picked;
});

ipcMain.handle('file:get-data-url', async (_, filePath: string) => {
  try {
    if (typeof filePath !== 'string') return null;
    const resolved = path.resolve(filePath);
    if (!allowedFilePaths.has(resolved)) return null;   // только явно выбранные файлы
    if (!fs.existsSync(resolved)) return null;
    const ext = path.extname(resolved).toLowerCase();
    const isImage = ['.jpg', '.jpeg', '.png', '.gif', '.webp'].includes(ext);
    if (!isImage) return null;
    const buf = await fs.promises.readFile(resolved);
    const mime =
      ext === '.png' ? 'image/png' :
      ext === '.gif' ? 'image/gif' :
      ext === '.webp' ? 'image/webp' : 'image/jpeg';
    return `data:${mime};base64,${buf.toString('base64')}`;
  } catch {
    return null;
  }
});
```

Аналогично проверяйте `filePath` в `media:upload` против `allowedFilePaths` перед загрузкой.

### Патч 7 — валидация URL и асинхронная запись в `media:download-track` (P2-3)

```ts
ipcMain.handle('media:download-track', async (_, url: string, defaultFileName: string) => {
  if (!mainWindow) return null;
  if (typeof url !== 'string') return null;

  let parsed: URL;
  try {
    parsed = new URL(url);
  } catch {
    throw new Error('Некорректный URL');
  }
  if (parsed.protocol !== 'https:' && parsed.protocol !== 'http:') {
    throw new Error('Разрешены только http/https ссылки');
  }

  const cleanName = String(defaultFileName).replace(/[/\\?%*:|"<>]/g, '_');
  const targetDir = config.downloadDir || app.getPath('downloads');
  const defaultPath = path.join(targetDir, cleanName);

  const saveRes = await dialog.showSaveDialog(mainWindow, {
    defaultPath,
    filters: [
      { name: 'Аудиофайл', extensions: ['mp3', 'wav', 'flac', 'ogg'] },
      { name: 'Все файлы', extensions: ['*'] },
    ],
  });
  if (saveRes.canceled || !saveRes.filePath) return null;

  const resp = await fetch(parsed.toString());
  if (!resp.ok) throw new Error(`HTTP ${resp.status}: ${resp.statusText}`);
  const arrayBuf = await resp.arrayBuffer();
  await fs.promises.writeFile(saveRes.filePath, Buffer.from(arrayBuf)); // без блокировки main
  return saveRes.filePath;
});
```

### Патч 8 — строгий `shell:open-external` (P2-4)

```ts
ipcMain.handle('shell:open-external', (_, url) => {
  if (typeof url !== 'string') return;
  try {
    const parsed = new URL(url);
    if (parsed.protocol === 'https:' || parsed.protocol === 'http:') {
      shell.openExternal(parsed.toString());
    }
  } catch {
    // невалидный URL — игнорируем
  }
});
```

---

## Что нужно для завершения аудита (критерий 2 — автозапуск)

Реализация автозапуска (`updateAutoLaunch`, вызов `reg.exe`, `app.setLoginItemSettings`) в диапазоне 381–739 отсутствует — вижу только точки вызова (`строки 499, 724–726`). Чтобы проверить экранирование путей с пробелами, флаг `--hidden` и конфликт с внутренней регистрацией Electron, пришлите тело `updateAutoLaunch` и место вызова `app.setLoginItemSettings`, если оно есть.

Забегая вперёд, типовые дефекты в таком коде и как их закрывать:

- Кавычки для путей с пробелами при записи в HKCU\...\Run: значение обязано быть вида `"C:\Path With Spaces\app.exe" --hidden`. При вызове `reg.exe` через дочерний процесс не собирайте строку конкатенацией — используйте `execFile('reg', ['add', ..., '/d', `"${exe}" --hidden`, '/f'])` с массивом аргументов, чтобы избежать инъекции команд.
- Конфликт с Electron: если параллельно вызывается `app.setLoginItemSettings({ openAtLogin: true })`, Electron создаёт свою запись в Run — получите две записи автозапуска. Выберите один механизм. Для тонкого контроля над `--hidden` и именем значения предпочтительнее либо только `reg.exe`, либо только `setLoginItemSettings({ openAtLogin, args: ['--hidden'] })`.
- Имя значения в реестре должно быть стабильным (например, `VKManager`), иначе отключение автозапуска не найдёт запись, созданную Electron под другим именем.

Пришлёте эти участки — дам патч с корректным `execFile`-вызовом и единым источником истины для автозапуска.

---

## МОДУЛЬ 4: REACT 19 UI, НАВИГАЦИЯ, БЕСКОНЕЧНЫЙ СКРОЛЛ И ДИАЛОГИ

# Аудит фронтенд-архитектуры: App.tsx + ConversationsList.tsx

## Вердикт

Архитектура рабочая для 40-100 диалогов, но не выдержит целевую нагрузку 500-2000 бесед и активный Long Poll. Три класса проблем блокируют продакшн:

1. Пагинация фактически сломана — `loadConversations` затирает список вместо аппенда (`строка 70`), поэтому «бесконечная подгрузка» на `строка 377` каждый раз заменяет данные новой страницей.
2. Long Poll-эффект пересоздаёт все подписки при каждом переключении чата (`строка 213`), открывая окно гонки и потери событий.
3. Ноль мемоизации + отсутствие виртуализации: каждое входящее сообщение форсит полный ре-рендер списка на 2000 DOM-узлов.

Отдельно: критерий про Web Audio / config.volume в предоставленном коде **не реализован вообще** — в `App.tsx` и `ConversationsList.tsx` нет ни `AudioContext`, ни воспроизведения звука на `onMessageNew`. Аудировать нечего, поэтому даю целевую реализацию ниже. Если звук живёт в другом модуле — покажите его, разберу отдельно.

---

## P1 дефекты

### P1-1. Пагинация затирает список — infinite scroll не работает
`строка 70` делает `setConversations(res.items)`. При вызове `onLoadMoreConversations` с `offset = conversations.length` (`строка 377`) вы заменяете весь список следующими 40 элементами, теряя предыдущие. Пользователь видит «прыжок» и не может доскроллить.

### P1-2. Гонка при переключении чатов
`loadHistory` (`строки 79-96`) асинхронна и не проверяет актуальность выбора после `await`. Быстрое переключение A→B может отрисовать историю A в открытом B (кто медленнее ответил — тот и победил). Плюс `messages` не очищаются при выборе, так что виден чужой чат до завершения загрузки.

### P1-3. Пересоздание Long Poll подписок на каждый выбор чата
Эффект на `строках 105-213` зависит от `[selectedPeerId]`. Каждое переключение отписывает и переподписывает `onMessageNew/Reply/Reaction/Activity/Network/OpenChat`. В окне между `unreg*()` и повторной подпиской события теряются. Нужна регистрация один раз через ref на актуальный `selectedPeerId`.

### P1-4. Нет дедупликации входящих сообщений
`строка 145` и `строка 168`: `setMessages((prev) => [...prev, message])` без проверки по `id`. Long Poll штатно доставляет дубликаты и повторы при реконнекте; ваши же исходящие приходят и через `onMessageReply`, и как эхо. Получаем задвоенные пузыри.

### P1-5. Нет виртуализации + фильтрация без мемоизации
`ConversationsList строка 31`: `.filter()` по всему массиву прогоняется на каждый ре-рендер родителя (то есть на каждое входящее сообщение), а `.map` на `строке 152` рендерит все совпадения в DOM. На 2000 бесед это фризы ввода в поиске и просадка FPS при трафике.

### P1-6. Реакции инкрементятся на каждое событие
`строка 181`: `count + 1` на каждый `onReactionUpdate`. События реакций идемпотентно не обрабатываются — при ретрансляции Long Poll счётчик убегает. Нужна сверка с серверным состоянием, а не слепой инкремент.

---

## P2 / P3 рекомендации

- P2 — `isLoadingMore` не прокидывается из `App` в `ConversationsList` (`строки 371-380`), поэтому спиннер догрузки (`строка 207`) мёртв, а guard в `handleScroll` (`строка 40`) всегда `false`.
- P2 — Все хендлеры (`handleSelectConversation`, `handleSendMessage`, …) пересоздаются каждый рендер и передаются в дочерние компоненты. Без `useCallback` + `React.memo` мемоизация списка бессмысленна.
- P2 — `totalUnread`, `unreadMessagesCount`, `selectedConversation` считаются reduce/find на каждый рендер (`строки 216-218, 297`). Обернуть в `useMemo`.
- P2 — Поиск без debounce (`строка 72`): каждый символ = фильтр по 2000 элементов синхронно.
- P3 — Строки диалогов это `<div onClick>` (`строка 157`), не доступны с клавиатуры. Нужен `role="button"` + `tabIndex` + `onKeyDown`, либо `<button>`.
- P3 — Невалидный Tailwind-класс `py-0.2` (`строки 196, 338, 361`) — такого шага нет, паддинг не применяется. Должно быть `py-0.5`.
- P3 — `formatTimestamp` создаёт `new Date()` на каждую строку каждый рендер — вынести в мемо-карту или считать реже.

---

## Готовые React-патчи

### Патч 1 — App.tsx: refs, стабильный Long Poll, пагинация-аппенд, дедуп, гонки

```tsx
import React, { useState, useEffect, useRef, useCallback, useMemo } from 'react';

export const App: React.FC = () => {
  // ...state без изменений...
  const [isLoadingMore, setIsLoadingMore] = useState(false);

  // Ref на актуальный выбор — читается внутри стабильных подписок
  const selectedPeerIdRef = useRef<number | null>(null);
  useEffect(() => { selectedPeerIdRef.current = selectedPeerId; }, [selectedPeerId]);

  // Токен запроса истории для защиты от гонок переключения
  const historyReqRef = useRef(0);

  const loadConversations = useCallback(async (offset = 0) => {
    if (!window.scmAPI) return;
    const isMore = offset > 0;
    isMore ? setIsLoadingMore(true) : setIsLoadingConversations(true);
    try {
      const res = await window.scmAPI.getConversations(offset, 40);
      setTotalConversationsCount(res.count);
      setConversations((prev) => {
        if (!isMore) return res.items;
        // Аппенд с дедупом по peerId
        const seen = new Set(prev.map((c) => c.peerId));
        return [...prev, ...res.items.filter((c) => !seen.has(c.peerId))];
      });
    } catch (err) {
      console.error('Failed to load conversations:', err);
    } finally {
      isMore ? setIsLoadingMore(false) : setIsLoadingConversations(false);
    }
  }, []);

  const loadHistory = useCallback(async (peerId: number) => {
    if (!window.scmAPI) return;
    const reqId = ++historyReqRef.current;
    setMessages([]);            // очищаем чужой чат сразу
    setIsLoadingMessages(true);
    try {
      const res = await window.scmAPI.getHistory(peerId, 50);
      // Ответ устарел — пользователь уже переключился
      if (reqId !== historyReqRef.current) return;
      setMessages(res.items);
      await window.scmAPI.markAsRead(peerId);
      setConversations((prev) =>
        prev.map((c) => (c.peerId === peerId ? { ...c, unreadCount: 0 } : c))
      );
    } catch (err) {
      console.error('Failed to load history:', err);
    } finally {
      if (reqId === historyReqRef.current) setIsLoadingMessages(false);
    }
  }, []);

  const handleSelectConversation = useCallback((peerId: number) => {
    setSelectedPeerId(peerId);
    setActiveTab('chats');
    loadHistory(peerId);
  }, [loadHistory]);

  // Подписки регистрируются ОДИН раз, актуальный чат берём из ref
  useEffect(() => {
    if (!window.scmAPI) return;

    const upsertLastMessage = (peerId: number, msg: VKMessage, out: boolean, user?: any) =>
      setConversations((prev) => {
        const idx = prev.findIndex((c) => c.peerId === peerId);
        const last = { id: msg.id, date: msg.date, text: msg.text || '[Вложение]', out };
        if (idx >= 0) {
          const next = [...prev];
          const isActive = selectedPeerIdRef.current === peerId;
          next[idx] = {
            ...next[idx],
            lastMessage: last,
            unreadCount: out || isActive ? next[idx].unreadCount : next[idx].unreadCount + 1,
          };
          // всплываем беседу наверх
          const [item] = next.splice(idx, 1);
          return [item, ...next];
        }
        if (out) return prev;
        return [{
          peerId,
          user: user || { id: msg.from_id, first_name: 'Пользователь', last_name: '', photo_100: '' },
          lastMessage: last,
          unreadCount: 1,
        }, ...prev];
      });

    // дедуп по id при добавлении в открытый чат
    const appendMessage = (msg: VKMessage) =>
      setMessages((prev) => (prev.some((m) => m.id === msg.id) ? prev : [...prev, msg]));

    const unregMsgNew = window.scmAPI.onMessageNew(({ message, user }) => {
      upsertLastMessage(message.peer_id, message, false, user);
      if (selectedPeerIdRef.current === message.peer_id) {
        appendMessage(message);
        window.scmAPI.markAsRead(message.peer_id);
      }
    });

    const unregMsgReply = window.scmAPI.onMessageReply(({ message }) => {
      upsertLastMessage(message.peer_id, message, true);
      if (selectedPeerIdRef.current === message.peer_id) appendMessage(message);
    });

    const unregReaction = window.scmAPI.onReactionUpdate((data) => {
      if (selectedPeerIdRef.current !== data.peer_id) return;
      setMessages((prev) => prev.map((m) => {
        const cmid = m.conversation_message_id || m.id;
        if (cmid !== data.cmid) return m;
        const reactions = m.reactions ? [...m.reactions] : [];
        const i = reactions.findIndex((r) => r.reaction_id === data.reaction_id);
        // берём авторитетный count из события, не инкрементим вслепую
        if (i >= 0) reactions[i] = { ...reactions[i], count: data.count ?? reactions[i].count + 1 };
        else reactions.push({ reaction_id: data.reaction_id, count: data.count ?? 1 });
        return { ...m, reactions };
      }));
    });

    const unregActivity = window.scmAPI.onActivity((ev) => setActivityEvents((prev) => [ev, ...prev]));
    const unregNet = window.scmAPI.onNetworkStatus((s) => setIsConnected(s.connected));
    const unregOpenChat = window.scmAPI.onOpenChat((peerId) => handleSelectConversation(peerId));

    return () => {
      unregMsgNew(); unregMsgReply(); unregReaction();
      unregActivity(); unregNet(); unregOpenChat();
    };
  }, [handleSelectConversation]); // handleSelectConversation стабилен → эффект не пересоздаётся
```

Если API реакций не возвращает `count`, добавьте это поле в типы события Long Poll — слепой инкремент (`строка 181`) иначе не починить корректно.

### Патч 2 — App.tsx: мемоизация производных значений и передача isLoadingMore

```tsx
  const unreadMessagesCount = useMemo(
    () => conversations.reduce((acc, c) => acc + (c.unreadCount || 0), 0),
    [conversations]
  );
  const unreadActivityCount = useMemo(
    () => activityEvents.filter((e) => !e.read).length,
    [activityEvents]
  );
  const totalUnread = unreadMessagesCount + unreadActivityCount;

  const selectedConversation = useMemo(
    () => conversations.find((c) => c.peerId === selectedPeerId) ?? null,
    [conversations, selectedPeerId]
  );

  const handleLoadMore = useCallback(
    () => loadConversations(conversations.length),
    [loadConversations, conversations.length]
  );
```

```tsx
  <ConversationsList
    conversations={conversations}
    selectedPeerId={selectedPeerId}
    onSelectConversation={handleSelectConversation}
    isLoading={isLoadingConversations}
    isLoadingMore={isLoadingMore}            // теперь реально прокинут
    totalConversationsCount={totalConversationsCount}
    onLoadMoreConversations={handleLoadMore}
    onLoadAllConversations={() => loadConversations(0)}
    onRefreshConversations={() => loadConversations(0)}
  />
```

### Патч 3 — ConversationsList: memo, useMemo для фильтра, debounce, a11y

```tsx
import React, { useState, useRef, useMemo, useEffect, useCallback } from 'react';

function useDebounced<T>(value: T, delay = 200) {
  const [v, setV] = useState(value);
  useEffect(() => {
    const t = setTimeout(() => setV(value), delay);
    return () => clearTimeout(t);
  }, [value, delay]);
  return v;
}

const ConversationsListImpl: React.FC<ConversationsListProps> = ({ /* props */ }) => {
  const [searchQuery, setSearchQuery] = useState('');
  const [filterUnread, setFilterUnread] = useState(false);
  const listRef = useRef<HTMLDivElement>(null);
  const debouncedQuery = useDebounced(searchQuery, 200);

  const filtered = useMemo(() => {
    const q = debouncedQuery.toLowerCase();
    return conversations.filter((c) => {
      const matchesUnread = !filterUnread || c.unreadCount > 0;
      if (!matchesUnread) return false;
      if (!q) return true;
      const fullName = `${c.user.first_name} ${c.user.last_name}`.toLowerCase();
      return fullName.includes(q) || c.lastMessage.text.toLowerCase().includes(q);
    });
  }, [conversations, debouncedQuery, filterUnread]);

  const unreadTotal = useMemo(
    () => conversations.reduce((n, c) => n + (c.unreadCount > 0 ? 1 : 0), 0),
    [conversations]
  );

  const handleScroll = useCallback(() => {
    const el = listRef.current;
    if (!el || isLoading || isLoadingMore || conversations.length >= totalConversationsCount) return;
    if (el.scrollTop + el.clientHeight >= el.scrollHeight - 60) onLoadMoreConversations();
  }, [isLoading, isLoadingMore, conversations.length, totalConversationsCount, onLoadMoreConversations]);

  // ...в разметке строки диалога делаем доступной:
  // <div role="button" tabIndex={0}
  //   onClick={() => onSelectConversation(item.peerId)}
  //   onKeyDown={(e) => { if (e.key === 'Enter' || e.key === ' ') onSelectConversation(item.peerId); }}
  //   ... >
  // и заменить py-0.2 → py-0.5 в бейджах
};

export const ConversationsList = React.memo(ConversationsListImpl);
```

### Патч 4 — Виртуализация (обязательна для 500-2000 строк)

Строки диалогов фиксированной высоты (~68px) — идеальный кейс для `@tanstack/react-virtual`. Рендерим только видимое окно, `handleScroll` заменяется на `onScroll` от виртуализатора либо остаётся для догрузки.

```tsx
// npm i @tanstack/react-virtual
import { useVirtualizer } from '@tanstack/react-virtual';

const rowVirtualizer = useVirtualizer({
  count: filtered.length,
  getScrollElement: () => listRef.current,
  estimateSize: () => 68,
  overscan: 8,
});

<div ref={listRef} onScroll={handleScroll} className="flex-1 overflow-y-auto">
  <div style={{ height: rowVirtualizer.getTotalSize(), position: 'relative' }}>
    {rowVirtualizer.getVirtualItems().map((vr) => {
      const item = filtered[vr.index];
      return (
        <div
          key={item.peerId}
          style={{ position: 'absolute', top: 0, left: 0, width: '100%',
                   transform: `translateY(${vr.start}px)`, height: vr.size }}
        >
          {/* содержимое строки */}
        </div>
      );
    })}
  </div>
</div>
```

Замечание: `divide-y` перестанет работать с абсолютным позиционированием — перенесите разделитель в `border-b` на самой строке.

### Патч 5 — Web Audio: singleton AudioContext + config.volume + DND (отсутствует, добавляем)

Один переиспользуемый `AudioContext`, без утечек нод (каждый `BufferSource`/`GainNode` одноразовый и отключается в `onended`), громкость из `config.volume`, глушение в DND.

```tsx
// src/hooks/useNotificationSound.ts
import { useEffect, useRef, useCallback } from 'react';

export function useNotificationSound(volume: number, muted: boolean) {
  const ctxRef = useRef<AudioContext | null>(null);
  const bufferRef = useRef<AudioBuffer | null>(null);
  const volumeRef = useRef(volume);
  const mutedRef = useRef(muted);

  useEffect(() => { volumeRef.current = volume; }, [volume]);
  useEffect(() => { mutedRef.current = muted; }, [muted]);

  const ensureLoaded = useCallback(async () => {
    if (!ctxRef.current) {
      ctxRef.current = new (window.AudioContext || (window as any).webkitAudioContext)();
    }
    if (!bufferRef.current) {
      const res = await fetch('assets/notify.mp3');
      const arr = await res.arrayBuffer();
      bufferRef.current = await ctxRef.current.decodeAudioData(arr);
    }
  }, []);

  const play = useCallback(async () => {
    if (mutedRef.current || volumeRef.current <= 0) return;
    await ensureLoaded();
    const ctx = ctxRef.current!;
    if (ctx.state === 'suspended') await ctx.resume(); // autoplay policy
    const src = ctx.createBufferSource();
    const gain = ctx.createGain();
    gain.gain.value = Math.min(1, Math.max(0, volumeRef.current));
    src.buffer = bufferRef.current!;
    src.connect(gain).connect(ctx.destination);
    src.onended = () => { src.disconnect(); gain.disconnect(); }; // защита от утечки нод
    src.start();
  }, [ensureLoaded]);

  useEffect(() => () => { ctxRef.current?.close(); ctxRef.current = null; }, []);
  return play;
}
```

Подключение в `App` внутри стабильного эффекта Long Poll:

```tsx
const playNotify = useNotificationSound(config?.volume ?? 1, config?.dndMode ?? false);

// в onMessageNew, только для входящих в неактивном чате:
const unregMsgNew = window.scmAPI.onMessageNew(({ message, user }) => {
  upsertLastMessage(message.peer_id, message, false, user);
  const isActive = selectedPeerIdRef.current === message.peer_id;
  if (isActive) { appendMessage(message); window.scmAPI.markAsRead(message.peer_id); }
  else playNotify(); // хук сам учитывает DND и volume
});
```

`config.volume`/`dndMode` читаются через ref внутри хука, поэтому смена настроек не пересоздаёт подписки Long Poll.

---

Приоритет внедрения: P1-1 и P1-3 первыми (данные и события), затем P1-4/P1-2 (консистентность чата), после — P1-5 + виртуализация под целевые 2000 бесед. Патчи давал фрагментами по границам изменений; перед мержем нужно прогнать сборку и проверить типы `ReactionUpdate`/`getConversations` в `types/scm` — я их не видел, полагался на использование в коде.

---

## МОДУЛЬ 5А: ЧАТ, МЕДИА, РЕАКЦИИ И АУДИОПЛЕЕР

ВЕРДИКТ: Интерфейс визуально проработан, но функциональный слой хрупкий. Все асинхронные операции (отправка, загрузка, реакции, стикеры) выполняются по принципу fire-and-forget без индикации загрузки, обработки ошибок IPC и защиты от повторных кликов. При сбое `onSendMessage` текст пользователя теряется безвозвратно. Рендер сообщений не мемоизирован — наведение на один пузырь ре-рендерит весь список. Автоскролл срабатывает всегда, ломая чтение истории. Не готов к продакшену без исправления P1.

## P1 — функциональные дефекты

- `78-87` handleSend: текст очищается (`setInputText('')`) до `await`. При reject IPC сообщение теряется, ошибка не ловится, нет `isSending` — возможен двойной сабмит по Enter/клику.
- `96-101` handleFileChange: `onUploadImage` не `await`, нет обработки ошибок, нет валидации типа/размера файла, нет индикации загрузки. Сбой загрузки — тихий.
- `202`, `303`, `429` onSendReaction/onSendSticker: промисы не обрабатываются. Отклонение IPC не показывается пользователю.
- `57-59` Автоскролл: `scrollIntoView` на любое изменение `messages` (включая обновление реакций) с `smooth`. Читая историю, пользователь будет насильно сброшен вниз при любом апдейте. Нужно скроллить только если он уже у нижней границы.
- `180-321` Ре-рендер: весь `.map` пересоздаётся при смене `hoveredMessageCmid`. Наведение на одно сообщение ре-рендерит все. Нужен вынос в `memo`-компонент, ховер-стейт локально.
- `246` Выбор фото: `sizes[sizes.length-1]` предполагает сортировку по возрастанию — VK этого не гарантирует. Возможен показ превью вместо оригинала.
- `257` AudioPlayer `src`: `link_mp3 || link_ogg` может быть `undefined`, если оба пусты. Плюс несколько плееров не координируются (одновременное воспроизведение).

## P2/P3 — UI и надёжность

- `403-411` Textarea: нет авто-роста при вводе. `style.height='auto'` в `handleSend` (85) — мёртвый код, т.к. высота никогда не растёт в `onChange`.
- `187` `key={m.id || cmid}`: индексные ключи во вложенных `map` (`attIdx` 244, `rIdx` 298) вызывают лишние ре-рендеры/баги при изменении порядка.
- `235`, `359` `from_id === user.id ? ... : 'Сообщество'` — бинарное допущение. В чатах с несколькими операторами метка неверна.
- `287` `att.doc.size` без guard → `NaN МБ`, если размер отсутствует.
- `449-468`, `436-446` Модалки/вьювер: нет закрытия по Escape и focus-trap (a11y).
- `426-432` EmojiPicker: нет закрытия по клику вне (только `onClose`), `onSelectSticker` может быть `undefined`.
- `121` fallback-аватар грузится с `vk.com` по сети — стоит локальный ассет.

## Патчи

Состояние и защищённые хендлеры:

```tsx
const [isSending, setIsSending] = useState(false);
const [isUploading, setIsUploading] = useState(false);
const [sendError, setSendError] = useState<string | null>(null);

const handleSend = async () => {
  const text = inputText.trim();
  if (!text || isSending) return;

  const replyId = replyingTo?.conversation_message_id ?? replyingTo?.id;
  setIsSending(true);
  setSendError(null);
  try {
    await onSendMessage(text, replyId);
    setInputText('');           // очищаем только после успеха
    setReplyingTo(null);
    if (textareaRef.current) textareaRef.current.style.height = 'auto';
  } catch (err) {
    setSendError('Не удалось отправить сообщение. Попробуйте снова.');
    // текст сохранён в inputText — пользователь не теряет ввод
  } finally {
    setIsSending(false);
  }
};

const MAX_UPLOAD_BYTES = 25 * 1024 * 1024;

const handleFileChange = async (e: React.ChangeEvent<HTMLInputElement>) => {
  const file = e.target.files?.[0];
  e.target.value = '';
  if (!file) return;
  if (!file.type.startsWith('image/')) {
    setSendError('Можно прикреплять только изображения.');
    return;
  }
  if (file.size > MAX_UPLOAD_BYTES) {
    setSendError('Файл больше 25 МБ.');
    return;
  }
  setIsUploading(true);
  setSendError(null);
  try {
    await onUploadImage(file);
  } catch {
    setSendError('Не удалось загрузить изображение.');
  } finally {
    setIsUploading(false);
  }
};

const handleReaction = async (cmid: number, reactionId: number) => {
  try {
    await onSendReaction(cmid, reactionId);
  } catch {
    setSendError('Не удалось поставить реакцию.');
  }
};
```

Кнопки с индикацией и защитой:

```tsx
<button onClick={handleSend} disabled={!inputText.trim() || isSending} ...>
  {isSending
    ? <svg className="w-5 h-5 animate-spin" .../>   // спиннер
    : <svg className="w-5 h-5" .../>}
</button>

<button onClick={() => fileInputRef.current?.click()} disabled={isUploading} ...>
  {isUploading ? <span className="animate-pulse">…</span> : <svg .../>}
</button>

{sendError && (
  <div className="absolute -top-8 left-3 right-3 text-[11px] text-rose-400 bg-surface-950/90 px-2 py-1 rounded-lg">
    {sendError}
  </div>
)}
```

Умный автоскролл (только когда пользователь внизу):

```tsx
const listRef = useRef<HTMLDivElement>(null);
const atBottomRef = useRef(true);

const handleScroll = () => {
  const el = listRef.current;
  if (!el) return;
  atBottomRef.current = el.scrollHeight - el.scrollTop - el.clientHeight < 120;
};

useEffect(() => {
  if (atBottomRef.current) {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }
}, [messages]);

// сброс при смене диалога — мгновенно вниз
useEffect(() => {
  atBottomRef.current = true;
  messagesEndRef.current?.scrollIntoView({ behavior: 'auto' });
}, [conversation?.peerId]);

// <div ref={listRef} onScroll={handleScroll} className="flex-1 overflow-y-auto p-4 space-y-3">
```

Мемоизированный элемент сообщения (ховер локально, устраняет ре-рендер всего списка):

```tsx
const MessageBubble = React.memo(function MessageBubble({
  m, user, onReact, onReply, onOpenMedia,
}: {
  m: VKMessage;
  user: ConversationItem['user'];
  onReact: (cmid: number, reactionId: number) => void;
  onReply: (m: VKMessage) => void;
  onOpenMedia: (url: string) => void;
}) {
  const [hovered, setHovered] = useState(false);
  const isOut = m.out === 1;
  const cmid = m.conversation_message_id ?? m.id;

  const photoUrl = (att: VKMessage['attachments'][number]) => {
    const sizes = att.photo?.sizes ?? [];
    // выбираем max по площади, не полагаясь на порядок
    return sizes.reduce((a, b) =>
      (b.width ?? 0) * (b.height ?? 0) > (a.width ?? 0) * (a.height ?? 0) ? b : a
    , sizes[0])?.url;
  };

  return (
    <div
      onMouseEnter={() => setHovered(true)}
      onMouseLeave={() => setHovered(false)}
      className={`flex flex-col ${isOut ? 'items-end' : 'items-start'} group relative`}
    >
      {/* ...quick reactions: onClick={() => onReact(cmid, r.id)} ... */}
      {/* ...bubble... */}
    </div>
  );
});

// в списке:
messages.map((m) => (
  <MessageBubble
    key={m.conversation_message_id ?? m.id}
    m={m}
    user={user}
    onReact={handleReaction}
    onReply={setReplyingTo}
    onOpenMedia={setActiveMediaUrl}
  />
))
```

Escape-закрытие для вьювера медиа (то же для модалок):

```tsx
useEffect(() => {
  if (!activeMediaUrl) return;
  const onKey = (e: KeyboardEvent) => e.key === 'Escape' && setActiveMediaUrl(null);
  window.addEventListener('keydown', onKey);
  return () => window.removeEventListener('keydown', onKey);
}, [activeMediaUrl]);
```

Guard размера документа (`287`):

```tsx
<div className="text-[10px] opacity-70">
  {att.doc.size ? `${(att.doc.size / 1024 / 1024).toFixed(1)} МБ` : ''}
</div>
```

AudioPlayer с проверкой источника (`253-261`):

```tsx
{att.type === 'audio_message' && att.audio_message &&
  (att.audio_message.link_mp3 || att.audio_message.link_ogg) && (
  <AudioPlayer
    key={att.audio_message.id ?? attIdx}
    src={(att.audio_message.link_mp3 || att.audio_message.link_ogg)!}
    duration={att.audio_message.duration}
    waveform={att.audio_message.waveform}
  />
)}
```

Приоритет исправлений: сначала P1 (потеря текста, тихие ошибки IPC, автоскролл, мемоизация), затем P2/P3. Точные типы `VKMessage`/вложений подгони под `../types/scm` — я не видел их определения, поэтому опциональные поля (`width`, `size`, `id`) отмечены как возможно отсутствующие.

---

## МОДУЛЬ 5Б: ЛЕНТА АКТИВНОСТИ, НАСТРОЙКИ И OPEN SOURCE ДИСТРИБУЦИЯ

ВЕРДИКТ: Лента активности — не соответствует ТЗ по двум из трёх критериев: репост-каскады не дедуплицируются (только `like`), а сброс счётчика непрочитанного при просмотре отсутствует полностью. Настройки — валидация токена и ID группы в компоненте отсутствует как класс; сохранение без перезапуска работает, но volume/scale спамят IPC и часть вызовов не защищена optional-chaining. OSS-чистота: явных приватных токенов нет, но остались брендовые артефакты («SCM», хардкод версии Long Poll, «с Windows»).

## P1 — функциональные дефекты

- `ActivityFeed.tsx:14-26` Дедупликация покрывает только `type === 'like'`, хотя по ТЗ и комментарию (стр. 13) нужны и репосты. Каскадные репосты не схлопываются.
- `ActivityFeed.tsx:16-22` Ключ дедупа = `userId + type + timestamp`, без идентификатора объекта (пост/фото). Два разных лайка одного юзера в окне 8с на разные посты будут ошибочно слиты. Нужен `targetId`/`objectId`.
- `ActivityFeed.tsx:14` (весь компонент) Отсутствует механизм «сброс счётчика при просмотре». Нет `useEffect`, нет колбэка `onMarkRead`. `totalUnread` (стр. 28) никогда не обнуляется при открытии ленты/фильтра. Критерий 1.3 не выполнен.
- `ActivityFeed.tsx:28` vs `208` Рассинхрон логики «непрочитано»: счётчик считает `!e.read` (при `undefined` → непрочитано), а подсветка/точка проверяют строго `item.read === false`. События с `read === undefined` попадут в счётчик, но не подсветятся.
- `SettingsModal.tsx` (весь файл) Нет полей и валидации токена и ID группы (критерий 2.1). Смена сообщества делегируется в onboarding (стр. 227-235), но в самом модале валидации нет — если ТЗ требует правки здесь, функционал отсутствует.

## P2 — UI/надёжность

- `SettingsModal.tsx:53-57` `handleChangeVolume` вызывает `saveConfig` на каждый тик слайдера — шторм IPC. Нужен debounce/сохранение на `onMouseUp`.
- `SettingsModal.tsx:43,49,55` `window.scmAPI.saveConfig` без optional-chaining (в отличие от стр. 32) — краш, если `scmAPI` не инициализирован.
- `SettingsModal.tsx:41-57` Нет `try/catch` вокруг `await saveConfig` — реджект промиса роняет обработчик и оставляет UI в рассинхроне с конфигом.
- `ActivityFeed.tsx:16` `findIndex` внутри `filter` даёт O(n²) на каждый рендер. На больших лентах — заметный лаг. Плюс весь блок не мемоизирован (`useMemo`).
- `SettingsModal.tsx:150-155,163-167` `text-accent` на нативном `<input type=checkbox>` не красит его в большинстве браузеров — используйте `accent-[color]` (accent-color) или кастомный toggle.

## P3 — OSS-чистота / прочее

- `ActivityFeed.tsx:108` Хардкод `Bots Long Poll 5.199` — версию API выносим в конфиг/константу.
- `ActivityFeed.tsx:200` Строка «SCM автоматически отслеживает…» — брендовый артефакт, замените на нейтральное/`communityName`.
- `SettingsModal.tsx:147` «Автозапуск с Windows» — платформенный хардкод, ломает универсальность на macOS/Linux.
- `ActivityFeed.tsx:223` Фолбэк-аватар `vk.com/images/camera_100.png` — приемлемо (generic VK), но лучше локальный ассет для оффлайна.

## Патчи

Дедупликация лайков и репостов с учётом объекта + мемоизация (`ActivityFeed.tsx:1`, `13-26`):

```tsx
import React, { useState, useMemo, useEffect } from 'react';
```

```tsx
// Дедупликация каскадных реакций VK (лайк/репост на пост + вложенные медиа от одного юзера)
const DEDUP_WINDOW_SEC = 8;

const deduplicatedEvents = useMemo(() => {
  const seen: ActivityEvent[] = [];
  return events.filter((e) => {
    if (e.type === 'like' || e.type === 'repost') {
      const isCascade = seen.some(
        (other) =>
          other.type === e.type &&
          other.userId === e.userId &&
          // разные объекты не схлопываем; сравниваем targetId, если он есть
          (other.targetId ?? null) === (e.targetId ?? null) &&
          Math.abs(other.timestamp - e.timestamp) <= DEDUP_WINDOW_SEC
      );
      seen.push(e);
      if (isCascade) return false;
    } else {
      seen.push(e);
    }
    return true;
  });
}, [events]);
```

Если поля `targetId` в типе нет — добавьте в `ActivityEvent` (types/scm) `targetId?: number | string;`.

Сброс счётчика при просмотре — прокидываем колбэк и помечаем прочитанным при показе фильтра (`ActivityFeed.tsx:4-11`, `33-39`):

```tsx
interface ActivityFeedProps {
  events: ActivityEvent[];
  onOpenChat: (userId: number) => void;
  onMarkRead?: (ids: Array<ActivityEvent['id']>) => void;
  communityName?: string;
}
```

```tsx
export const ActivityFeed: React.FC<ActivityFeedProps> = ({ events, onOpenChat, onMarkRead, communityName }) => {
  const [filter, setFilter] = useState<'all' | 'unread' | 'subscribers' | 'reactions' | 'comments'>('all');
```

```tsx
const filteredEvents = useMemo(() => deduplicatedEvents.filter((e) => {
  if (filter === 'unread') return !e.read;
  if (filter === 'subscribers') return e.type === 'join' || e.type === 'leave';
  if (filter === 'reactions') return e.type === 'like' || e.type === 'repost';
  if (filter === 'comments') return e.type === 'comment';
  return true;
}), [deduplicatedEvents, filter]);

// Сброс счётчика: помечаем видимые непрочитанные как прочитанные при просмотре
useEffect(() => {
  const unreadIds = filteredEvents.filter((e) => !e.read).map((e) => e.id);
  if (unreadIds.length && onMarkRead) {
    const t = setTimeout(() => onMarkRead(unreadIds), 800); // задержка, чтобы юзер успел увидеть выделение
    return () => clearTimeout(t);
  }
}, [filteredEvents, onMarkRead]);
```

Унификация признака «непрочитано» (`ActivityFeed.tsx:208`, `213`):

```tsx
className={`... ${
  !item.read
    ? 'border-accent-border bg-gradient-to-r from-accent/10 via-surface-900/90 to-surface-900/90'
    : 'border-surface-800 hover:border-surface-700/80'
}`}
```

```tsx
{!item.read && (
  <span className="absolute top-2.5 right-2.5 flex h-2 w-2" title="Новое непрочитанное событие">
```

Защита IPC-вызовов + debounce громкости (`SettingsModal.tsx:41-65`):

```tsx
const persist = async (patch: Partial<AppConfig>) => {
  try {
    if (!window.scmAPI?.saveConfig) return;
    const updated = await window.scmAPI.saveConfig(patch);
    onConfigUpdated(updated);
  } catch (err) {
    console.error('Не удалось сохранить настройки:', err);
  }
};

const handleToggleAutoLaunch = (val: boolean) => { setAutoLaunch(val); persist({ autoLaunch: val }); };
const handleToggleSound = (val: boolean) => { setSoundEnabled(val); persist({ soundEnabled: val }); };

const volumeTimer = React.useRef<ReturnType<typeof setTimeout>>();
const handleChangeVolume = (val: number) => {
  setVolume(val);
  clearTimeout(volumeTimer.current);
  volumeTimer.current = setTimeout(() => persist({ volume: val }), 300);
};

const handleChangeUiScale = (factor: number) => {
  setUiScale(factor);
  window.scmAPI?.setZoomFactor?.(factor);
  persist({ uiScale: factor });
};
```

Кроссплатформенная подпись автозапуска (`SettingsModal.tsx:147`):

```tsx
<div className="font-medium text-white text-xs">Автозапуск при старте системы</div>
```

Нативный чекбокс красим корректно (`SettingsModal.tsx:154`, `167`):

```tsx
className="w-4 h-4 rounded accent-[var(--accent,#3b82f6)] focus:ring-0 cursor-pointer"
```

По валидации токена/ID группы: если она должна жить в этом модале, дайте знать — добавлю поля с проверкой формата токена (`/^vk1\.a\.[A-Za-z0-9_-]+$/`) и `groupId` (положительное число), с блокировкой «Сохранить» до успешной валидации через `groups.getById`.

