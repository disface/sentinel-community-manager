import fs from 'node:fs';
import path from 'node:path';
import { app, safeStorage } from 'electron';
import { AppConfig, QuickTemplate, ActivityEvent } from './types';

const DEFAULT_TEMPLATES: QuickTemplate[] = [
  {
    id: 'welcome-1',
    title: 'Приветствие',
    category: 'welcome',
    text: 'Привет, {name}! Спасибо за обращение в наше сообщество. Чем мы можем вам помочь?',
  },
  {
    id: 'hours-1',
    title: 'График работы',
    category: 'hours',
    text: 'Здравствуйте, {name}! Мы на связи ежедневно с 10:00 до 20:00 по московскому времени. Сейчас оператор ответит вам!',
  },
  {
    id: 'order-1',
    title: 'Оформление заказа',
    category: 'order',
    text: 'Здравствуйте, {name}! Чтобы оформить заказ или уточнить детали, пожалуйста, напишите наименование интересующей услуги или товара, и мы сразу сориентируем по срокам и стоимости.',
  },
  {
    id: 'faq-1',
    title: 'Частые вопросы (FAQ)',
    category: 'faq',
    text: 'Здравствуйте, {name}! Подробные ответы на частые вопросы собраны в меню и обсуждениях нашего сообщества. Если не нашли нужного — напишите сюда, с радостью подскажем!',
  },
];

export class StoreService {
  private dataDir: string;
  private configFile: string;
  private templatesFile: string;
  private activityFile: string;
  private config: AppConfig;
  private templates: QuickTemplate[];
  private tokenLocked: boolean = false;

  constructor(appRoot: string) {
    this.dataDir = path.join(appRoot, 'data');
    this.configFile = path.join(this.dataDir, 'config.json');
    this.templatesFile = path.join(this.dataDir, 'templates.json');
    this.activityFile = path.join(this.dataDir, 'activity.json');

    if (!fs.existsSync(this.dataDir)) {
      try {
        fs.mkdirSync(this.dataDir, { recursive: true });
      } catch (e) {
        console.error('[StoreService] Ошибка создания каталога data:', e);
      }
    }

    this.config = this.loadConfig();
    this.templates = this.loadTemplates();
  }

  private atomicWriteJson(file: string, data: unknown): void {
    const json = JSON.stringify(data, null, 2);
    const tmp = `${file}.${process.pid}.${Date.now()}.tmp`;
    const fd = fs.openSync(tmp, 'w');
    try {
      fs.writeFileSync(fd, json, 'utf-8');
      fs.fsyncSync(fd);
    } finally {
      fs.closeSync(fd);
    }
    fs.renameSync(tmp, file);
  }

  private readRawConfig(): any | null {
    try {
      if (fs.existsSync(this.configFile)) {
        return JSON.parse(fs.readFileSync(this.configFile, 'utf-8'));
      }
    } catch {
      /* ignore */
    }
    return null;
  }

  private loadConfig(): AppConfig {
    let defaultDownload = '';
    try {
      defaultDownload = app.getPath('downloads');
    } catch {
      defaultDownload = path.join(process.cwd(), 'downloads');
    }

    const defaultConfig: AppConfig = {
      groupId: 0,
      groupName: '',
      groupScreenName: '',
      groupPhoto: '',
      token: '',
      themeAccent: 'vk-blue',
      autoLaunch: false,
      dndMode: false,
      soundEnabled: true,
      volume: 80,
      downloadDir: defaultDownload,
      uiScale: 1.0,
    };

    if (fs.existsSync(this.configFile)) {
      try {
        const raw = fs.readFileSync(this.configFile, 'utf-8');
        const parsed = JSON.parse(raw);
        let token = '';

        if (parsed.encryptedToken) {
          let isEncAvailable = false;
          try {
            isEncAvailable = safeStorage.isEncryptionAvailable();
          } catch {
            isEncAvailable = false;
          }

          if (isEncAvailable) {
            try {
              token = safeStorage.decryptString(Buffer.from(parsed.encryptedToken, 'base64'));
            } catch (e) {
              console.error('[StoreService] Ошибка расшифровки токена через DPAPI:', e);
              token = '';
              this.tokenLocked = true;
            }
          } else {
            console.error('[StoreService] DPAPI недоступно при старте — токен временно заблокирован.');
            token = '';
            this.tokenLocked = true;
          }
        } else {
          token = parsed.token || '';
        }

        const { encryptedToken, ...rest } = parsed;

        return {
          ...defaultConfig,
          ...rest,
          token,
          hasToken: Boolean(token && token.length > 0) || Boolean(parsed.encryptedToken),
        };
      } catch (e) {
        console.error('[StoreService] Ошибка чтения config.json:', e);
      }
    }

    return defaultConfig;
  }

  public getConfig(): AppConfig {
    return { ...this.config };
  }

  public getConfigForRenderer(): AppConfig {
    const { token, ...safe } = this.config as any;
    delete safe.encryptedToken;
    return {
      ...safe,
      hasToken: Boolean(this.config.token && this.config.token.length > 0) || this.tokenLocked,
    };
  }

  public saveConfig(updates: Partial<AppConfig>): AppConfig {
    this.config = { ...this.config, ...updates };

    const rawConfig = this.readRawConfig() || {};
    const { token, hasToken, ...rest } = this.config as any;
    delete rest.encryptedToken;

    const toSave: any = { ...rest };

    if (updates.token !== undefined) {
      const cleanToken = updates.token.trim();
      if (cleanToken) {
        let isEncAvailable = false;
        try {
          isEncAvailable = safeStorage.isEncryptionAvailable();
        } catch {
          isEncAvailable = false;
        }

        if (isEncAvailable) {
          try {
            toSave.encryptedToken = safeStorage.encryptString(cleanToken).toString('base64');
            this.tokenLocked = false;
          } catch (e) {
            console.error('[StoreService] Не удалось зашифровать токен через DPAPI:', e);
            if (rawConfig.encryptedToken) {
              toSave.encryptedToken = rawConfig.encryptedToken;
            }
          }
        } else {
          console.error('[StoreService] DPAPI недоступно — запись токена в plaintext запрещена.');
          if (rawConfig.encryptedToken) {
            toSave.encryptedToken = rawConfig.encryptedToken;
          }
        }
      } else {
        delete toSave.encryptedToken;
        this.tokenLocked = false;
        this.config.token = '';
      }
    } else {
      if (rawConfig.encryptedToken) {
        toSave.encryptedToken = rawConfig.encryptedToken;
      }
    }

    delete toSave.token;

    try {
      this.atomicWriteJson(this.configFile, toSave);
    } catch (e) {
      console.error('[StoreService] Ошибка записи config.json:', e);
    }

    return this.getConfig();
  }

  private isTemplate(x: any): x is QuickTemplate {
    return (
      x &&
      typeof x.id === 'string' &&
      typeof x.title === 'string' &&
      typeof x.category === 'string' &&
      typeof x.text === 'string'
    );
  }

  private loadTemplates(): QuickTemplate[] {
    if (fs.existsSync(this.templatesFile)) {
      try {
        const raw = fs.readFileSync(this.templatesFile, 'utf-8');
        const list = JSON.parse(raw);
        if (Array.isArray(list) && list.every((t) => this.isTemplate(t)) && list.length > 0) {
          return list;
        }
      } catch (e) {
        console.error('[StoreService] Ошибка чтения templates.json:', e);
      }
    }

    this.saveTemplates(DEFAULT_TEMPLATES);
    return DEFAULT_TEMPLATES;
  }

  public getTemplates(): QuickTemplate[] {
    return [...this.templates];
  }

  public saveTemplates(templates: QuickTemplate[]): QuickTemplate[] {
    this.templates = templates;
    try {
      this.atomicWriteJson(this.templatesFile, templates);
    } catch (e) {
      console.error('[StoreService] Ошибка записи templates.json:', e);
    }
    return this.getTemplates();
  }

  public saveTemplate(tmpl: QuickTemplate): QuickTemplate[] {
    const idx = this.templates.findIndex((t) => t.id === tmpl.id);
    if (idx >= 0) {
      this.templates[idx] = tmpl;
    } else {
      this.templates.push(tmpl);
    }
    this.saveTemplates(this.templates);
    return this.getTemplates();
  }

  public deleteTemplate(id: string): QuickTemplate[] {
    this.templates = this.templates.filter((t) => t.id !== id);
    this.saveTemplates(this.templates);
    return this.getTemplates();
  }

  public getActivityEvents(): ActivityEvent[] {
    if (fs.existsSync(this.activityFile)) {
      try {
        const raw = fs.readFileSync(this.activityFile, 'utf-8');
        const list = JSON.parse(raw);
        if (Array.isArray(list)) {
          return list;
        }
      } catch (e) {
        console.error('[StoreService] Ошибка чтения activity.json:', e);
      }
    }
    return [];
  }

  public loadActivity(): ActivityEvent[] {
    return this.getActivityEvents();
  }

  public addActivityEvent(event: ActivityEvent): ActivityEvent[] {
    const current = this.getActivityEvents();
    const updated = [event, ...current.slice(0, 299)];
    try {
      this.atomicWriteJson(this.activityFile, updated);
    } catch (e) {
      console.error('[StoreService] Ошибка записи activity.json:', e);
    }
    return updated;
  }

  public markActivityRead(timestamp?: number): void {
    const current = this.getActivityEvents();
    const updated = current.map((item) => {
      if (!timestamp || item.timestamp <= timestamp) {
        return { ...item, read: true };
      }
      return item;
    });
    try {
      this.atomicWriteJson(this.activityFile, updated);
    } catch (e) {
      console.error('[StoreService] Ошибка обновления статуса read в activity.json:', e);
    }
  }

  public markActivityAsRead(id?: string): ActivityEvent[] {
    const current = this.getActivityEvents();
    const updated = current.map((item) => {
      if (!id || item.id === id) {
        return { ...item, read: true };
      }
      return item;
    });
    try {
      this.atomicWriteJson(this.activityFile, updated);
    } catch (e) {
      console.error('[StoreService] Ошибка обновления статуса read в activity.json:', e);
    }
    return updated;
  }

  public clearActivity(): void {
    try {
      this.atomicWriteJson(this.activityFile, []);
    } catch (e) {
      console.error('[StoreService] Ошибка очистки activity.json:', e);
    }
  }
}
