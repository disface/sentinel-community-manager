const { contextBridge } = require('electron');

const mode = process.env.SCM_SCREEN_MODE || 'main';

const mockTemplates = [
  { id: '1', title: 'Приветствие', category: 'welcome', text: 'Привет, {name}! Рады видеть вас. Чем можем помочь?' },
  { id: '2', title: 'Прайс-лист', category: 'order', text: 'Здравствуйте, {name}! Актуальный прайс и описание услуг можно посмотреть в меню группы.' },
  { id: '3', title: 'График работы', category: 'hours', text: 'Мы на связи ежедневно с 10:00 до 21:00!' },
  { id: '4', title: 'Реквизиты', category: 'faq', text: 'Оплата производится официально через СБП по реквизитам.' },
];

const mockConversations = [
  {
    peerId: 101,
    user: {
      id: 101,
      first_name: 'Алексей',
      last_name: 'Морозов',
      photo_100: 'https://images.unsplash.com/photo-1534528741775-53994a69daeb?w=150&auto=format&fit=crop&q=80',
      online: 1,
    },
    unreadCount: 2,
    lastMessage: {
      id: 4,
      date: Math.floor(Date.now() / 1000) - 720,
      text: 'Супер, трек звучит пушечно! Когда сможем забрать мастер-копию?',
      out: false,
    },
  },
  {
    peerId: 102,
    user: {
      id: 102,
      first_name: 'Екатерина',
      last_name: 'Смирнова',
      photo_100: 'https://images.unsplash.com/photo-1494790108377-be9c29b29330?w=150&auto=format&fit=crop&q=80',
      online: 0,
    },
    unreadCount: 0,
    lastMessage: {
      id: 10,
      date: Math.floor(Date.now() / 1000) - 2700,
      text: 'Договорились, буду в четверг к 16:00 на запись вокала.',
      out: true,
    },
  },
  {
    peerId: 103,
    user: {
      id: 103,
      first_name: 'Михаил',
      last_name: 'Ковалёв',
      photo_100: 'https://images.unsplash.com/photo-1507003211169-0a1dd7228f2d?w=150&auto=format&fit=crop&q=80',
      online: 1,
    },
    unreadCount: 0,
    lastMessage: {
      id: 11,
      date: Math.floor(Date.now() / 1000) - 7200,
      text: 'Подскажите, сколько стоит сведение мультитрека на 24 дорожки?',
      out: false,
    },
  },
  {
    peerId: 104,
    user: {
      id: 104,
      first_name: 'Анна',
      last_name: 'Соколова',
      photo_100: 'https://images.unsplash.com/photo-1438761681033-6461ffad8d80?w=150&auto=format&fit=crop&q=80',
      online: 0,
    },
    unreadCount: 0,
    lastMessage: {
      id: 12,
      date: Math.floor(Date.now() / 1000) - 21600,
      text: 'Спасибо огромное за оперативность! 🔥',
      out: false,
    },
  },
  {
    peerId: 105,
    user: {
      id: 105,
      first_name: 'Дмитрий',
      last_name: 'Волков',
      photo_100: 'https://images.unsplash.com/photo-1500648767791-00dcc994a43e?w=150&auto=format&fit=crop&q=80',
      online: 0,
    },
    unreadCount: 0,
    lastMessage: {
      id: 13,
      date: Math.floor(Date.now() / 1000) - 86400,
      text: 'Отправил референсы на почту.',
      out: true,
    },
  }
];

const mockMessages = [
  {
    id: 1,
    peer_id: 101,
    from_id: 101,
    date: Math.floor(Date.now() / 1000) - 3600,
    text: 'Приветствую! Мы закончили запись трека в нашем проекте, хотели бы отдать вам на финальный мастеринг. Сколько по времени займёт?',
    out: 0,
    reactions: [{ reaction_id: 1, count: 1 }],
  },
  {
    id: 2,
    peer_id: 101,
    from_id: -200100,
    date: Math.floor(Date.now() / 1000) - 2400,
    text: 'Привет, Алексей! Стандартный срок мастеринга трека — 2 рабочих дня. Присылайте несжатый WAV 24/44.1 с запасом по хедруму -6 dB. Подготовим стриминг-версию под -14 LUFS и клубный мастер!',
    out: 1,
    reactions: [{ reaction_id: 4, count: 2 }],
  },
  {
    id: 3,
    peer_id: 101,
    from_id: 101,
    date: Math.floor(Date.now() / 1000) - 1800,
    text: 'Отлично! Вот черновой микс послушать:',
    attachments: [
      {
        type: 'audio',
        audio: {
          id: 555,
          owner_id: 101,
          artist: 'Neon Horizon',
          title: 'Nightfall Drive (Pre-Master Demo)',
          duration: 214,
          url: '',
        }
      }
    ],
    out: 0,
  },
  {
    id: 4,
    peer_id: 101,
    from_id: 101,
    date: Math.floor(Date.now() / 1000) - 720,
    text: 'Супер, трек звучит пушечно! Когда сможем забрать мастер-копию?',
    out: 0,
    reactions: [{ reaction_id: 2, count: 1 }, { reaction_id: 7, count: 1 }],
  }
];

const mockActivity = [
  {
    id: 'act-1',
    type: 'group_join',
    userId: 101,
    userName: 'Алексей Морозов',
    userPhoto: 'https://images.unsplash.com/photo-1534528741775-53994a69daeb?w=150&auto=format&fit=crop&q=80',
    title: 'Подписался на сообщество',
    date: Date.now() - 1000 * 60 * 15,
    read: false,
  },
  {
    id: 'act-2',
    type: 'wall_reply_new',
    userId: 102,
    userName: 'Екатерина Смирнова',
    userPhoto: 'https://images.unsplash.com/photo-1494790108377-be9c29b29330?w=150&auto=format&fit=crop&q=80',
    title: 'Оставила комментарий к записи',
    text: 'Очень ждём новый релиз, звук просто космический!',
    date: Date.now() - 1000 * 60 * 40,
    read: false,
  },
  {
    id: 'act-3',
    type: 'like_add',
    userId: 103,
    userName: 'Михаил Ковалёв',
    userPhoto: 'https://images.unsplash.com/photo-1507003211169-0a1dd7228f2d?w=150&auto=format&fit=crop&q=80',
    title: 'Оценил публикацию',
    date: Date.now() - 1000 * 60 * 95,
    read: true,
  }
];

contextBridge.exposeInMainWorld('scmAPI', {
  getConfig: async () => {
    if (mode === 'onboarding') {
      return {
        groupId: 0,
        groupName: '',
        token: '',
        themeAccent: 'vk-blue',
        downloadDir: 'C:\\Downloads',
        uiScale: 1.0,
      };
    }
    return {
      groupId: 200100,
      groupName: 'Cyber Sound Studio & Records',
      groupScreenName: 'cybersound_rec',
      groupPhoto: 'https://images.unsplash.com/photo-1598488035139-bdbb2231ce04?w=150&auto=format&fit=crop&q=80',
      token: 'vk1.a.mock_secure_token_sample',
      themeAccent: 'vk-blue',
      downloadDir: 'C:\\Music\\Downloads',
      uiScale: 1.0,
      soundEnabled: true,
      volume: 80,
    };
  },
  saveConfig: async (cfg) => cfg,
  getGroupInfo: async () => ({
    name: 'Cyber Sound Studio & Records',
    screen_name: 'cybersound_rec',
    photo_100: 'https://images.unsplash.com/photo-1598488035139-bdbb2231ce04?w=150&auto=format&fit=crop&q=80',
  }),
  validateCommunity: async () => ({ success: true }),
  getTemplates: async () => mockTemplates,
  saveTemplates: async (t) => t,
  getActivityEvents: async () => mockActivity,
  markActivityRead: async () => {},
  clearActivityEvents: async () => {},
  getConversations: async () => ({ count: 5, items: mockConversations }),
  getHistory: async () => ({ totalCount: mockMessages.length, items: mockMessages }),
  sendMessage: async () => 999,
  sendSticker: async () => 999,
  editMessage: async () => true,
  deleteMessage: async () => true,
  markAsRead: async () => {},
  banUser: async () => true,
  deleteConversation: async () => true,
  sendReaction: async () => true,
  deleteReaction: async () => true,
  uploadAttachment: async () => '',
  sendVoiceMessage: async () => 1,
  selectFile: async () => null,
  selectFolder: async () => null,
  getFilePath: () => '',
  getDataUrl: async () => null,
  downloadTrack: async () => null,
  getUserDetails: async (id) => ({
    id,
    first_name: 'Алексей',
    last_name: 'Морозов',
    photo_100: 'https://images.unsplash.com/photo-1534528741775-53994a69daeb?w=150&auto=format&fit=crop&q=80',
    online: 1,
  }),
  getPeerStatus: async () => ({
    out_read: 4,
    in_read: 4,
    online: 1,
    user: {
      id: 101,
      first_name: 'Алексей',
      last_name: 'Морозов',
      photo_100: 'https://images.unsplash.com/photo-1534528741775-53994a69daeb?w=150&auto=format&fit=crop&q=80',
      online: 1,
    }
  }),
  setTrayBadge: () => {},
  setZoomFactor: () => {},
  getZoomFactor: () => 1.0,
  openExternal: async () => {},
  minimizeWindow: () => {},
  maximizeWindow: () => {},
  closeWindow: () => {},
  onMessageNew: () => () => {},
  onMessageReply: () => () => {},
  onMessageEdit: () => () => {},
  onMessageDelete: () => () => {},
  onMessageReaction: () => () => {},
  onActivityEvent: () => () => {},
  onReactionUpdate: () => () => {},
  onActivity: () => () => {},
  onNetworkStatus: () => () => {},
  onOpenChat: () => () => {},
});
