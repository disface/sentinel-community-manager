#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""
Микро-батчинг инженерного аудита Sentinel Community Manager (Open Source Desktop)
через Claude Opus 4.8 (JustDoWork).
Разбивает кодовую базу на 7 независимых модулей (<22k символов),
гарантируя быстрый Time-To-First-Token (<35с) и защиту от Cloudflare таймаутов.
Результаты кэшируются в .audit_cache/ и сводятся в CLAUDE_4.8_AUDIT_REPORT.md.
"""

import os
import sys
import json
import time
import ssl
import re
import argparse
import urllib.request
import urllib.error
from pathlib import Path

if sys.stdout and hasattr(sys.stdout, "reconfigure"):
    sys.stdout.reconfigure(encoding="utf-8", errors="replace")
if sys.stderr and hasattr(sys.stderr, "reconfigure"):
    sys.stderr.reconfigure(encoding="utf-8", errors="replace")

PROJECT_DIR = Path("C:/CODE/SENTINEL_CM")
CACHE_DIR = PROJECT_DIR / ".audit_cache"
REPORT_PATH = PROJECT_DIR / "CLAUDE_4.8_AUDIT_REPORT.md"
API_URL = "https://api.justwoker.icu/v1/messages"
MODEL_NAME = "claude-opus-4-8"

MODULES = [
    {
        "id": "store_dpapi",
        "title": "МОДУЛЬ 1: БЕЗОПАСНОСТЬ ХРАНИЛИЩА, WINDOWS DPAPI И УТЕЧКИ ТОКЕНОВ",
        "target": "electron/store-service.ts (строки 1-271)",
        "files": [("electron/store-service.ts", 1, 271)],
        "instructions": (
            "Ты Principal Security Engineer и эксперт по безопасности десктопных приложений на Windows.\n"
            "Проведи глубокий критический аудит electron/store-service.ts публичного open-source клиента Sentinel Community Manager (SCM).\n"
            "Отвечай строго по делу, лаконично, без воды и долгих рассуждений.\n\n"
            "КРИТЕРИИ АУДИТА:\n"
            "1. Жизненный цикл safeStorage (DPAPI): доступность шифрования safeStorage.isEncryptionAvailable() относительно app.whenReady(). Что происходит, если StoreService инициализируется до whenReady()?\n"
            "2. Защита токена VK: риск стирания токена при неудачной расшифровке, риск записи токена в plaintext при сбоях safeStorage.\n"
            "3. Атомарность записи файлов (config.json, templates.json, activity.json): защита от повреждения файлов (0 байт) при аварийном завершении или отключении питания.\n"
            "4. Утечки секретов: валидация данных при сохранении, защита от утечки шифротекста или токена в рендерер.\n\n"
            "ФОРМАТ:\n"
            "- ВЕРДИКТ по безопасности хранилища.\n"
            "- P0/P1 критические дефекты со ссылками `строка`.\n"
            "- P2/P3 рекомендации со ссылками `строка`.\n"
            "- Готовый проверенный код исправлений."
        )
    },
    {
        "id": "longpoll_core",
        "title": "МОДУЛЬ 2А: ЯДРО BOTS LONG POLL 5.199, СЕТЕВАЯ УСТОЙЧИВОСТЬ И ОБРЫВЫ",
        "target": "electron/vk-service.ts (строки 650-1001: pollLoop, failed=1..4, reconnect)",
        "files": [("electron/vk-service.ts", 650, 1001)],
        "instructions": (
            "Ты Principal Network Engineer и ведущий эксперт по протоколу VK Bots Long Poll 5.199.\n"
            "Проведи детальный аудит сетевого цикла Long Poll в electron/vk-service.ts (строки 650-1001) приложения Sentinel Community Manager.\n"
            "Отвечай строго по делу, лаконично, без воды и долгих рассуждений.\n\n"
            "КРИТЕРИИ АУДИТА:\n"
            "1. Обработка кодов failed Long Poll: failed=1 (актуализация ts), failed=2 (истечение key / повторный getLongPollServer), "
            "failed=3 (потеря данных / сброс ts), failed=4 (неподдерживаемая версия API).\n"
            "2. Устойчивость к обрывам сети и засыпанию ПК: экспоненциальный бэкофф, таймауты сокетов (AbortSignal.timeout), "
            "восстановление соединения при выходе из сна Windows (powerMonitor.on('resume')).\n"
            "3. Порядок продвижения ts: когда обновляется lpTs (до или после успешной обработки пачки апдейтов)? Есть ли риск потери входящих сообщений?\n"
            "4. Диспетчеризация событий (handleUpdate): защита от дубликатов сообщений при повторных запросах, обработка каскадных реакций.\n\n"
            "ФОРМАТ:\n"
            "- ВЕРДИКТ по сетевой устойчивости ядра.\n"
            "- P0/P1 критические дефекты со ссылками `строка`.\n"
            "- P2/P3 замечания со ссылками `строка`.\n"
            "- Готовые фрагменты кода исправлений."
        )
    },
    {
        "id": "vk_api_methods",
        "title": "МОДУЛЬ 2Б: API МЕТОДЫ, МЕДИА, РЕАКЦИИ И ДЕДУПЛИКАЦИЯ",
        "target": "electron/vk-service.ts (строки 1-650: callApi, updateCredentials, реакции, загрузка фото/голоса)",
        "files": [("electron/vk-service.ts", 1, 650)],
        "instructions": (
            "Ты Principal Integration Engineer по VK API.\n"
            "Проведи аудит методов обращения к VK API, загрузки медиа и управления сервисом в electron/vk-service.ts (строки 1-650).\n\n"
            "КРИТЕРИИ АУДИТА:\n"
            "1. Метод updateCredentials: что происходит, если сервис был остановлен (или не стартовал из-за отсутствия токена), а пользователь ввёл токен в настройках? Запускается ли сервис?\n"
            "2. Метод callApi: обработка ошибок VK (код 6 — RPS, код 9 — flood control, код 14 — captcha, код 5 — auth), сетевые сбои fetch, таймауты.\n"
            "3. Реакции на сообщения (sendReaction, deleteReaction): валидация cmid, peer_id, reaction_id.\n"
            "4. Загрузка вложений: sendVoiceMessage, uploadPhoto (строгая валидация формата JPEG, предотвращение утечек дескрипторов и временных файлов, проверка ответов серверов загрузки).\n"
            "5. Кэш профилей (userCache): риск переполнения памяти при длительной работе менеджера (нужен ли LRU/TTL?).\n\n"
            "ФОРМАТ:\n"
            "- Вердикт по качеству API-клиента.\n"
            "- P0/P1 дефекты со ссылками `строка`.\n"
            "- P2/P3 рекомендации со ссылками `строка`.\n"
            "- Готовый код исправлений."
        )
    },
    {
        "id": "electron_runtime_core",
        "title": "МОДУЛЬ 3А: ELECTRON RUNTIME, ПОРТАТИВНОСТЬ, ИНИЦИАЛИЗАЦИЯ И ТРЕЙ",
        "target": "electron/main.ts (строки 1-380) + electron/preload.ts (строки 1-130)",
        "files": [("electron/main.ts", 1, 380), ("electron/preload.ts", 1, 130)],
        "instructions": (
            "Ты Principal Desktop Architect (Electron & Windows Security).\n"
            "Проведи аудит архитектуры жизненного цикла, инициализации и изоляции процесса в electron/main.ts и preload.ts.\n"
            "Отвечай строго по делу, лаконично, без воды и долгих рассуждений.\n\n"
            "КРИТЕРИИ АУДИТА:\n"
            "1. Порядок инициализации сервисов: создание StoreService и VkService относительно app.whenReady(). Как это влияет на safeStorage и автозапуск Long Poll?\n"
            "2. Изоляция и безопасность рендерера: contextIsolation, sandbox, webSecurity, CSP, блокировка внешних навигаций (setWindowOpenHandler, will-navigate).\n"
            "3. Портативность (Portable Executable): переопределение путей appData, userData, sessionData в папку data/ рядом с exe. Поведение при запуске с флешки/read-only диска.\n"
            "4. Single Instance Lock: app.requestSingleInstanceLock() и обработка second-instance.\n"
            "5. Жизненный цикл трея: сокрытие окна при закрытии, клик по иконке трея, корректный выход из приложения (без зависания процесса в диспетчере задач).\n\n"
            "ФОРМАТ:\n"
            "- ВЕРДИКТ по архитектуре Electron процесса.\n"
            "- P0/P1 критические дефекты со ссылками `строка`.\n"
            "- P2/P3 рекомендации со ссылками `строка`.\n"
            "- Готовый код исправлений."
        )
    },
    {
        "id": "electron_ipc_system",
        "title": "МОДУЛЬ 3Б: IPC ВЗАИМОДЕЙСТВИЕ, АВТОЗАПУСК И СИСТЕМНЫЕ УВЕДОМЛЕНИЯ",
        "target": "electron/main.ts (строки 381-739)",
        "files": [("electron/main.ts", 381, 739)],
        "instructions": (
            "Ты Lead Windows Systems & Electron IPC Engineer.\n"
            "Проведи аудит IPC-обработчиков, автозапуска и системных нотификаций в electron/main.ts (строки 381-739).\n\n"
            "КРИТЕРИИ АУДИТА:\n"
            "1. Безопасность IPC-обработчиков: валидация аргументов из рендерера, обработка ошибок, отсутствие инъекций команд.\n"
            "2. Автозапуск в Windows 11: регистрация в реестре HKCU Run через reg.exe. Корректность экранирования кавычек путей с пробелами и аргумента --hidden. Устранение конфликтов с внутренней регистрацией Electron.\n"
            "3. Системные уведомления Windows: app.setAppUserModelId, показ имени и аватара собеседника, обработка клика по уведомлению (фокусировка окна и открытие чата).\n"
            "4. Обработка powerMonitor (сна/пробуждения Windows): горячий рестарт Long Poll при возобновлении работы системы.\n\n"
            "ФОРМАТ:\n"
            "- Вердикт по надежности системной интеграции.\n"
            "- P0/P1 дефекты со ссылками `строка`.\n"
            "- P2/P3 рекомендации со ссылками `строка`.\n"
            "- Готовые патчи кода."
        )
    },
    {
        "id": "react_navigation_state",
        "title": "МОДУЛЬ 4: REACT 19 UI, НАВИГАЦИЯ, БЕСКОНЕЧНЫЙ СКРОЛЛ И ДИАЛОГИ",
        "target": "src/App.tsx (строки 1-442) + src/components/ConversationsList.tsx (строки 1-219)",
        "files": [("src/App.tsx", 1, 442), ("src/components/ConversationsList.tsx", 1, 219)],
        "instructions": (
            "Ты Principal Frontend Architect (React 19 / TypeScript / Tailwind CSS).\n"
            "Проведи аудит архитектуры состояния, навигации и производительности в src/App.tsx и src/components/ConversationsList.tsx.\n\n"
            "КРИТЕРИИ АУДИТА:\n"
            "1. Производительность рендеринга списков: поведение списка диалогов при 500-2000 беседах, пагинация, бесконечная подгрузка, фильтрация поиска.\n"
            "2. Синхронизация состояния: реакция на Long Poll события, устранение гонок при переключении чатов, дедупликация входящих сообщений.\n"
            "3. Звуковые оповещения и Web Audio: переиспользование AudioContext, отсутствие утечек Web Audio нод, соблюдение громкости config.volume.\n"
            "4. Мемоизация и ре-рендеры: использование useCallback/useMemo/useRef для предотвращения лишних перерисовок дерева при частых входящих сообщениях.\n\n"
            "ФОРМАТ:\n"
            "- Вердикт по архитектуре фронтенда.\n"
            "- P1 дефекты со ссылками `строка`.\n"
            "- P2/P3 рекомендации со ссылками `строка`.\n"
            "- Готовые React патчи."
        )
    },
    {
        "id": "chat_view",
        "title": "МОДУЛЬ 5А: ЧАТ, МЕДИА, РЕАКЦИИ И АУДИОПЛЕЕР",
        "target": "src/components/ChatView.tsx (строки 1-471)",
        "files": [("src/components/ChatView.tsx", 1, 471)],
        "instructions": (
            "Ты Principal UX/Frontend Engineer (React 19, TypeScript).\n"
            "Проведи глубокий технический аудит интерфейса чата в src/components/ChatView.tsx.\n"
            "Отвечай строго по делу, лаконично, без воды и долгих рассуждений.\n\n"
            "КРИТЕРИИ АУДИТА:\n"
            "1. Отправка сообщений, фото, голосовых и стикеров: валидация, индикация загрузки, обработка ошибок IPC.\n"
            "2. Реакции и интерактив: отображение реакций, picker эмодзи, обработка кликов.\n"
            "3. Аудиоплеер и вложения: корректное воспроизведение, управление ресурсами, цитаты и пересланные сообщения.\n"
            "4. Производительность рендеринга сообщений: скролл к последнему сообщению, оптимизация ре-рендеров.\n\n"
            "ФОРМАТ:\n"
            "- ВЕРДИКТ по интерфейсу чата.\n"
            "- P1 функциональные и UI дефекты со ссылками `строка`.\n"
            "- P2/P3 рекомендации со ссылками `строка`.\n"
            "- Готовые React патчи."
        )
    },
    {
        "id": "activity_settings",
        "title": "МОДУЛЬ 5Б: ЛЕНТА АКТИВНОСТИ, НАСТРОЙКИ И OPEN SOURCE ДИСТРИБУЦИЯ",
        "target": "src/components/ActivityFeed.tsx (строки 1-279) + SettingsModal.tsx (строки 1-256)",
        "files": [
            ("src/components/ActivityFeed.tsx", 1, 279),
            ("src/components/SettingsModal.tsx", 1, 256)
        ],
        "instructions": (
            "Ты Principal UX/UI Engineer и Open Source Maintainer.\n"
            "Проведи аудит ленты активности и настроек в ActivityFeed.tsx и SettingsModal.tsx.\n"
            "Отвечай строго по делу, лаконично, без воды и долгих рассуждений.\n\n"
            "КРИТЕРИИ АУДИТА:\n"
            "1. Лента активности: дедупликация каскадных лайков/репостов VK, фильтрация 'Только непрочитанные', сброс счётчика при просмотре.\n"
            "2. Настройки (SettingsModal.tsx): валидация токена и ID группы, сохранение без перезапуска, масштабирование UI.\n"
            "3. Open Source чистота: отсутствие захардкоженных студийных артефактов (названий, приватных токенов, специфичных ссылок) — универсальность для любого сообщества ВК.\n\n"
            "ФОРМАТ:\n"
            "- ВЕРДИКТ по ленте активности и настройкам.\n"
            "- P1 функциональные и UI дефекты со ссылками `строка`.\n"
            "- P2/P3 рекомендации со ссылками `строка`.\n"
            "- Готовые патчи компонентов."
        )
    }
]

def sanitize(text: str) -> str:
    return re.sub(r'vk1\.a\.[A-Za-z0-9_-]+', 'vk1.a.***REDACTED_VK_TOKEN***', text)

def number_code(text: str, start_line: int = 1) -> str:
    lines = text.splitlines()
    w = len(str(start_line + len(lines)))
    return "\n".join(f"{start_line + i:>{w}} | {l}" for i, l in enumerate(lines))

def stream_request(prompt: str, api_key: str, max_retries: int = 3) -> str:
    headers = {
        "x-api-key": api_key,
        "anthropic-version": "2023-06-01",
        "Content-Type": "application/json",
        "User-Agent": "anthropic-python/0.40.0",
        "Accept": "text/event-stream"
    }
    system_prompt = (
        "Ты Principal Software Engineer & Security Architect. "
        "Твоя задача — провести жесткий, лаконичный и предельно конкретный технический аудит предоставленного кода. "
        "Без общих рассуждений, вводных фраз, приветствий и воды. "
        "Начинай ответ СРАЗУ со слова 'ВЕРДИКТ:'. "
        "Затем приводи маркированный список дефектов (P0/P1/P2) с точными ссылками на строки кода и готовыми фрагментами исправлений."
    )
    body = {
        "model": MODEL_NAME,
        "system": system_prompt,
        "messages": [{"role": "user", "content": prompt}],
        "max_tokens": 3500,
        "stream": True
    }
    data_bytes = json.dumps(body).encode("utf-8")
    ctx = ssl.create_default_context()

    for attempt in range(1, max_retries + 1):
        chunks = []
        t0 = time.time()
        print(f"[*] Отправка запроса к {MODEL_NAME} (попытка {attempt}/{max_retries})...", flush=True)

        try:
            req = urllib.request.Request(API_URL, data=data_bytes, headers=headers, method="POST")
            with urllib.request.urlopen(req, timeout=180, context=ctx) as resp:
                first_token = True
                for line in resp:
                    line_str = line.decode("utf-8", errors="replace").strip()
                    if line_str.startswith("data: "):
                        data_json = line_str[6:]
                        if data_json == "[DONE]":
                            break
                        try:
                            ev = json.loads(data_json)
                            delta = ev.get("delta", {})
                            if delta.get("type") == "text_delta":
                                text = delta.get("text", "")
                                if text:
                                    if first_token:
                                        ttft = round(time.time() - t0, 1)
                                        print(f"[*] TTFT: {ttft}с! Ответ пошёл:\n", flush=True)
                                        first_token = False
                                    chunks.append(text)
                                    sys.stdout.write(text)
                                    sys.stdout.flush()
                        except Exception:
                            pass
            
            result = "".join(chunks).strip()
            if result:
                return result
            else:
                print(f"[Warning] Пустой ответ на попытке {attempt}!", file=sys.stderr)
        except urllib.error.HTTPError as e:
            print(f"\n[HTTP Error {e.code}] {e.reason} на попытке {attempt}", file=sys.stderr)
            if attempt < max_retries:
                wait_s = 6 * attempt
                print(f"[*] Ждём {wait_s}с перед повторной попыткой...", flush=True)
                time.sleep(wait_s)
            else:
                raise
        except Exception as e:
            print(f"\n[Error] {e} на попытке {attempt}", file=sys.stderr)
            if attempt < max_retries:
                wait_s = 6 * attempt
                print(f"[*] Ждём {wait_s}с перед повторной попыткой...", flush=True)
                time.sleep(wait_s)
            else:
                raise

    return ""

def compile_master_report():
    CACHE_DIR.mkdir(parents=True, exist_ok=True)
    sections = []
    
    for idx, mod in enumerate(MODULES, 1):
        cache_file = CACHE_DIR / f"{mod['id']}.md"
        if cache_file.exists():
            content = cache_file.read_text(encoding="utf-8")
            sections.append(f"## {mod['title']}\n\n{content}\n")
        else:
            sections.append(f"## {mod['title']}\n\n*(Модуль в очереди / ещё не обработан)*\n")

    full_report = f"""# 🛡️ Сводный инженерный аудит Sentinel Community Manager (GitHub Open Source) — Claude Opus 4.8

**Дата актуализации**: {time.strftime('%Y-%m-%d %H:%M:%S')}  
**Модель**: `{MODEL_NAME}` (Claude Opus 4.8 Thinking via JustDoWork)  
**Архитектура аудита**: Focused Micro-Batching (TTFT < 35s)  
**Целевой проект**: Общедоступная версия десктопного клиента Sentinel Community Manager (`c:\\CODE\\SENTINEL_CM`)  
**Репозиторий GitHub**: `https://github.com/disface/sentinel-community-manager`  
**Стек**: Electron 34, React 19, TypeScript, Vite, Tailwind CSS, Bots Long Poll 5.199, Windows DPAPI  

---

{"\n---\n\n".join(sections)}
"""
    REPORT_PATH.write_text(full_report, encoding="utf-8")
    print(f"\n[OK] Мастер-отчёт обновлён: {REPORT_PATH}")

def main():
    parser = argparse.ArgumentParser(description="Микро-батчинг аудит Sentinel Community Manager через Claude Opus 4.8")
    parser.add_argument("--batch", type=str, default="all", help="ID модуля или 'all'")
    parser.add_argument("--force", action="store_true", help="Перезапросить даже если есть в кэше")
    args = parser.parse_args()

    api_key = os.environ.get("JUSTDOWORK_API_KEY", "").strip()
    if not api_key:
        print("[Error] JUSTDOWORK_API_KEY не установлен в переменных окружения!", file=sys.stderr)
        sys.exit(1)

    CACHE_DIR.mkdir(parents=True, exist_ok=True)

    print("=" * 80)
    print("МИКРО-БАТЧИНГ АУДИТ SENTINEL COMMUNITY MANAGER (GITHUB) — CLAUDE OPUS 4.8")
    print("=" * 80)

    target_mods = MODULES if args.batch == "all" else [m for m in MODULES if m["id"] == args.batch]
    if not target_mods:
        print(f"[Error] Модуль '{args.batch}' не найден! Доступны: {[m['id'] for m in MODULES]}")
        sys.exit(1)

    for idx, mod in enumerate(target_mods, 1):
        cache_file = CACHE_DIR / f"{mod['id']}.md"
        
        if cache_file.exists() and not args.force:
            print(f"\n[{idx}/{len(target_mods)}] [CACHE HIT] {mod['title']} — пропускаем (есть в кэше).")
            continue

        print(f"\n[{idx}/{len(target_mods)}] [START] {mod['title']}")
        print(f"    Целевой фокус: {mod['target']}")

        code_blocks = []
        for file_spec in mod["files"]:
            rel, s_line, e_line = file_spec
            fp = PROJECT_DIR / rel
            if not fp.exists():
                print(f"    [Warning] Файл {rel} не найден!")
                continue
            lines = fp.read_text(encoding="utf-8", errors="replace").splitlines()
            start_idx = (s_line - 1) if s_line else 0
            end_idx = e_line if e_line else len(lines)
            selected_lines = lines[start_idx:end_idx]
            clean = sanitize("\n".join(selected_lines))
            start_num = (s_line if s_line else 1)
            code_blocks.append(f"### ФАЙЛ `{rel}` (строки {start_num}-{start_num+len(selected_lines)-1}):\n```ts\n{number_code(clean, start_num)}\n```\n")

        prompt = (
            f"{mod['instructions']}\n\n"
            f"ИСХОДНЫЙ КОД ДЛЯ АУДИТА:\n\n" + "\n".join(code_blocks)
        )

        print(f"    Размер промпта: {len(prompt)} символов (~{len(prompt)//4} токенов).")
        t0 = time.time()
        try:
            result = stream_request(prompt, api_key)
            dt = round(time.time() - t0, 1)
            print(f"\n\n[OK] {mod['id']} завершён за {dt}с ({len(result)} символов)!")
            cache_file.write_text(result, encoding="utf-8")
            compile_master_report()
            time.sleep(2)
        except Exception as e:
            print(f"\n[Error] Сбой при аудите {mod['id']}: {e}", file=sys.stderr)
            time.sleep(2)

    compile_master_report()
    print("\n" + "=" * 80)
    print(f"[COMPLETE] Все модули обработаны! Итоговый отчет:\n{REPORT_PATH}")
    print("=" * 80)

if __name__ == "__main__":
    main()
