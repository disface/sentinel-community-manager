import React, { useState, useRef } from 'react';
import { ConversationItem } from '../types/scm';

interface ConversationsListProps {
  conversations: ConversationItem[];
  selectedPeerId: number | null;
  onSelectConversation: (peerId: number) => void;
  isLoading: boolean;
  isLoadingMore?: boolean;
  totalConversationsCount: number;
  onLoadMoreConversations: () => void;
  onLoadAllConversations: () => void;
  onRefreshConversations?: () => void;
}

export const ConversationsList: React.FC<ConversationsListProps> = ({
  conversations,
  selectedPeerId,
  onSelectConversation,
  isLoading,
  isLoadingMore = false,
  totalConversationsCount,
  onLoadMoreConversations,
  onLoadAllConversations,
  onRefreshConversations,
}) => {
  const [searchQuery, setSearchQuery] = useState('');
  const [filterUnread, setFilterUnread] = useState(false);
  const listRef = useRef<HTMLDivElement>(null);

  const filtered = conversations.filter((c) => {
    const fullName = `${c.user.first_name} ${c.user.last_name}`.toLowerCase();
    const matchesSearch = fullName.includes(searchQuery.toLowerCase()) ||
      c.lastMessage.text.toLowerCase().includes(searchQuery.toLowerCase());
    const matchesUnread = !filterUnread || c.unreadCount > 0;
    return matchesSearch && matchesUnread;
  });

  const handleScroll = () => {
    if (!listRef.current || isLoading || isLoadingMore || conversations.length >= totalConversationsCount) return;
    const { scrollTop, scrollHeight, clientHeight } = listRef.current;
    if (scrollTop + clientHeight >= scrollHeight - 60) {
      onLoadMoreConversations();
    }
  };

  const formatTimestamp = (unix: number) => {
    if (!unix) return '';
    const date = new Date(unix * 1000);
    const now = new Date();
    const isToday = date.toDateString() === now.toDateString();

    if (isToday) {
      return date.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
    }
    return date.toLocaleDateString([], { day: 'numeric', month: 'short' });
  };

  return (
    <aside className="w-80 lg:w-96 bg-surface-900 border-r border-surface-800 flex flex-col shrink-0 select-none">
      {/* Поиск и фильтр */}
      <div className="p-3 border-b border-surface-800 flex flex-col gap-2">
        <div className="flex items-center gap-1.5">
          <div className="relative flex-1">
            <svg className="w-4 h-4 text-surface-500 absolute left-3 top-1/2 -translate-y-1/2 pointer-events-none" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" />
            </svg>
            <input
              type="text"
              placeholder="Поиск по диалогам..."
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              className="w-full bg-surface-950 text-xs text-white placeholder-surface-500 pl-9 pr-7 py-2 rounded-xl border border-surface-700/60 focus:border-accent focus:outline-none transition-colors"
            />
            {searchQuery && (
              <button
                onClick={() => setSearchQuery('')}
                className="absolute right-2.5 top-1/2 -translate-y-1/2 text-surface-500 hover:text-white text-xs px-1"
                title="Очистить поиск"
              >
                ✕
              </button>
            )}
          </div>

          {onRefreshConversations && (
            <button
              onClick={onRefreshConversations}
              disabled={isLoading}
              className="p-2 rounded-xl bg-surface-950 text-surface-400 hover:text-white hover:border-accent/60 border border-surface-700/60 transition-colors disabled:opacity-50 shrink-0"
              title="Обновить список диалогов"
            >
              <svg className={`w-3.5 h-3.5 ${isLoading ? 'animate-spin text-accent' : ''}`} fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15" />
              </svg>
            </button>
          )}
        </div>

        <div className="flex items-center gap-1">
          <button
            onClick={() => setFilterUnread(false)}
            className={`flex-1 py-1 text-[11px] rounded-lg font-medium transition-colors ${
              !filterUnread
                ? 'bg-surface-850 text-white font-semibold border border-surface-700/50'
                : 'text-surface-400 hover:text-white hover:bg-surface-850'
            }`}
          >
            Все ({conversations.length}{totalConversationsCount > conversations.length ? ` / ${totalConversationsCount}` : ''})
          </button>
          <button
            onClick={() => setFilterUnread(true)}
            className={`flex-1 py-1 text-[11px] rounded-lg font-medium transition-colors ${
              filterUnread
                ? 'bg-accent/20 text-accent border border-accent/40 font-semibold'
                : 'text-surface-400 hover:text-white hover:bg-surface-850'
            }`}
          >
            Непрочитанные ({conversations.filter((c) => c.unreadCount > 0).length})
          </button>
        </div>
      </div>

      {/* Список диалогов с авто-подгрузкой */}
      <div
        ref={listRef}
        onScroll={handleScroll}
        className="flex-1 overflow-y-auto divide-y divide-surface-800/50"
      >
        {isLoading && conversations.length === 0 ? (
          <div className="p-8 text-center text-xs text-surface-400 flex flex-col items-center gap-2">
            <svg className="w-5 h-5 animate-spin text-accent" fill="none" viewBox="0 0 24 24">
              <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
              <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z" />
            </svg>
            <span>Загрузка диалогов...</span>
          </div>
        ) : filtered.length === 0 ? (
          <div className="p-8 text-center text-xs text-surface-500 flex flex-col items-center gap-2.5">
            <p>{filterUnread ? 'Все сообщения прочитаны' : 'Ничего не найдено среди загруженных'}</p>
            {searchQuery && conversations.length < totalConversationsCount && (
              <button
                onClick={onLoadAllConversations}
                disabled={isLoadingMore}
                className="mt-1 py-1.5 px-3 bg-accent/20 hover:bg-accent/30 text-accent rounded-lg border border-accent/40 text-[11px] font-medium transition-colors"
              >
                Загрузить все диалоги ({totalConversationsCount}) для поиска
              </button>
            )}
          </div>
        ) : (
          filtered.map((item) => {
            const isSelected = selectedPeerId === item.peerId;
            const hasUnread = item.unreadCount > 0;

            return (
              <div
                key={item.peerId}
                onClick={() => onSelectConversation(item.peerId)}
                className={`p-3 cursor-pointer transition-all flex items-center gap-3 relative ${
                  isSelected
                    ? 'bg-accent/15 border-l-4 border-l-accent'
                    : 'hover:bg-surface-850/60'
                }`}
              >
                {/* Аватарка */}
                <div className="relative shrink-0">
                  <img
                    src={item.user.photo_100 || 'https://vk.com/images/camera_100.png'}
                    alt={item.user.first_name}
                    className="w-11 h-11 rounded-full object-cover border border-surface-700 shadow-sm"
                  />
                  {item.user.online ? (
                    <span className="absolute bottom-0 right-0 w-3 h-3 bg-emerald-500 border-2 border-surface-900 rounded-full" />
                  ) : null}
                </div>

                {/* Инфо о диалоге */}
                <div className="flex-1 min-w-0">
                  <div className="flex items-center justify-between mb-0.5">
                    <span className={`text-xs font-bold truncate ${isSelected ? 'text-accent' : 'text-white'}`}>
                      {item.user.first_name} {item.user.last_name}
                    </span>
                    <span className="text-[10px] text-surface-500 font-mono shrink-0 ml-1">
                      {formatTimestamp(item.lastMessage.date)}
                    </span>
                  </div>

                  <div className="flex items-center justify-between gap-1">
                    <p className={`text-xs truncate ${hasUnread ? 'text-surface-100 font-medium' : 'text-surface-400'}`}>
                      {item.lastMessage.out && <span className="text-accent font-semibold mr-1">Вы:</span>}
                      {item.lastMessage.text || '[Вложение]'}
                    </p>

                    {hasUnread && (
                      <span className="shrink-0 bg-accent text-white text-[10px] font-bold px-1.5 py-0.2 rounded-full min-w-[18px] text-center">
                        {item.unreadCount}
                      </span>
                    )}
                  </div>
                </div>
              </div>
            );
          })
        )}

        {isLoadingMore && (
          <div className="p-3 text-center text-xs text-surface-500 flex items-center justify-center gap-2">
            <svg className="w-3.5 h-3.5 animate-spin text-accent" fill="none" viewBox="0 0 24 24">
              <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
              <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z" />
            </svg>
            <span>Загрузка следующих диалогов...</span>
          </div>
        )}
      </div>
    </aside>
  );
};
