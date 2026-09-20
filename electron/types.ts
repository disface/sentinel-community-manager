export interface AppConfig {
  groupId: number;
  groupName?: string;
  groupScreenName?: string;
  groupPhoto?: string;
  token: string;
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
