import React, { useState } from 'react';
import { ActivityEvent } from '../types/scm';

interface ActivityFeedProps {
  events: ActivityEvent[];
  onOpenChat: (userId: number) => void;
  communityName?: string;
}

export const ActivityFeed: React.FC<ActivityFeedProps> = ({ events, onOpenChat, communityName }) => {
  const [filter, setFilter] = useState<'all' | 'unread' | 'subscribers' | 'reactions' | 'comments'>('all');

  // Дедупликация каскадных реакций VK (лайк на пост + вложенные фото/видео от одного пользователя)
  const deduplicatedEvents = events.filter((e, idx, arr) => {
    if (e.type === 'like') {
      const duplicateIndex = arr.findIndex(
        (other, oIdx) =>
          oIdx < idx &&
          other.type === 'like' &&
          other.userId === e.userId &&
          Math.abs(other.timestamp - e.timestamp) <= 8
      );
      if (duplicateIndex !== -1) return false;
    }
    return true;
  });

  const totalUnread = deduplicatedEvents.filter((e) => !e.read).length;
  const subUnread = deduplicatedEvents.filter((e) => !e.read && (e.type === 'join' || e.type === 'leave')).length;
  const reactionUnread = deduplicatedEvents.filter((e) => !e.read && (e.type === 'like' || e.type === 'repost')).length;
  const commentUnread = deduplicatedEvents.filter((e) => !e.read && e.type === 'comment').length;

  const filteredEvents = deduplicatedEvents.filter((e) => {
    if (filter === 'unread') return !e.read;
    if (filter === 'subscribers') return e.type === 'join' || e.type === 'leave';
    if (filter === 'reactions') return e.type === 'like' || e.type === 'repost';
    if (filter === 'comments') return e.type === 'comment';
    return true;
  });

  const getEventIcon = (type: string) => {
    switch (type) {
      case 'join':
        return (
          <svg className="w-3.5 h-3.5 text-emerald-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M18 9v3m0 0v3m0-3h3m-3 0h-3m-2-5a4 4 0 11-8 0 4 4 0 018 0zM3 20a6 6 0 0112 0v1H3v-1z" />
          </svg>
        );
      case 'leave':
        return (
          <svg className="w-3.5 h-3.5 text-rose-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13 7a4 4 0 11-8 0 4 4 0 018 0zM9 14a6 6 0 00-6 6v1h12v-1a6 6 0 00-6-6zM21 12h-6" />
          </svg>
        );
      case 'like':
        return (
          <svg className="w-3.5 h-3.5 text-rose-500 fill-current" viewBox="0 0 24 24">
            <path d="M12 21.35l-1.45-1.32C5.4 15.36 2 12.28 2 8.5 2 5.42 4.42 3 7.5 3c1.74 0 3.41.81 4.5 2.09C13.09 3.81 14.76 3 16.5 3 19.58 3 22 5.42 22 8.5c0 3.78-3.4 6.86-8.55 11.54L12 21.35z" />
          </svg>
        );
      case 'repost':
        return (
          <svg className="w-3.5 h-3.5 text-sky-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8.684 13.342C8.886 12.938 9 12.482 9 12c0-.482-.114-.938-.316-1.342m0 2.684a3 3 0 110-2.684m0 2.684l6.632 3.316m-6.632-6l6.632-3.316m0 0a3 3 0 105.367-2.684 3 3 0 00-5.367 2.684zm0 9.316a3 3 0 105.368 2.684 3 3 0 00-5.368-2.684z" />
          </svg>
        );
      case 'comment':
        return (
          <svg className="w-3.5 h-3.5 text-accent" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8 12h.01M12 12h.01M16 12h.01M21 12c0 4.418-4.03 8-9 8a9.863 9.863 0 01-4.255-.949L3 20l1.395-3.72C3.512 15.042 3 13.574 3 12c0-4.418 4.03-8 9-8s9 3.582 9 8z" />
          </svg>
        );
      default:
        return null;
    }
  };

  const getEventBadge = (type: string) => {
    switch (type) {
      case 'join':
        return <span className="text-[10px] px-2 py-0.5 rounded-full bg-emerald-500/15 text-emerald-400 border border-emerald-500/30 font-semibold whitespace-nowrap">Подписка</span>;
      case 'leave':
        return <span className="text-[10px] px-2 py-0.5 rounded-full bg-rose-500/15 text-rose-400 border border-rose-500/30 font-semibold whitespace-nowrap">Отписка</span>;
      case 'like':
        return <span className="text-[10px] px-2 py-0.5 rounded-full bg-rose-500/15 text-rose-400 border border-rose-500/30 font-semibold whitespace-nowrap">Лайк</span>;
      case 'repost':
        return <span className="text-[10px] px-2 py-0.5 rounded-full bg-sky-500/15 text-sky-400 border border-sky-500/30 font-semibold whitespace-nowrap">Репост</span>;
      case 'comment':
        return <span className="text-[10px] px-2 py-0.5 rounded-full bg-accent-subtle text-accent border border-accent-border font-semibold whitespace-nowrap">Комментарий</span>;
      default:
        return null;
    }
  };

  return (
    <div className="flex-1 flex flex-col bg-surface-950 overflow-hidden select-none">
      {/* Панель фильтров */}
      <div className="h-14 bg-surface-900/90 border-b border-surface-800 px-6 flex items-center justify-between shrink-0 backdrop-blur-md">
        <div className="flex items-center gap-2">
          <svg className="w-4 h-4 text-accent" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M3 4a1 1 0 011-1h16a1 1 0 011 1v2.586a1 1 0 01-.293.707l-6.414 6.414a1 1 0 00-.293.707V17l-4 4v-6.586a1 1 0 00-.293-.707L3.293 7.293A1 1 0 013 6.586V4z" />
          </svg>
          <h2 className="text-xs font-bold text-white uppercase tracking-wider">
            {communityName ? `Мониторинг: ${communityName}` : 'Живой мониторинг сообщества'}
          </h2>
          <div className="hidden md:flex items-center gap-1.5 ml-2 px-2 py-0.5 rounded-full bg-emerald-500/10 border border-emerald-500/20 text-[10px] font-mono text-emerald-400">
            <span className="w-1.5 h-1.5 rounded-full bg-emerald-400 animate-pulse" />
            <span>Bots Long Poll 5.199</span>
          </div>
        </div>

        <div className="flex items-center gap-1.5 bg-surface-950 p-1 rounded-xl border border-surface-800">
          <button
            onClick={() => setFilter('all')}
            className={`px-3 py-1 rounded-lg text-xs font-medium transition-all flex items-center gap-1.5 ${
              filter === 'all' ? 'bg-surface-850 text-white font-semibold shadow-sm' : 'text-surface-400 hover:text-white'
            }`}
          >
            <span>Все</span>
            {totalUnread > 0 && (
              <span className="text-[10px] px-1.5 py-0.2 rounded-full bg-accent text-white font-bold animate-pulse">
                {totalUnread}
              </span>
            )}
          </button>

          <button
            onClick={() => setFilter('unread')}
            className={`px-3 py-1 rounded-lg text-xs font-medium transition-all flex items-center gap-1.5 ${
              filter === 'unread' ? 'bg-surface-850 text-white font-semibold shadow-sm' : 'text-surface-400 hover:text-white'
            }`}
          >
            <span>Непрочитанные</span>
            {totalUnread > 0 && (
              <span className="text-[10px] px-1.5 py-0.2 rounded-full font-bold bg-accent/20 text-accent border border-accent-border">
                {totalUnread}
              </span>
            )}
          </button>

          <button
            onClick={() => setFilter('subscribers')}
            className={`px-3 py-1 rounded-lg text-xs font-medium transition-all flex items-center gap-1.5 ${
              filter === 'subscribers' ? 'bg-surface-850 text-white font-semibold shadow-sm' : 'text-surface-400 hover:text-white'
            }`}
          >
            <span>Подписчики</span>
            {subUnread > 0 && (
              <span className="text-[10px] px-1.5 py-0.2 rounded-full bg-emerald-500/20 text-emerald-400 border border-emerald-500/30 font-semibold">
                {subUnread}
              </span>
            )}
          </button>

          <button
            onClick={() => setFilter('reactions')}
            className={`px-3 py-1 rounded-lg text-xs font-medium transition-all flex items-center gap-1.5 ${
              filter === 'reactions' ? 'bg-surface-850 text-white font-semibold shadow-sm' : 'text-surface-400 hover:text-white'
            }`}
          >
            <span>Реакции</span>
            {reactionUnread > 0 && (
              <span className="text-[10px] px-1.5 py-0.2 rounded-full bg-rose-500/20 text-rose-400 border border-rose-500/30 font-semibold">
                {reactionUnread}
              </span>
            )}
          </button>

          <button
            onClick={() => setFilter('comments')}
            className={`px-3 py-1 rounded-lg text-xs font-medium transition-all flex items-center gap-1.5 ${
              filter === 'comments' ? 'bg-surface-850 text-white font-semibold shadow-sm' : 'text-surface-400 hover:text-white'
            }`}
          >
            <span>Комментарии</span>
            {commentUnread > 0 && (
              <span className="text-[10px] px-1.5 py-0.2 rounded-full bg-accent-subtle text-accent border border-accent-border font-semibold">
                {commentUnread}
              </span>
            )}
          </button>
        </div>
      </div>

      {/* Список событий */}
      <div className="flex-1 overflow-y-auto p-6 max-w-4xl mx-auto w-full flex flex-col gap-3">
        {filteredEvents.length === 0 ? (
          <div className="py-20 text-center text-xs text-surface-500 flex flex-col items-center justify-center gap-2">
            <div className="w-12 h-12 rounded-xl bg-surface-900 border border-surface-800 flex items-center justify-center text-surface-500">
              <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 17h5l-1.405-1.405A2.032 2.032 0 0118 14.158V11a6.002 6.002 0 00-4-5.659V5a2 2 0 10-4 0v.341C7.67 6.165 6 8.388 6 11v3.159c0 .538-.214 1.055-.595 1.436L4 17h5m6 0v1a3 3 0 11-6 0v-1m6 0H9" />
              </svg>
            </div>
            <p className="font-semibold text-white">
              {filter === 'unread' ? 'Все события прочитаны' : 'Новых событий пока нет'}
            </p>
            <p className="text-[11px] text-surface-400">
              {filter === 'unread'
                ? 'Новые подписки, комментарии и реакции сообщества будут отображаться здесь.'
                : 'SCM автоматически отслеживает активность подключенного сообщества.'}
            </p>
          </div>
        ) : (
          filteredEvents.map((item) => (
            <div
              key={item.id}
              className={`p-3.5 bg-surface-900/90 rounded-2xl border transition-all flex items-center justify-between gap-4 shadow-sm relative ${
                item.read === false
                  ? 'border-accent-border bg-gradient-to-r from-accent/10 via-surface-900/90 to-surface-900/90'
                  : 'border-surface-800 hover:border-surface-700/80'
              }`}
            >
              {item.read === false && (
                <span className="absolute top-2.5 right-2.5 flex h-2 w-2" title="Новое непрочитанное событие">
                  <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-accent opacity-75"></span>
                  <span className="relative inline-flex rounded-full h-2 w-2 bg-accent"></span>
                </span>
              )}

              <div className="flex items-center gap-3.5 min-w-0">
                <div className="relative shrink-0">
                  <img
                    src={item.userPhoto || 'https://vk.com/images/camera_100.png'}
                    alt={item.userName}
                    className="w-10 h-10 rounded-full object-cover border border-surface-700/80 shadow-sm"
                  />
                  <div className="absolute -bottom-1 -right-1 w-5 h-5 rounded-full bg-surface-950 border border-surface-800 flex items-center justify-center">
                    {getEventIcon(item.type)}
                  </div>
                </div>

                <div className="min-w-0">
                  <div className="flex items-center gap-2 mb-0.5">
                    <span className="text-xs font-bold text-white truncate">
                      {item.userName}
                    </span>
                    {getEventBadge(item.type)}
                  </div>
                  <p className="text-xs text-surface-300 truncate">{item.details}</p>
                </div>
              </div>

              <div className="flex items-center gap-2 shrink-0">
                <span className="text-[11px] font-mono text-surface-500">
                  {new Date(item.timestamp * 1000).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
                </span>

                {item.userId > 0 && (
                  <button
                    onClick={() => onOpenChat(item.userId)}
                    className="flex items-center gap-1.5 px-3 py-1.5 bg-accent-subtle hover:bg-accent/20 text-accent border border-accent-border rounded-xl text-xs font-semibold transition-colors"
                    title="Перейти к диалогу"
                  >
                    <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8 12h.01M12 12h.01M16 12h.01M21 12c0 4.418-4.03 8-9 8a9.863 9.863 0 01-4.255-.949L3 20l1.395-3.72C3.512 15.042 3 13.574 3 12c0-4.418 4.03-8 9-8s9 3.582 9 8z" />
                    </svg>
                    <span>В диалог</span>
                  </button>
                )}

                {item.userId > 0 && (
                  <button
                    onClick={() => window.scmAPI?.openExternal(`https://vk.com/id${item.userId}`)}
                    className="p-2 hover:bg-surface-800 text-surface-400 hover:text-white rounded-xl transition-colors"
                    title="Открыть страницу VK"
                  >
                    <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M10 6H6a2 2 0 00-2 2v10a2 2 0 002 2h10a2 2 0 002-2v-4M14 4h6m0 0v6m0-6L10 14" />
                    </svg>
                  </button>
                )}
              </div>
            </div>
          ))
        )}
      </div>
    </div>
  );
};
