import fs from 'node:fs';
import path from 'node:path';
import os from 'node:os';
import { EventEmitter } from 'node:events';
import { nativeImage } from 'electron';
import { ActivityEvent, ConversationItem, ForwardedMessage, UserProfile, VKMessage } from './types';

const VK_API_VERSION = '5.199';
const VK_API_URL = 'https://api.vk.com/method/';

export class VkService extends EventEmitter {
  private groupId: number;
  private token: string;
  private isRunning: boolean = false;
  private abortController: AbortController | null = null;
  private userCache: Map<number, UserProfile> = new Map();

  // Long Poll credentials
  private lpServer: string = '';
  private lpKey: string = '';
  private lpTs: string = '';

  // Дедупликация каскадных реакций VK (лайк на пост + вложенные фото/видео)
  private lastLikeTimestamps: Map<string, number> = new Map();
  private lastLikeObjectTypes: Map<number, string> = new Map();

  // Дедупликация событий Long Poll
  private seenEventIds: Set<string> = new Set();
  private seenOrder: string[] = [];

  constructor(groupId: number, token: string) {
    super();
    this.groupId = groupId;
    this.token = token;
  }

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

  public updateCredentials(groupId: number, token: string) {
    const changed = this.groupId !== groupId || this.token !== token;
    this.groupId = groupId;
    this.token = token;
    if (changed) {
      if (this.isRunning) {
        this.restart();
      } else if (this.groupId && this.token) {
        this.start();
      }
    }
  }

  public onSystemResume() {
    if (!this.isRunning) return;
    console.log('[VkService] ПК проснулся: сброс сетевого запроса и рестарт Long Poll');
    try {
      this.abortController?.abort();
    } catch {}
    this.lpServer = '';
    this.lpKey = '';
    this.lpTs = '';
    this.restart();
  }

  private async callApi(method: string, params: Record<string, any> = {}): Promise<any> {
    if (!this.token) {
      throw new Error('VK токен не задан');
    }

    const query = new URLSearchParams({
      access_token: this.token,
      v: VK_API_VERSION,
      ...params,
    });

    const res = await fetch(`${VK_API_URL}${method}?${query.toString()}`);
    if (!res.ok) {
      throw new Error(`HTTP ${res.status}: ${res.statusText}`);
    }

    const json = await res.json();
    if (json.error) {
      throw new Error(`VK Error [${json.error.error_code}]: ${json.error.error_msg}`);
    }

    return json.response;
  }

  public async getGroupInfo(): Promise<any> {
    const res = await this.callApi('groups.getById', { group_id: this.groupId });
    return res.groups ? res.groups[0] : res[0];
  }

  public async getUser(userId: number): Promise<UserProfile> {
    if (this.userCache.has(userId)) {
      return this.userCache.get(userId)!;
    }

    // Если отрицательный ID — это сообщество
    if (userId < 0) {
      const gRes = await this.callApi('groups.getById', { group_id: Math.abs(userId) });
      const group = gRes.groups ? gRes.groups[0] : gRes[0];
      const profile: UserProfile = {
        id: userId,
        first_name: group?.name || 'Сообщество',
        last_name: '',
        photo_100: group?.photo_100 || '',
        photo_200: group?.photo_200 || group?.photo_100 || '',
      };
      this.userCache.set(userId, profile);
      return profile;
    }

    const res = await this.callApi('users.get', {
      user_ids: userId,
      fields: 'photo_100,photo_200,photo_max_orig,city,country,status,about,bdate,last_seen,sex,can_write_private_message,screen_name,online,online_mobile',
    });

    const u = res[0] || { id: userId, first_name: 'Пользователь', last_name: `#${userId}`, photo_100: '' };
    const profile: UserProfile = {
      id: u.id,
      first_name: u.first_name,
      last_name: u.last_name,
      photo_100: u.photo_100 || '',
      photo_200: u.photo_200 || u.photo_100 || '',
      photo_max: u.photo_max_orig || u.photo_200 || u.photo_100 || '',
      status: u.status || '',
      about: u.about || '',
      city: u.city?.title || '',
      country: u.country?.title || '',
      bdate: u.bdate || '',
      last_seen: u.last_seen,
      online: u.online,
      online_mobile: u.online_mobile,
      screen_name: u.screen_name || `id${u.id}`,
      can_write: u.can_write_private_message === 1,
    };
    if (this.userCache.size > 500) {
      const firstKey = this.userCache.keys().next().value;
      if (firstKey !== undefined) this.userCache.delete(firstKey);
    }
    this.userCache.set(userId, profile);
    return profile;
  }

  public async getUserDetails(userId: number): Promise<UserProfile> {
    // Принудительное обновление детального профиля без кэша
    this.userCache.delete(userId);
    return await this.getUser(userId);
  }

  public async getConversations(offset: number = 0, count: number = 20): Promise<{ count: number; items: ConversationItem[] }> {
    const res = await this.callApi('messages.getConversations', {
      offset,
      count,
      filter: 'all',
      extended: 1,
      fields: 'photo_100,photo_200,photo_max,city,last_seen,online,online_mobile,screen_name,status',
    });

    if (res.profiles) {
      for (const p of res.profiles) {
        this.userCache.set(p.id, {
          id: p.id,
          first_name: p.first_name,
          last_name: p.last_name,
          photo_100: p.photo_100 || '',
          photo_200: p.photo_200 || p.photo_100 || '',
          photo_max: p.photo_max || p.photo_200 || p.photo_100 || '',
          city: p.city?.title || '',
          last_seen: p.last_seen,
          online: p.online,
          online_mobile: p.online_mobile,
          screen_name: p.screen_name,
          status: p.status,
        });
      }
    }

    const items: ConversationItem[] = [];
    for (const item of res.items || []) {
      const peerId = item.conversation.peer.id;
      let user = this.userCache.get(peerId);
      if (!user) {
        user = await this.getUser(peerId);
      }

      items.push({
        peerId,
        user,
        lastMessage: {
          id: item.last_message?.id || 0,
          date: item.last_message?.date || 0,
          text: item.last_message?.text || (item.last_message?.attachments?.length ? '[Вложение]' : ''),
          out: item.last_message?.out === 1,
        },
        unreadCount: item.conversation.unread_count || 0,
        in_read: item.conversation.in_read,
        out_read: item.conversation.out_read,
        in_read_cmid: item.conversation.in_read_cmid,
        out_read_cmid: item.conversation.out_read_cmid,
      });
    }

    return {
      count: res.count,
      items,
    };
  }

  public async getPeerStatus(peerId: number): Promise<{ out_read: number; in_read: number; online: number; online_mobile?: number; last_seen?: any; user?: UserProfile }> {
    const res = await this.callApi('messages.getConversationsById', {
      peer_ids: peerId,
      extended: 1,
      fields: 'online,online_mobile,last_seen,photo_100,photo_200,city,status,screen_name',
    });

    const conv = res.items?.[0];
    const profile = res.profiles?.[0];

    if (profile) {
      this.userCache.set(profile.id, {
        id: profile.id,
        first_name: profile.first_name,
        last_name: profile.last_name,
        photo_100: profile.photo_100 || '',
        photo_200: profile.photo_200 || profile.photo_100 || '',
        photo_max: profile.photo_max_orig || profile.photo_200 || profile.photo_100 || '',
        city: profile.city?.title || '',
        last_seen: profile.last_seen,
        online: profile.online,
        online_mobile: profile.online_mobile,
        screen_name: profile.screen_name,
        status: profile.status,
      });
    }

    return {
      out_read: conv?.out_read || 0,
      in_read: conv?.in_read || 0,
      online: profile?.online ? 1 : 0,
      online_mobile: profile?.online_mobile ? 1 : 0,
      last_seen: profile?.last_seen,
      user: profile ? this.userCache.get(profile.id) : undefined,
    };
  }

  public async getHistory(peerId: number, count: number = 100, offset: number = 0): Promise<{ items: VKMessage[]; totalCount: number }> {
    const res = await this.callApi('messages.getHistory', {
      peer_id: peerId,
      count,
      offset,
      extended: 1,
      fields: 'photo_100,photo_200,online,last_seen',
    });

    if (res.profiles) {
      for (const p of res.profiles) {
        this.userCache.set(p.id, {
          id: p.id,
          first_name: p.first_name,
          last_name: p.last_name,
          photo_100: p.photo_100 || '',
          photo_200: p.photo_200 || p.photo_100 || '',
          online: p.online,
          online_mobile: p.online_mobile,
          last_seen: p.last_seen,
        });
      }
    }

    if (res.groups) {
      for (const g of res.groups) {
        this.userCache.set(-g.id, {
          id: -g.id,
          first_name: g.name || 'Сообщество',
          last_name: '',
          photo_100: g.photo_100 || '',
          photo_200: g.photo_200 || g.photo_100 || '',
        });
      }
    }

    const messages: VKMessage[] = (res.items || []).map((m: any) => ({
      id: m.id,
      peer_id: m.peer_id,
      from_id: m.from_id,
      date: m.date,
      text: m.text,
      out: m.out,
      conversation_message_id: m.conversation_message_id,
      reactions: m.reactions,
      attachments: m.attachments?.map((a: any) => this.mapAttachment(a)),
      reply_message: m.reply_message ? {
        id: m.reply_message.id,
        from_id: m.reply_message.from_id,
        text: m.reply_message.text,
        attachments: m.reply_message.attachments?.map((a: any) => this.mapAttachment(a)),
      } : undefined,
      fwd_messages: this.mapFwdMessages(m.fwd_messages),
    }));

    return {
      items: messages.reverse(),
      totalCount: res.count ?? messages.length,
    };
  }

  public async sendMessage(peerId: number, text: string, attachment?: string, replyTo?: number): Promise<number> {
    const randomId = Math.floor(Math.random() * 2147483647);
    const params: Record<string, any> = {
      peer_id: peerId,
      random_id: randomId,
      message: text,
    };
    if (attachment) {
      params.attachment = attachment;
    }
    if (replyTo) {
      params.reply_to = replyTo;
    }

    const res = await this.callApi('messages.send', params);
    return typeof res === 'number' ? res : (res[0]?.message_id || randomId);
  }

  public async sendSticker(peerId: number, stickerId: number): Promise<number> {
    const randomId = Math.floor(Math.random() * 2147483647);
    const params: Record<string, any> = {
      peer_id: peerId,
      random_id: randomId,
      sticker_id: stickerId,
    };
    const res = await this.callApi('messages.send', params);
    return typeof res === 'number' ? res : (res[0]?.message_id || randomId);
  }

  public async editMessage(peerId: number, cmid: number, text: string, messageId?: number): Promise<boolean> {
    const params: Record<string, any> = {
      peer_id: peerId,
      message: text,
      keep_forward_messages: 1,
      keep_snippets: 1,
    };
    if (cmid) {
      params.conversation_message_id = cmid;
    } else if (messageId) {
      params.message_id = messageId;
    }

    await this.callApi('messages.edit', params);
    return true;
  }

  public async deleteMessage(peerId: number, cmid: number, messageId?: number): Promise<boolean> {
    const params: Record<string, any> = {
      delete_for_all: 1,
    };
    if (cmid) {
      params.peer_id = peerId;
      params.conversation_message_ids = cmid;
    } else if (messageId) {
      params.message_ids = messageId;
    } else {
      throw new Error('Не указан идентификатор сообщения для удаления');
    }

    await this.callApi('messages.delete', params);
    return true;
  }

  public async markAsRead(peerId: number): Promise<void> {
    await this.callApi('messages.markAsRead', { peer_id: peerId });
  }

  public async banUser(userId: number, comment: string = 'Спам'): Promise<boolean> {
    await this.callApi('groups.ban', {
      group_id: this.groupId,
      owner_id: userId,
      end_date: 0, // Навсегда
      reason: 0, // Другое (Спам)
      comment: comment || 'Блокировка спама',
      comment_visible: 0,
    });
    return true;
  }

  public async deleteConversation(peerId: number): Promise<boolean> {
    await this.callApi('messages.deleteConversation', {
      group_id: this.groupId,
      peer_id: peerId,
    });
    return true;
  }

  public async sendReaction(peerId: number, cmid: number, reactionId: number): Promise<boolean> {
    await this.callApi('messages.sendReaction', {
      peer_id: peerId,
      cmid: cmid,
      reaction_id: reactionId,
    });
    return true;
  }

  public async deleteReaction(peerId: number, cmid: number): Promise<boolean> {
    await this.callApi('messages.deleteReaction', {
      peer_id: peerId,
      cmid: cmid,
    });
    return true;
  }

  public async uploadAttachment(peerId: number, filePath: string): Promise<string> {
    const stats = fs.statSync(filePath);
    const fileName = path.basename(filePath);
    const ext = path.extname(filePath).toLowerCase();

    const isSupportedImage = ['.jpg', '.jpeg', '.png', '.webp', '.gif'].includes(ext);

    if (!isSupportedImage) {
      throw new Error(
        `От имени сообщества разрешена загрузка только изображений (JPG/JPEG).\n` +
        `VK API блокирует прямую загрузку аудио и видео файлов от сообществ. Для отправки файлов используйте ссылки на облачные хранилища или встроенные в VK материалы.`
      );
    }

    // Лимит VK: 50 MB для изображений
    if (stats.size > 50 * 1024 * 1024) {
      throw new Error(`Изображение «${fileName}» весит ${(stats.size / 1024 / 1024).toFixed(1)} МБ. Лимит VK API — 50 МБ.`);
    }

    const serverParams: Record<string, any> = {};
    if (peerId > 0 && peerId < 2000000000) {
      serverParams.peer_id = peerId;
    }
    const up = await this.callApi('photos.getMessagesUploadServer', serverParams);
    const uploadUrl = up.upload_url;

    // VK API сообществ требует строго валидный JPEG без лишних альфа-каналов.
    // Если передан PNG, WebP или GIF, конвертируем его в чистый JPEG буфер.
    let uploadBuffer: Buffer = fs.readFileSync(filePath);
    let uploadName: string = fileName;

    if (ext !== '.jpg' && ext !== '.jpeg') {
      try {
        const nImg = nativeImage.createFromPath(filePath);
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

    const postRes = await fetch(uploadUrl, { method: 'POST', body: form });
    const postJson = await postRes.json();

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

    const photoObj = saveRes[0];
    return `photo${photoObj.owner_id}_${photoObj.id}`;
  }

  // Запись и отправка голосового сообщения от имени сообщества
  public async sendVoiceMessage(peerId: number, buffer: Buffer): Promise<number> {
    const tempFile = path.join(os.tmpdir(), `scm_voice_${Date.now()}.ogg`);
    try {
      fs.writeFileSync(tempFile, buffer);

      const up = await this.callApi('docs.getMessagesUploadServer', {
        peer_id: peerId,
        type: 'audio_message',
      });

      const uploadUrl = up.upload_url;
      const fileBlob = await fs.openAsBlob(tempFile);
      const form = new FormData();
      form.append('file', fileBlob, 'voice.ogg');

      const postRes = await fetch(uploadUrl, { method: 'POST', body: form });
      const postJson = await postRes.json();

      if (postJson.error) {
        throw new Error(`Ошибка загрузки аудиосообщения: ${postJson.error}`);
      }

      const saveRes = await this.callApi('docs.save', {
        file: postJson.file,
      });

      const audioDoc = saveRes.audio_message || saveRes.doc || saveRes[0];
      const attachId = `doc${audioDoc.owner_id}_${audioDoc.id}`;

      return await this.sendMessage(peerId, '', attachId);
    } finally {
      if (fs.existsSync(tempFile)) {
        try { fs.unlinkSync(tempFile); } catch {}
      }
    }
  }

  private mapAttachment(a: any): any {
    if (a.type === 'photo') {
      return {
        type: 'photo',
        photo: {
          sizes: a.photo.sizes,
          text: a.photo.text,
        },
      };
    }
    if (a.type === 'doc') {
      return {
        type: 'doc',
        doc: {
          title: a.doc.title,
          size: a.doc.size,
          ext: a.doc.ext,
          url: a.doc.url,
          date: a.doc.date,
        },
      };
    }
    if (a.type === 'audio_message') {
      return {
        type: 'audio_message',
        audio_message: {
          duration: a.audio_message.duration,
          link_ogg: a.audio_message.link_ogg,
          link_mp3: a.audio_message.link_mp3,
          waveform: a.audio_message.waveform,
        },
      };
    }
    // Официальные аудиозаписи VK
    if (a.type === 'audio' && a.audio) {
      return {
        type: 'audio',
        audio: {
          id: a.audio.id,
          owner_id: a.audio.owner_id,
          artist: a.audio.artist,
          title: a.audio.title,
          duration: a.audio.duration,
          url: a.audio.url || '',
        },
      };
    }
    // Видеозаписи VK
    if (a.type === 'video') {
      const v = a.video || a;
      let previewUrl = '';
      if (Array.isArray(v.image) && v.image.length > 0) {
        previewUrl = v.image[v.image.length - 1]?.url || '';
      } else if (Array.isArray(v.first_frame) && v.first_frame.length > 0) {
        previewUrl = v.first_frame[v.first_frame.length - 1]?.url || '';
      } else {
        previewUrl = v.photo_800 || v.photo_640 || v.photo_320 || v.photo_130 || '';
      }

      const ownerId = v.owner_id || 0;
      const videoId = v.id || 0;
      const accessKey = v.access_key || '';
      const videoUrl = `https://vk.com/video${ownerId}_${videoId}${accessKey ? `?access_key=${accessKey}` : ''}`;
      const playerUrl = v.player || `https://vk.com/video_ext.php?oid=${ownerId}&id=${videoId}${accessKey ? `&access_key=${accessKey}` : ''}`;

      return {
        type: 'video',
        video: {
          id: videoId,
          owner_id: ownerId,
          title: v.title || 'Видеозапись VK',
          description: v.description || '',
          duration: v.duration || 0,
          views: v.views,
          preview_url: previewUrl,
          player: playerUrl,
          access_key: accessKey,
          url: videoUrl,
        },
      };
    }
    // Записи на стене (посты)
    if (a.type === 'wall' && a.wall) {
      const w = a.wall;
      return {
        type: 'wall',
        wall: {
          id: w.id,
          to_id: w.to_id,
          text: w.text || '',
          url: `https://vk.com/wall${w.to_id}_${w.id}`,
        },
      };
    }
    if (a.type === 'link') {
      return {
        type: 'link',
        link: {
          url: a.link.url,
          title: a.link.title,
          description: a.link.description,
        },
      };
    }
    // Истории VK (Stories)
    if (a.type === 'story' && a.story) {
      const s = a.story;
      let previewUrl = '';
      if (s.photo?.sizes?.length) {
        previewUrl = s.photo.sizes[s.photo.sizes.length - 1]?.url || '';
      } else if (s.video?.image?.length) {
        previewUrl = s.video.image[s.video.image.length - 1]?.url || '';
      } else if (s.video?.first_frame?.length) {
        previewUrl = s.video.first_frame[s.video.first_frame.length - 1]?.url || '';
      }

      let photoUrl = '';
      if (s.photo?.sizes?.length) {
        photoUrl = s.photo.sizes[s.photo.sizes.length - 1]?.url || '';
      }

      let videoUrl = '';
      if (s.video?.files) {
        videoUrl = s.video.files.mp4_720 || s.video.files.mp4_1080 || s.video.files.mp4_480 || s.video.files.mp4_360 || '';
      }

      const ownerId = s.owner_id || 0;
      const storyId = s.id || 0;
      const storyUrl = `https://vk.com/story${ownerId}_${storyId}${s.access_key ? `?access_key=${s.access_key}` : ''}`;

      return {
        type: 'story',
        story: {
          id: storyId,
          owner_id: ownerId,
          date: s.date || 0,
          preview_url: previewUrl,
          photo_url: photoUrl,
          video_url: videoUrl,
          player_url: s.video?.player || '',
          url: storyUrl,
          is_expired: !!s.is_expired,
          is_deleted: !!s.is_deleted,
        },
      };
    }
    // Стикеры VK
    if (a.type === 'sticker') {
      const s = a.sticker || a;
      const stickerId = s.sticker_id || s.id || 0;
      let img = '';
      if (Array.isArray(s.images) && s.images.length > 0) {
        img = s.images[s.images.length - 1]?.url || '';
      } else if (Array.isArray(s.images_with_background) && s.images_with_background.length > 0) {
        img = s.images_with_background[s.images_with_background.length - 1]?.url || '';
      }
      if (!img && stickerId) {
        img = `https://vk.com/sticker/1-${stickerId}-256.png`;
      }
      return {
        type: 'sticker',
        sticker: {
          sticker_id: stickerId,
          product_id: s.product_id,
          image_url: img,
          animation_url: s.animation_url,
        },
      };
    }
    return { type: a.type || 'unsupported' };
  }

  private mapFwdMessages(list?: any[]): ForwardedMessage[] | undefined {
    if (!Array.isArray(list) || list.length === 0) return undefined;
    return list.map((f: any) => {
      let authorName = '';
      let authorPhoto = '';
      if (f.from_id) {
        const cached = this.userCache.get(f.from_id);
        if (cached) {
          authorName = `${cached.first_name} ${cached.last_name}`.trim();
          authorPhoto = cached.photo_100 || '';
        } else if (f.from_id < 0) {
          authorName = `Сообщество id${Math.abs(f.from_id)}`;
        } else {
          authorName = `Пользователь id${f.from_id}`;
        }
      }
      return {
        from_id: f.from_id,
        author_name: authorName,
        author_photo: authorPhoto,
        date: f.date,
        text: f.text || '',
        attachments: f.attachments?.map((a: any) => this.mapAttachment(a)),
        fwd_messages: this.mapFwdMessages(f.fwd_messages),
      };
    });
  }

  // --- Long Poll Движок ---
  public async start(): Promise<void> {
    if (this.isRunning) return;
    if (!this.token || !this.groupId) {
      console.warn('[VkService] Не задан токен или ID сообщества');
      return;
    }

    this.isRunning = true;
    this.pollLoop().catch((err) => {
      console.error('[VkService] Фатальный сбой pollLoop:', err);
    });
  }

  public stop(): void {
    this.isRunning = false;
    if (this.abortController) {
      this.abortController.abort();
      this.abortController = null;
    }
  }

  public restart(): void {
    this.stop();
    this.lpServer = '';
    this.lpKey = '';
    this.lpTs = '';
    setTimeout(() => {
      this.start();
    }, 1000);
  }

  private async fetchLpServer(): Promise<void> {
    const res = await this.callApi('groups.getLongPollServer', { group_id: this.groupId });
    this.lpServer = res.server;
    this.lpKey = res.key;
    this.lpTs = res.ts;
    console.log(`[VkService] Long Poll сервер инициализирован: ${this.lpServer}, ts=${this.lpTs}`);
  }

  private async pollLoop(): Promise<void> {
    let retryAttempt = 0;

    while (this.isRunning) {
      try {
        if (!this.lpServer || !this.lpKey || !this.lpTs) {
          await this.fetchLpServer();
        }

        this.abortController = new AbortController();
        const timeoutSignal = AbortSignal.timeout(35000);
        const combinedSignal = AbortSignal.any([this.abortController.signal, timeoutSignal]);

        const lpUrl = `${this.lpServer}?act=a_check&key=${this.lpKey}&ts=${this.lpTs}&wait=25`;
        const res = await fetch(lpUrl, { signal: combinedSignal });

        if (!res.ok) {
          throw new Error(`HTTP ${res.status}: ${res.statusText}`);
        }

        const data = await res.json();
        retryAttempt = 0;
        this.emit('network-status', { connected: true });

        if (data.failed) {
          if (data.failed === 1) {
            this.lpTs = data.ts;
            continue;
          } else if (data.failed === 2) {
            const srv = await this.callApi('groups.getLongPollServer', { group_id: this.groupId });
            this.lpKey = srv.key;
            this.lpServer = srv.server;
            await new Promise((r) => setTimeout(r, 1000));
            continue;
          } else if (data.failed === 3) {
            await this.fetchLpServer();
            await new Promise((r) => setTimeout(r, 1000));
            continue;
          } else if (data.failed === 4) {
            console.error(`[VkService] failed=4: неподдерживаемая версия API (min=${data.min_version}, max=${data.max_version})`);
            this.emit('error', 'Неверная версия Long Poll API (нужна 5.199)');
            this.stop();
            break;
          }
        }

        if (data.updates && Array.isArray(data.updates)) {
          for (const update of data.updates) {
            try {
              await this.handleUpdate(update);
            } catch (e) {
              console.error('[VkService] Ошибка обработки update:', update?.type, e);
            }
          }
        }

        if (data.ts) {
          this.lpTs = data.ts;
        }
      } catch (err: any) {
        if (!this.isRunning) break;

        if (err.name === 'AbortError' || err.name === 'TimeoutError') {
          continue;
        }

        retryAttempt++;
        const delay = Math.min(1000 * Math.pow(2, retryAttempt), 30000) + Math.random() * 1000;
        this.emit('network-status', { connected: false, error: err.message });
        await new Promise((r) => setTimeout(r, delay));
      }
    }
  }

  private async handleUpdate(update: any): Promise<void> {
    const type = update.type;
    const obj = update.object;

    if (type === 'message_new') {
      const msg = obj.message;
      if (!msg) return;
      const msgKey = `msg:${msg.peer_id}:${msg.conversation_message_id ?? msg.id}`;
      if (!this.markSeen(msgKey)) return;

      const user = await this.getUser(msg.from_id);

      const parsedMsg: VKMessage = {
        id: msg.id,
        peer_id: msg.peer_id,
        from_id: msg.from_id,
        date: msg.date,
        text: msg.text,
        out: 0,
        conversation_message_id: msg.conversation_message_id,
        attachments: msg.attachments?.map((a: any) => this.mapAttachment(a)),
        reply_message: msg.reply_message ? {
          id: msg.reply_message.id,
          from_id: msg.reply_message.from_id,
          text: msg.reply_message.text,
          attachments: msg.reply_message.attachments?.map((a: any) => this.mapAttachment(a)),
        } : undefined,
        fwd_messages: this.mapFwdMessages(msg.fwd_messages),
      };

      this.emit('message_new', { message: parsedMsg, user });
      return;
    }

    if (type === 'message_reply') {
      const replyKey = `reply:${obj.peer_id}:${obj.conversation_message_id ?? obj.id}`;
      if (!this.markSeen(replyKey)) return;

      const parsedMsg: VKMessage = {
        id: obj.id,
        peer_id: obj.peer_id,
        from_id: obj.from_id,
        date: obj.date,
        text: obj.text,
        out: 1,
        conversation_message_id: obj.conversation_message_id,
        attachments: obj.attachments?.map((a: any) => this.mapAttachment(a)),
        reply_message: obj.reply_message ? {
          id: obj.reply_message.id,
          from_id: obj.reply_message.from_id,
          text: obj.reply_message.text,
          attachments: obj.reply_message.attachments?.map((a: any) => this.mapAttachment(a)),
        } : undefined,
        fwd_messages: this.mapFwdMessages(obj.fwd_messages),
      };
      this.emit('message_reply', { message: parsedMsg });
      return;
    }

    if (type === 'message_read') {
      this.emit('message_read', {
        peer_id: obj.peer_id,
        message_id: obj.message_id || obj.conversation_message_id,
        out_read_id: obj.out_read_id || obj.message_id || obj.conversation_message_id,
      });
      return;
    }

    if (type === 'message_edit') {
      const msg = obj.message || obj;
      const editKey = `edit:${msg.peer_id || obj.peer_id}:${msg.conversation_message_id || obj.conversation_message_id || msg.id || obj.id}:${msg.date || obj.date}`;
      if (!this.markSeen(editKey)) return;

      const parsedMsg: VKMessage = {
        id: msg.id || obj.id,
        peer_id: msg.peer_id || obj.peer_id,
        from_id: msg.from_id || obj.from_id,
        date: msg.date || obj.date,
        text: msg.text || obj.text,
        out: (msg.out ?? obj.out) === 1 ? 1 : 0,
        conversation_message_id: msg.conversation_message_id || obj.conversation_message_id,
        attachments: (msg.attachments || obj.attachments)?.map((a: any) => this.mapAttachment(a)),
      };
      this.emit('message_edit', { message: parsedMsg });
      return;
    }

    if (type === 'message_reaction_event' || type === 'callback_message_reaction_event') {
      const reactedId = Number(obj.reacted_id ?? obj.user_id ?? obj.from_id ?? 0);
      this.emit('message_reaction', {
        reacted_id: reactedId,
        peer_id: obj.peer_id,
        cmid: obj.cmid,
        reaction_id: obj.reaction_id || 0,
      });
      return;
    }

    if (type === 'group_join') {
      const user = await this.getUser(obj.user_id);
      const activity: ActivityEvent = {
        id: `join-${obj.user_id}-${Date.now()}`,
        type: 'join',
        timestamp: Math.floor(Date.now() / 1000),
        userId: obj.user_id,
        userName: `${user.first_name} ${user.last_name}`.trim(),
        userPhoto: user.photo_100,
        details: obj.join_type === 'request' ? 'Подал заявку в сообщество' : 'Подписался на сообщество',
        raw: obj,
        read: false,
      };
      this.emit('activity', activity);
      return;
    }

    if (type === 'group_leave') {
      const user = await this.getUser(obj.user_id);
      const activity: ActivityEvent = {
        id: `leave-${obj.user_id}-${Date.now()}`,
        type: 'leave',
        timestamp: Math.floor(Date.now() / 1000),
        userId: obj.user_id,
        userName: `${user.first_name} ${user.last_name}`.trim(),
        userPhoto: user.photo_100,
        details: obj.self === 1 ? 'Отписался от сообщества' : 'Удален из сообщества',
        raw: obj,
        read: false,
      };
      this.emit('activity', activity);
      return;
    }

    if (type === 'like_add') {
      const likerId = obj.liker_id;
      const objectType = obj.object_type || '';
      const now = Date.now();
      const dedupKey = `${likerId}:${objectType}:${obj.object_id ?? ''}`;
      const lastLike = this.lastLikeTimestamps.get(dedupKey);

      // Дедупликация каскадных лайков VK в окне 8 секунд от одного пользователя
      if (lastLike && (now - lastLike) < 8000) {
        console.log(`[VkService] Агрегирован каскадный лайк ${dedupKey}`);
        return;
      }
      this.lastLikeTimestamps.set(dedupKey, now);
      if (this.lastLikeTimestamps.size > 500) {
        for (const [k, t] of this.lastLikeTimestamps) {
          if (now - t > 60000) this.lastLikeTimestamps.delete(k);
        }
      }

      const user = await this.getUser(likerId);
      let detailsText = 'Оценил публикацию';
      if (objectType === 'post' || objectType === 'photo') {
        detailsText = 'Оценил запись/публикацию';
      } else {
        detailsText = `Поставил лайк на ${this.formatObjectType(objectType)}`;
      }

      const activity: ActivityEvent = {
        id: `like-${likerId}-${now}`,
        type: 'like',
        timestamp: Math.floor(now / 1000),
        userId: likerId,
        userName: `${user.first_name} ${user.last_name}`.trim(),
        userPhoto: user.photo_100,
        details: detailsText,
        raw: obj,
        read: false,
      };
      this.emit('activity', activity);
      return;
    }

    if (type === 'wall_repost') {
      const user = await this.getUser(obj.from_id);
      const activity: ActivityEvent = {
        id: `repost-${obj.from_id}-${Date.now()}`,
        type: 'repost',
        timestamp: Math.floor(Date.now() / 1000),
        userId: obj.from_id,
        userName: `${user.first_name} ${user.last_name}`.trim(),
        userPhoto: user.photo_100,
        details: 'Поделился записью сообщества',
        raw: obj,
        read: false,
      };
      this.emit('activity', activity);
      return;
    }

    if (type === 'wall_reply_new') {
      const user = await this.getUser(obj.from_id);
      const commentText = obj.text || (obj.attachments?.length ? '[Вложение]' : '');
      const preview = commentText.length > 50 ? commentText.slice(0, 50) + '...' : commentText;
      const activity: ActivityEvent = {
        id: `comment-${obj.id}-${Date.now()}`,
        type: 'comment',
        timestamp: obj.date || Math.floor(Date.now() / 1000),
        userId: obj.from_id,
        userName: `${user.first_name} ${user.last_name}`.trim(),
        userPhoto: user.photo_100,
        details: `Комментарий: «${preview}»`,
        raw: obj,
        read: false,
      };
      this.emit('activity', activity);
      return;
    }
  }

  private formatObjectType(type: string): string {
    switch (type) {
      case 'post': return 'запись на стене';
      case 'comment': return 'комментарий';
      case 'photo': return 'фотографию';
      case 'video': return 'видеозапись';
      case 'market': return 'услугу/товар';
      default: return 'публикацию';
    }
  }
}
