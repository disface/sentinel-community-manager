export interface AppConfig {
  groupId: number;
  groupName?: string;
  groupScreenName?: string;
  groupPhoto?: string;
  token?: string;
  hasToken?: boolean;
  themeAccent: string;
  autoLaunch: boolean;
  dndMode: boolean;
  soundEnabled: boolean;
  volume: number; // 0..100
  downloadDir?: string;
  uiScale?: number;
}

export interface QuickTemplate {
  id: string;
  title: string;
  category: 'welcome' | 'hours' | 'order' | 'faq' | 'custom';
  text: string;
}

export interface UserProfile {
  id: number;
  first_name: string;
  last_name: string;
  photo_100: string;
  photo_200?: string;
  photo_max?: string;
  status?: string;
  about?: string;
  city?: string;
  country?: string;
  bdate?: string;
  last_seen?: { time: number; platform: number };
  online?: number | boolean;
  online_mobile?: number | boolean;
  screen_name?: string;
  can_write?: boolean;
}

export interface VKAttachment {
  type: 'photo' | 'doc' | 'audio_message' | 'audio' | 'link' | 'video' | 'wall' | 'story' | 'sticker' | 'unsupported';
  photo?: {
    sizes: { url: string; width: number; height: number; type: string }[];
    text?: string;
  };
  doc?: {
    title: string;
    size: number;
    ext: string;
    url: string;
    date: number;
  };
  audio_message?: {
    duration: number;
    link_ogg: string;
    link_mp3: string;
    waveform: number[];
  };
  audio?: {
    id: number;
    owner_id: number;
    artist: string;
    title: string;
    duration: number;
    url?: string;
  };
  video?: {
    id: number;
    owner_id: number;
    title: string;
    description?: string;
    duration: number;
    views?: number;
    preview_url?: string;
    player?: string;
    access_key?: string;
    url: string;
  };
  link?: {
    url: string;
    title: string;
    description?: string;
  };
  wall?: {
    id: number;
    to_id: number;
    text: string;
    url: string;
  };
  story?: {
    id: number;
    owner_id: number;
    date: number;
    preview_url?: string;
    photo_url?: string;
    video_url?: string;
    player_url?: string;
    url: string;
    is_expired?: boolean;
    is_deleted?: boolean;
  };
  sticker?: {
    sticker_id: number;
    product_id?: number;
    image_url: string;
    animation_url?: string;
  };
}

export interface ForwardedMessage {
  from_id: number;
  author_name?: string;
  author_photo?: string;
  date: number;
  text: string;
  attachments?: VKAttachment[];
  fwd_messages?: ForwardedMessage[];
}

export interface MessageReaction {
  reaction_id: number; // 1=❤️, 2=👍, 3=👎, 4=🔥, 5=👏, 6=😂, 7=💯, 8=🥳
  count: number;
}

export interface VKMessage {
  id: number;
  peer_id: number;
  from_id: number;
  date: number;
  text: string;
  out: number; // 0 - in, 1 - out
  attachments?: VKAttachment[];
  conversation_message_id?: number;
  reply_message?: {
    id?: number;
    from_id: number;
    text: string;
    attachments?: VKAttachment[];
  };
  fwd_messages?: ForwardedMessage[];
  reactions?: MessageReaction[];
  user_reaction?: number;
}

export interface ConversationItem {
  peerId: number;
  user: UserProfile;
  lastMessage: {
    id: number;
    date: number;
    text: string;
    out: boolean;
  };
  unreadCount: number;
  in_read?: number;
  out_read?: number;
  in_read_cmid?: number;
  out_read_cmid?: number;
}

export interface ActivityEvent {
  id: string;
  type: 'join' | 'leave' | 'like' | 'repost' | 'comment' | 'message';
  timestamp: number;
  userId: number;
  userName: string;
  userPhoto: string;
  details: string;
  raw?: any;
  read?: boolean;
}

// Window API Declaration
export interface ScmAPI {
  // Config & Community
  getConfig: () => Promise<AppConfig>;
  saveConfig: (config: Partial<AppConfig>) => Promise<AppConfig>;
  getGroupInfo: () => Promise<any>;
  validateCommunity: (groupIdOrScreenName: string, token: string) => Promise<{ success: boolean; group?: any; error?: string }>;

  // Templates
  getTemplates: () => Promise<QuickTemplate[]>;
  saveTemplates: (templates: QuickTemplate[]) => Promise<QuickTemplate[]>;

  // Activity Feed
  getActivityEvents: () => Promise<ActivityEvent[]>;
  markActivityRead: (timestamp?: number) => Promise<void>;
  clearActivityEvents: () => Promise<void>;

  // Messaging & Moderation
  getConversations: (offset?: number, count?: number) => Promise<{ count: number; items: ConversationItem[] }>;
  getHistory: (peerId: number, count?: number, offset?: number) => Promise<{ items: VKMessage[]; totalCount: number }>;
  sendMessage: (peerId: number, text: string, attachment?: string, replyTo?: number) => Promise<number>;
  sendSticker: (peerId: number, stickerId: number) => Promise<number>;
  editMessage: (peerId: number, cmid: number, text: string, messageId?: number) => Promise<boolean>;
  deleteMessage: (peerId: number, cmid: number, messageId?: number) => Promise<boolean>;
  markAsRead: (peerId: number) => Promise<void>;
  banUser: (userId: number, comment?: string) => Promise<boolean>;
  deleteConversation: (peerId: number) => Promise<boolean>;

  // Reactions
  sendReaction: (peerId: number, cmid: number, reactionId: number) => Promise<boolean>;
  deleteReaction: (peerId: number, cmid: number) => Promise<boolean>;

  // Attachments & Media
  uploadAttachment: (peerId: number, filePath: string) => Promise<string>;
  sendVoiceMessage: (peerId: number, audioBuffer: ArrayBuffer) => Promise<number>;
  selectFile: () => Promise<string | null>;
  selectFolder: () => Promise<string | null>;
  getFilePath: (file: File) => string;
  getDataUrl: (filePath: string) => Promise<string | null>;
  downloadTrack: (url: string, defaultFileName: string) => Promise<string | null>;

  // Profile & Status
  getUserDetails: (userId: number) => Promise<UserProfile>;
  getPeerStatus: (peerId: number) => Promise<{ out_read: number; in_read: number; online: number; last_seen?: any; user?: UserProfile }>;

  // UI & System
  setTrayBadge: (count: number) => void;
  setZoomFactor: (factor: number) => void;
  getZoomFactor: () => number;
  openExternal: (url: string) => Promise<void>;
  minimizeWindow: () => void;
  maximizeWindow: () => void;
  closeWindow: () => void;

  // Real-time Event Listeners
  onMessageNew: (callback: (data: { message: VKMessage; user: any }) => void) => () => void;
  onMessageReply: (callback: (data: { message: VKMessage }) => void) => () => void;
  onMessageEdit: (callback: (data: { message: VKMessage }) => void) => () => void;
  onMessageRead: (callback: (data: { peer_id: number; message_id?: number; out_read_id?: number }) => void) => () => void;
  onReactionUpdate: (callback: (data: any) => void) => () => void;
  onActivity: (callback: (event: ActivityEvent) => void) => () => void;
  onNetworkStatus: (callback: (status: { connected: boolean; error?: string }) => void) => () => void;
  onOpenChat: (callback: (peerId: number) => void) => () => void;
}

declare global {
  interface Window {
    scmAPI: ScmAPI;
  }
}
