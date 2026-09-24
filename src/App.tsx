import React, { useState, useEffect, useRef } from 'react';
import { AppConfig, ConversationItem, QuickTemplate, VKMessage, ActivityEvent, VK_REACTION_MAP } from './types/scm';
import { Header } from './components/Header';
import { ConversationsList } from './components/ConversationsList';
import { ChatView } from './components/ChatView';
import { ActivityFeed } from './components/ActivityFeed';
import { SupportModal } from './components/SupportModal';
import { SettingsModal } from './components/SettingsModal';
import { OnboardingModal } from './components/OnboardingModal';
import { TemplateEditorModal } from './components/TemplateEditorModal';

export const App: React.FC = () => {
  const [config, setConfig] = useState<AppConfig | null>(null);
  const [conversations, setConversations] = useState<ConversationItem[]>([]);
  const [selectedPeerId, setSelectedPeerId] = useState<number | null>(null);
  const [messages, setMessages] = useState<VKMessage[]>([]);
  const [activityEvents, setActivityEvents] = useState<ActivityEvent[]>([]);
  const [templates, setTemplates] = useState<QuickTemplate[]>([]);

  const conversationsRef = useRef(conversations);
  conversationsRef.current = conversations;
  const configRef = useRef(config);
  configRef.current = config;

  const [activeTab, setActiveTab] = useState<'chats' | 'activity'>('chats');
  const [isConnected, setIsConnected] = useState(true);
  const [isLoadingConversations, setIsLoadingConversations] = useState(false);
  const [isLoadingMessages, setIsLoadingMessages] = useState(false);
  const [totalConversationsCount, setTotalConversationsCount] = useState(0);

  // Модальные окна
  const [isOnboardingOpen, setIsOnboardingOpen] = useState(false);
  const [isSupportOpen, setIsSupportOpen] = useState(false);
  const [isSettingsOpen, setIsSettingsOpen] = useState(false);
  const [isTemplatesOpen, setIsTemplatesOpen] = useState(false);

  // Загрузка начальных данных
  useEffect(() => {
    const initApp = async () => {
      if (!window.scmAPI) return;

      try {
        const cfg = await window.scmAPI.getConfig();
        setConfig(cfg);

        // Если токен или ID группы не настроены - открываем онбординг
        const hasValidAuth = Boolean((cfg.hasToken || cfg.token) && cfg.groupId);
        if (!hasValidAuth) {
          setIsOnboardingOpen(true);
        } else {
          loadConversations();
        }

        const tpls = await window.scmAPI.getTemplates();
        setTemplates(tpls);

        const acts = await window.scmAPI.getActivityEvents();
        setActivityEvents(acts);

        if (cfg.uiScale && window.scmAPI.setZoomFactor) {
          window.scmAPI.setZoomFactor(cfg.uiScale);
        }
      } catch (err) {
        console.error('App init error:', err);
      }
    };

    initApp();
  }, []);

  const loadConversations = async (offset = 0) => {
    if (!window.scmAPI) return;
    setIsLoadingConversations(true);
    try {
      const res = await window.scmAPI.getConversations(offset, 40);
      setConversations(res.items);
      setTotalConversationsCount(res.count);
    } catch (err) {
      console.error('Failed to load conversations:', err);
    } finally {
      setIsLoadingConversations(false);
    }
  };

  const loadHistory = async (peerId: number) => {
    if (!window.scmAPI) return;
    setIsLoadingMessages(true);
    try {
      const res = await window.scmAPI.getHistory(peerId, 50);
      setMessages(res.items);
      await window.scmAPI.markAsRead(peerId);

      // Обновляем статус непрочитанных в локальном списке
      setConversations((prev) =>
        prev.map((c) => (c.peerId === peerId ? { ...c, unreadCount: 0 } : c))
      );
    } catch (err) {
      console.error('Failed to load history:', err);
    } finally {
      setIsLoadingMessages(false);
    }
  };

  const handleSelectConversation = (peerId: number) => {
    setSelectedPeerId(peerId);
    setActiveTab('chats');
    loadHistory(peerId);
  };

  // Регистрация подписок на события Long Poll
  useEffect(() => {
    if (!window.scmAPI) return;

    const unregMsgNew = window.scmAPI.onMessageNew(({ message, user }) => {
      // Обновляем беседы
      setConversations((prev) => {
        const existing = prev.find((c) => c.peerId === message.peer_id);
        if (existing) {
          return prev.map((c) =>
            c.peerId === message.peer_id
              ? {
                  ...c,
                  lastMessage: {
                    id: message.id,
                    date: message.date,
                    text: message.text || '[Вложение]',
                    out: false,
                  },
                  unreadCount: selectedPeerId === message.peer_id ? 0 : c.unreadCount + 1,
                }
              : c
          );
        } else {
          const newItem: ConversationItem = {
            peerId: message.peer_id,
            user: user || { id: message.from_id, first_name: 'Пользователь', last_name: '', photo_100: '' },
            lastMessage: {
              id: message.id,
              date: message.date,
              text: message.text || '[Вложение]',
              out: false,
            },
            unreadCount: 1,
          };
          return [newItem, ...prev];
        }
      });

      // Если открыт именно этот чат - добавляем сообщение
      if (selectedPeerId === message.peer_id) {
        setMessages((prev) => [...prev, message]);
        window.scmAPI.markAsRead(message.peer_id);
      }
    });

    const unregMsgReply = window.scmAPI.onMessageReply(({ message }) => {
      setConversations((prev) =>
        prev.map((c) =>
          c.peerId === message.peer_id
            ? {
                ...c,
                lastMessage: {
                  id: message.id,
                  date: message.date,
                  text: message.text || '[Вложение]',
                  out: true,
                },
              }
            : c
        )
      );

      if (selectedPeerId === message.peer_id) {
        setMessages((prev) => [...prev, message]);
      }
    });

    const unregReaction = window.scmAPI.onReactionUpdate((data) => {
      if (selectedPeerId === data.peer_id) {
        setMessages((prev) =>
          prev.map((m) => {
            const cmid = m.conversation_message_id || m.id;
            if (cmid !== data.cmid) return m;

            let existingReactions = m.reactions ? [...m.reactions] : [];

            // 1. Удаляем пользователя из предыдущей реакции (если он уже реагировал)
            existingReactions = existingReactions
              .map((r) => {
                if (r.user_ids?.includes(data.reacted_id)) {
                  const newUserIds = r.user_ids.filter((id) => id !== data.reacted_id);
                  return { ...r, count: newUserIds.length, user_ids: newUserIds };
                }
                return r;
              })
              .filter((r) => r.count > 0);

            // 2. Если реакция добавляется/обновляется (reaction_id > 0)
            if (data.reaction_id > 0) {
              const targetIdx = existingReactions.findIndex((r) => r.reaction_id === data.reaction_id);
              if (targetIdx >= 0) {
                const target = existingReactions[targetIdx];
                const userIds = target.user_ids ? [...target.user_ids] : [];
                if (!userIds.includes(data.reacted_id)) {
                  userIds.push(data.reacted_id);
                }
                existingReactions[targetIdx] = {
                  ...target,
                  count: userIds.length,
                  user_ids: userIds,
                };
              } else {
                existingReactions.push({
                  reaction_id: data.reaction_id,
                  count: 1,
                  user_ids: [data.reacted_id],
                });
              }
            }

            return { ...m, reactions: existingReactions };
          })
        );
      } else if (configRef.current && data.reaction_id > 0 && data.reacted_id !== -configRef.current.groupId) {
        // Реакция пришла в фоновый диалог от пользователя
        const conv = conversationsRef.current.find((c) => c.peerId === data.peer_id);
        const userName = conv?.user ? `${conv.user.first_name} ${conv.user.last_name}`.trim() : `ID ${data.reacted_id}`;
        const userPhoto = conv?.user?.photo_100 || '';
        const emoji = VK_REACTION_MAP[data.reaction_id] || '🔥';

        const newActivity: ActivityEvent = {
          id: `reaction_${data.peer_id}_${data.cmid}_${data.reacted_id}_${Date.now()}`,
          type: 'reaction',
          timestamp: Math.floor(Date.now() / 1000),
          userId: data.peer_id,
          userName: userName,
          userPhoto: userPhoto,
          details: `Поставил реакцию ${emoji} на сообщение в диалоге`,
          read: false,
          raw: data,
        };
        setActivityEvents((prev) => [newActivity, ...prev]);
      }

      // Обновление индикации последней реакции в списке диалогов и перемещение наверх
      setConversations((prev) => {
        const idx = prev.findIndex((c) => c.peerId === data.peer_id);
        if (idx === -1) return prev;
        const target = prev[idx];
        let authorName: string | undefined;
        if (configRef.current && data.reacted_id === -configRef.current.groupId) {
          authorName = 'Вы';
        } else if (target.user) {
          authorName = target.user.first_name || 'Клиент';
        }

        const updated: ConversationItem = {
          ...target,
          lastReaction: data.reaction_id > 0 ? {
            emoji: VK_REACTION_MAP[data.reaction_id] || '🔥',
            date: Math.floor(Date.now() / 1000),
            authorName,
          } : undefined,
        };

        const rest = prev.filter((_, i) => i !== idx);
        return [updated, ...rest];
      });
    });

    const unregActivity = window.scmAPI.onActivity((ev) => {
      setActivityEvents((prev) => [ev, ...prev]);
    });

    const unregNet = window.scmAPI.onNetworkStatus((status) => {
      setIsConnected(status.connected);
    });

    const unregOpenChat = window.scmAPI.onOpenChat((peerId) => {
      handleSelectConversation(peerId);
    });

    return () => {
      unregMsgNew();
      unregMsgReply();
      unregReaction();
      unregActivity();
      unregNet();
      unregOpenChat();
    };
  }, [selectedPeerId]);

  // Подсчет непрочитанных и обновление бейджа в трее
  const unreadMessagesCount = conversations.reduce((acc, c) => acc + (c.unreadCount || 0), 0);
  const unreadActivityCount = activityEvents.filter((e) => !e.read).length;
  const totalUnread = unreadMessagesCount + unreadActivityCount;

  useEffect(() => {
    window.scmAPI?.setTrayBadge?.(totalUnread);
  }, [totalUnread]);

  const handleSendMessage = async (text: string, replyTo?: number) => {
    if (!selectedPeerId || !window.scmAPI) return;
    try {
      await window.scmAPI.sendMessage(selectedPeerId, text, undefined, replyTo);
    } catch (err) {
      console.error('Failed to send message:', err);
    }
  };

  const handleSendSticker = async (stickerId: number) => {
    if (!selectedPeerId || !window.scmAPI) return;
    try {
      await window.scmAPI.sendSticker(selectedPeerId, stickerId);
    } catch (err) {
      console.error('Failed to send sticker:', err);
    }
  };

  const handleUploadImage = async (file: File) => {
    if (!selectedPeerId || !window.scmAPI) return;
    try {
      const filePath = window.scmAPI.getFilePath(file);
      if (!filePath) {
        alert('Не удалось получить путь к файлу.');
        return;
      }
      const attachId = await window.scmAPI.uploadAttachment(selectedPeerId, filePath);
      await window.scmAPI.sendMessage(selectedPeerId, '', attachId);
    } catch (err: any) {
      alert(err.message || 'Ошибка загрузки изображения');
    }
  };

  const handleSendReaction = async (cmid: number, reactionId: number) => {
    if (!selectedPeerId || !window.scmAPI || !config?.groupId) return;

    const ourGroupId = -config.groupId;
    const prevMessages = messages;

    // Мгновенное оптимистичное обновление UI
    setMessages((prev) =>
      prev.map((m) => {
        const mCmid = m.conversation_message_id || m.id;
        if (mCmid !== cmid) return m;

        let existingReactions = m.reactions ? [...m.reactions] : [];

        // 1. Убираем нашу реакцию из других эмодзи
        existingReactions = existingReactions
          .map((r) => {
            if (r.user_ids?.includes(ourGroupId)) {
              const newUserIds = r.user_ids.filter((id) => id !== ourGroupId);
              return { ...r, count: newUserIds.length, user_ids: newUserIds };
            }
            return r;
          })
          .filter((r) => r.count > 0);

        // 2. Добавляем в целевую реакцию
        const targetIdx = existingReactions.findIndex((r) => r.reaction_id === reactionId);
        if (targetIdx >= 0) {
          const target = existingReactions[targetIdx];
          const userIds = target.user_ids ? [...target.user_ids] : [];
          if (!userIds.includes(ourGroupId)) {
            userIds.push(ourGroupId);
          }
          existingReactions[targetIdx] = {
            ...target,
            count: userIds.length,
            user_ids: userIds,
          };
        } else {
          existingReactions.push({
            reaction_id: reactionId,
            count: 1,
            user_ids: [ourGroupId],
          });
        }

        return { ...m, reactions: existingReactions };
      })
    );

    try {
      await window.scmAPI.sendReaction(selectedPeerId, cmid, reactionId);
    } catch (err) {
      console.error('Reaction error:', err);
      setMessages(prevMessages);
    }
  };

  const handleDeleteReaction = async (cmid: number) => {
    if (!selectedPeerId || !window.scmAPI?.deleteReaction || !config?.groupId) return;

    const ourGroupId = -config.groupId;
    const prevMessages = messages;

    // Мгновенное оптимистичное удаление UI
    setMessages((prev) =>
      prev.map((m) => {
        const mCmid = m.conversation_message_id || m.id;
        if (mCmid !== cmid) return m;

        let existingReactions = m.reactions ? [...m.reactions] : [];
        existingReactions = existingReactions
          .map((r) => {
            if (r.user_ids?.includes(ourGroupId)) {
              const newUserIds = r.user_ids.filter((id) => id !== ourGroupId);
              return { ...r, count: newUserIds.length, user_ids: newUserIds };
            }
            return r;
          })
          .filter((r) => r.count > 0);

        return { ...m, reactions: existingReactions };
      })
    );

    try {
      await window.scmAPI.deleteReaction(selectedPeerId, cmid);
    } catch (err) {
      console.warn('Delete reaction error:', err);
      setMessages(prevMessages);
    }
  };

  const handleDeleteConversation = async (peerId: number) => {
    if (!window.scmAPI) return;
    try {
      await window.scmAPI.deleteConversation(peerId);
      setConversations((prev) => prev.filter((c) => c.peerId !== peerId));
      if (selectedPeerId === peerId) {
        setSelectedPeerId(null);
        setMessages([]);
      }
    } catch (err) {
      console.error('Delete conv error:', err);
    }
  };

  const handleBanUser = async (userId: number, comment = 'Спам') => {
    if (!window.scmAPI) return;
    try {
      await window.scmAPI.banUser(userId, comment);
      alert('Пользователь успешно заблокирован в сообществе.');
    } catch (err: any) {
      alert(`Ошибка блокировки: ${err.message}`);
    }
  };

  const handleToggleDnd = async () => {
    if (!config || !window.scmAPI) return;
    const newDnd = !config.dndMode;
    const updated = await window.scmAPI.saveConfig({ dndMode: newDnd });
    setConfig(updated);
  };

  const selectedConversation = conversations.find((c) => c.peerId === selectedPeerId) || null;

  if (!config) {
    return (
      <div className="h-screen w-screen bg-surface-950 flex items-center justify-center text-white text-xs">
        Инициализация Sentinel Community Manager...
      </div>
    );
  }

  return (
    <div className="h-screen w-screen flex flex-col bg-surface-950 overflow-hidden font-sans select-none">
      {/* Шапка приложения */}
      <Header
        config={config}
        isConnected={isConnected}
        dndMode={config.dndMode}
        onToggleDnd={handleToggleDnd}
        onOpenSupport={() => setIsSupportOpen(true)}
        onOpenSettings={() => setIsSettingsOpen(true)}
        onOpenTemplates={() => setIsTemplatesOpen(true)}
        unreadCount={totalUnread}
      />

      {/* Основная рабочая область */}
      <div className="flex-1 flex overflow-hidden">
        {/* Боковая навигация по вкладкам */}
        <div className="w-16 bg-surface-950 border-r border-surface-800 flex flex-col items-center py-3 gap-3 shrink-0">
          <button
            onClick={() => setActiveTab('chats')}
            className={`w-10 h-10 rounded-xl flex items-center justify-center transition-all relative ${
              activeTab === 'chats'
                ? 'bg-accent text-white shadow-md'
                : 'text-surface-400 hover:text-white hover:bg-surface-900'
            }`}
            title="Диалоги"
          >
            <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8 12h.01M12 12h.01M16 12h.01M21 12c0 4.418-4.03 8-9 8a9.863 9.863 0 01-4.255-.949L3 20l1.395-3.72C3.512 15.042 3 13.574 3 12c0-4.418 4.03-8 9-8s9 3.582 9 8z" />
            </svg>
            {unreadMessagesCount > 0 && (
              <span className="absolute -top-1 -right-1 bg-accent text-white text-[9px] font-bold px-1.5 py-0.2 rounded-full shadow-sm border border-surface-950">
                {unreadMessagesCount}
              </span>
            )}
          </button>

          <button
            onClick={() => {
              setActiveTab('activity');
              window.scmAPI?.markActivityRead?.();
              setActivityEvents((prev) => prev.map((e) => ({ ...e, read: true })));
            }}
            className={`w-10 h-10 rounded-xl flex items-center justify-center transition-all relative ${
              activeTab === 'activity'
                ? 'bg-accent text-white shadow-md'
                : 'text-surface-400 hover:text-white hover:bg-surface-900'
            }`}
            title="Лента активности сообщества"
          >
            <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13 10V3L4 14h7v7l9-11h-7z" />
            </svg>
            {unreadActivityCount > 0 && (
              <span className="absolute -top-1 -right-1 bg-rose-500 text-white text-[9px] font-bold px-1.5 py-0.2 rounded-full shadow-sm border border-surface-950 animate-pulse">
                {unreadActivityCount}
              </span>
            )}
          </button>
        </div>

        {activeTab === 'chats' ? (
          <>
            {/* Список диалогов */}
            <ConversationsList
              conversations={conversations}
              selectedPeerId={selectedPeerId}
              onSelectConversation={handleSelectConversation}
              isLoading={isLoadingConversations}
              totalConversationsCount={totalConversationsCount}
              onLoadMoreConversations={() => loadConversations(conversations.length)}
              onLoadAllConversations={() => loadConversations(0)}
              onRefreshConversations={() => loadConversations(0)}
            />

            {/* Окно переписки */}
            <ChatView
              conversation={selectedConversation}
              messages={messages}
              isLoading={isLoadingMessages}
              templates={templates}
              onSendMessage={handleSendMessage}
              onSendSticker={handleSendSticker}
              onUploadImage={handleUploadImage}
              groupId={config.groupId}
              onSendReaction={handleSendReaction}
              onDeleteReaction={handleDeleteReaction}
              onDeleteConversation={handleDeleteConversation}
              onBanUser={handleBanUser}
              onOpenTemplatesModal={() => setIsTemplatesOpen(true)}
            />
          </>
        ) : (
          /* Лента событий сообщества */
          <ActivityFeed
            events={activityEvents}
            onOpenChat={(uid) => handleSelectConversation(uid)}
            communityName={config.groupName}
          />
        )}
      </div>

      {/* Модальные окна */}
      <OnboardingModal
        isOpen={isOnboardingOpen}
        onSuccess={(newCfg) => {
          setConfig(newCfg);
          setIsOnboardingOpen(false);
          loadConversations();
        }}
      />

      <SupportModal
        isOpen={isSupportOpen}
        onClose={() => setIsSupportOpen(false)}
      />

      <SettingsModal
        isOpen={isSettingsOpen}
        onClose={() => setIsSettingsOpen(false)}
        config={config}
        onConfigUpdated={setConfig}
        onOpenOnboarding={() => setIsOnboardingOpen(true)}
        onClearActivity={() => {
          window.scmAPI?.clearActivityEvents?.();
          setActivityEvents([]);
        }}
      />

      <TemplateEditorModal
        isOpen={isTemplatesOpen}
        onClose={() => setIsTemplatesOpen(false)}
        templates={templates}
        onSaveTemplates={setTemplates}
      />
    </div>
  );
};
