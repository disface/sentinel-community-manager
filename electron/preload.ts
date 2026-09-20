import { contextBridge, ipcRenderer, webUtils, webFrame } from 'electron';
import { AppConfig, ConversationItem, QuickTemplate, VKMessage, ActivityEvent, UserProfile } from './types';

contextBridge.exposeInMainWorld('scmAPI', {
  // Config & Community
  getConfig: (): Promise<AppConfig> => ipcRenderer.invoke('config:get'),
  saveConfig: (cfg: Partial<AppConfig>): Promise<AppConfig> => ipcRenderer.invoke('config:save', cfg),
  getGroupInfo: (): Promise<any> => ipcRenderer.invoke('group:get-info'),
  validateCommunity: (groupIdOrScreenName: string, token: string): Promise<{ success: boolean; group?: any; error?: string }> =>
    ipcRenderer.invoke('community:validate', groupIdOrScreenName, token),

  // Templates
  getTemplates: (): Promise<QuickTemplate[]> => ipcRenderer.invoke('templates:get'),
  saveTemplates: (templates: QuickTemplate[]): Promise<QuickTemplate[]> => ipcRenderer.invoke('templates:save', templates),

  // Activity Feed Persistence
  getActivityEvents: (): Promise<ActivityEvent[]> => ipcRenderer.invoke('activity:get'),
  markActivityRead: (timestamp?: number): Promise<void> => ipcRenderer.invoke('activity:mark-read', timestamp),
  clearActivityEvents: (): Promise<void> => ipcRenderer.invoke('activity:clear'),

  // Messaging & Moderation
  getConversations: (offset?: number, count?: number): Promise<{ count: number; items: ConversationItem[] }> =>
    ipcRenderer.invoke('messages:get-conversations', offset, count),
  getHistory: (peerId: number, count?: number, offset?: number): Promise<{ items: VKMessage[]; totalCount: number }> =>
    ipcRenderer.invoke('messages:get-history', peerId, count, offset),
  sendMessage: (peerId: number, text: string, attachment?: string, replyTo?: number): Promise<number> =>
    ipcRenderer.invoke('messages:send', peerId, text, attachment, replyTo),
  sendSticker: (peerId: number, stickerId: number): Promise<number> =>
    ipcRenderer.invoke('messages:send-sticker', peerId, stickerId),
  editMessage: (peerId: number, cmid: number, text: string, messageId?: number): Promise<boolean> =>
    ipcRenderer.invoke('messages:edit', peerId, cmid, text, messageId),
  deleteMessage: (peerId: number, cmid: number, messageId?: number): Promise<boolean> =>
    ipcRenderer.invoke('messages:delete', peerId, cmid, messageId),
  markAsRead: (peerId: number): Promise<void> =>
    ipcRenderer.invoke('messages:mark-as-read', peerId),
  banUser: (userId: number, comment?: string): Promise<boolean> =>
    ipcRenderer.invoke('user:ban', userId, comment),
  deleteConversation: (peerId: number): Promise<boolean> =>
    ipcRenderer.invoke('messages:delete-conversation', peerId),

  // Reactions
  sendReaction: (peerId: number, cmid: number, reactionId: number): Promise<boolean> =>
    ipcRenderer.invoke('messages:send-reaction', peerId, cmid, reactionId),
  deleteReaction: (peerId: number, cmid: number): Promise<boolean> =>
    ipcRenderer.invoke('messages:delete-reaction', peerId, cmid),

  // Attachments & Media
  uploadAttachment: (peerId: number, filePath: string): Promise<string> =>
    ipcRenderer.invoke('media:upload', peerId, filePath),
  sendVoiceMessage: (peerId: number, audioBuffer: ArrayBuffer): Promise<number> =>
    ipcRenderer.invoke('media:send-voice', peerId, audioBuffer),
  selectFile: (): Promise<string | null> =>
    ipcRenderer.invoke('dialog:select-file'),
  selectFolder: (): Promise<string | null> =>
    ipcRenderer.invoke('dialog:select-folder'),
  getFilePath: (file: File): string => {
    try {
      return webUtils.getPathForFile(file);
    } catch {
      return '';
    }
  },
  getDataUrl: (filePath: string): Promise<string | null> =>
    ipcRenderer.invoke('file:get-data-url', filePath),
  downloadTrack: (url: string, defaultFileName: string): Promise<string | null> =>
    ipcRenderer.invoke('media:download-track', url, defaultFileName),

  // User Profile & Status
  getUserDetails: (userId: number): Promise<UserProfile> =>
    ipcRenderer.invoke('user:get-details', userId),
  getPeerStatus: (peerId: number): Promise<{ out_read: number; in_read: number; online: number; last_seen?: any; user?: UserProfile }> =>
    ipcRenderer.invoke('peer:get-status', peerId),

  // UI & System
  setTrayBadge: (count: number): void => {
    ipcRenderer.send('tray:set-badge', count);
  },
  setZoomFactor: (factor: number): void => {
    webFrame.setZoomFactor(factor);
  },
  getZoomFactor: (): number => {
    return webFrame.getZoomFactor();
  },
  openExternal: (url: string): Promise<void> => ipcRenderer.invoke('shell:open-external', url),
  minimizeWindow: (): void => ipcRenderer.send('window:minimize'),
  maximizeWindow: (): void => ipcRenderer.send('window:maximize'),
  closeWindow: (): void => ipcRenderer.send('window:close'),

  // Events from Main process
  onMessageNew: (callback: (data: { message: VKMessage; user: any }) => void) => {
    const sub = (_: any, data: any) => callback(data);
    ipcRenderer.on('vk:message_new', sub);
    return () => ipcRenderer.removeListener('vk:message_new', sub);
  },
  onMessageReply: (callback: (data: { message: VKMessage }) => void) => {
    const sub = (_: any, data: any) => callback(data);
    ipcRenderer.on('vk:message_reply', sub);
    return () => ipcRenderer.removeListener('vk:message_reply', sub);
  },
  onMessageEdit: (callback: (data: { message: VKMessage }) => void) => {
    const sub = (_: any, data: any) => callback(data);
    ipcRenderer.on('vk:message_edit', sub);
    return () => ipcRenderer.removeListener('vk:message_edit', sub);
  },
  onMessageRead: (callback: (data: { peer_id: number; message_id?: number; out_read_id?: number }) => void) => {
    const sub = (_: any, data: any) => callback(data);
    ipcRenderer.on('vk:message_read', sub);
    return () => ipcRenderer.removeListener('vk:message_read', sub);
  },
  onReactionUpdate: (callback: (data: any) => void) => {
    const sub = (_: any, data: any) => callback(data);
    ipcRenderer.on('vk:reaction-event', sub);
    return () => ipcRenderer.removeListener('vk:reaction-event', sub);
  },
  onActivity: (callback: (event: ActivityEvent) => void) => {
    const sub = (_: any, event: any) => callback(event);
    ipcRenderer.on('vk:activity', sub);
    return () => ipcRenderer.removeListener('vk:activity', sub);
  },
  onNetworkStatus: (callback: (status: { connected: boolean; error?: string }) => void) => {
    const sub = (_: any, status: any) => callback(status);
    ipcRenderer.on('vk:network-status', sub);
    return () => ipcRenderer.removeListener('vk:network-status', sub);
  },
  onOpenChat: (callback: (peerId: number) => void) => {
    const sub = (_: any, peerId: number) => callback(peerId);
    ipcRenderer.on('vk:open-chat', sub);
    return () => ipcRenderer.removeListener('vk:open-chat', sub);
  },
});
