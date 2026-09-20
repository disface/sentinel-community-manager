import React from 'react';
import { AppConfig } from '../types/scm';

interface HeaderProps {
  config: AppConfig;
  isConnected: boolean;
  dndMode: boolean;
  onToggleDnd: () => void;
  onOpenSupport: () => void;
  onOpenSettings: () => void;
  onOpenTemplates: () => void;
  unreadCount: number;
}

export const Header: React.FC<HeaderProps> = ({
  config,
  isConnected,
  dndMode,
  onToggleDnd,
  onOpenSupport,
  onOpenSettings,
  onOpenTemplates,
  unreadCount,
}) => {
  const handleMinimize = () => window.scmAPI?.minimizeWindow?.();
  const handleMaximize = () => window.scmAPI?.maximizeWindow?.();
  const handleClose = () => window.scmAPI?.closeWindow?.();

  const handleOpenGroupUrl = () => {
    if (config.groupId) {
      const url = `https://vk.com/club${config.groupId}`;
      window.scmAPI?.openExternal?.(url);
    }
  };

  return (
    <header className="h-14 bg-surface-900 border-b border-surface-800 flex items-center justify-between px-4 select-none drag-region flex-shrink-0">
      {/* Левая часть: Бренд и сообщество */}
      <div className="flex items-center gap-3 no-drag">
        <div className="flex items-center gap-2">
          {/* Иконка щита Sentinel */}
          <div className="w-8 h-8 rounded-lg bg-accent-subtle border border-accent-border flex items-center justify-center text-accent shadow-sm">
            <svg className="w-5 h-5" fill="currentColor" viewBox="0 0 24 24">
              <path d="M12 2L4 5v6.09c0 5.05 3.41 9.76 8 10.91 4.59-1.15 8-5.86 8-10.91V5l-8-3zm1 14h-2v-2h2v2zm0-4h-2V7h2v5z" />
            </svg>
          </div>
          <div>
            <div className="font-bold text-xs text-white tracking-wide flex items-center gap-1.5">
              <span>SENTINEL</span>
              <span className="text-[10px] bg-surface-800 text-accent font-mono px-1.5 py-0.2 rounded border border-surface-700">
                SCM
              </span>
            </div>
            <div className="text-[10px] text-surface-400 font-medium">Community Manager</div>
          </div>
        </div>

        {/* Разделитель */}
        <div className="h-6 w-px bg-surface-800 mx-1 hidden sm:block" />

        {/* Подключенное сообщество */}
        {config.groupId ? (
          <div
            onClick={handleOpenGroupUrl}
            className="flex items-center gap-2 px-2.5 py-1 rounded-lg bg-surface-850 hover:bg-surface-800 border border-surface-700/60 cursor-pointer transition-colors"
            title="Открыть сообщество ВКонтакте"
          >
            {config.groupPhoto ? (
              <img src={config.groupPhoto} alt="Group" className="w-5 h-5 rounded-full object-cover" />
            ) : (
              <div className="w-5 h-5 rounded-full bg-accent/20 text-accent text-[10px] font-bold flex items-center justify-center">
                G
              </div>
            )}
            <span className="text-xs font-semibold text-surface-200 truncate max-w-[150px]">
              {config.groupName || `ID: ${config.groupId}`}
            </span>
          </div>
        ) : null}

        {/* Индикатор связи Long Poll */}
        <div className="flex items-center gap-1.5 text-[11px] px-2 py-0.5 rounded-full bg-surface-850 border border-surface-700/60">
          <span
            className={`w-2 h-2 rounded-full ${
              isConnected ? 'bg-emerald-400 shadow-[0_0_8px_rgba(52,211,153,0.6)]' : 'bg-rose-500 animate-pulse'
            }`}
          />
          <span className="text-surface-400 hidden md:inline">
            {isConnected ? 'В сети' : 'Переподключение'}
          </span>
          {unreadCount > 0 && (
            <span className="ml-1 px-1.5 py-0.2 rounded-full bg-accent text-white text-[9px] font-bold">
              {unreadCount}
            </span>
          )}
        </div>
      </div>

      {/* Правая часть: Действия и управление окном */}
      <div className="flex items-center gap-2 no-drag">
        {/* Кнопка DND (Не беспокоить) */}
        <button
          onClick={onToggleDnd}
          className={`flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg text-xs font-medium border transition-colors ${
            dndMode
              ? 'bg-rose-500/20 border-rose-500/40 text-rose-300'
              : 'bg-surface-850 border-surface-700/60 text-surface-400 hover:text-surface-200'
          }`}
          title={dndMode ? 'Режим «Не беспокоить» включен' : 'Включить тихий режим'}
        >
          <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 17h5l-1.405-1.405A2.032 2.032 0 0118 14.158V11a6.002 6.002 0 00-4-5.659V5a2 2 0 10-4 0v.341C7.67 6.165 6 8.388 6 11v3.159c0 .538-.214 1.055-.595 1.436L4 17h5m6 0v1a3 3 0 11-6 0v-1m6 0H9" />
          </svg>
          <span className="hidden lg:inline">{dndMode ? 'Тишина (DND)' : 'DND'}</span>
        </button>

        {/* Быстрые шаблоны */}
        <button
          onClick={onOpenTemplates}
          className="p-1.5 text-surface-400 hover:text-white rounded-lg hover:bg-surface-800 transition-colors"
          title="Быстрые шаблоны ответов"
        >
          <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8 10h.01M12 10h.01M16 10h.01M9 16H5a2 2 0 01-2-2V6a2 2 0 012-2h14a2 2 0 012 2v8a2 2 0 01-2 2h-5l-5 5v-5z" />
          </svg>
        </button>

        {/* Кнопка "Поддержать" */}
        <button
          onClick={onOpenSupport}
          className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-accent/15 hover:bg-accent/25 border border-accent/40 text-accent font-semibold text-xs transition-all shadow-sm"
          title="Поблагодарить разработчиков"
        >
          <svg className="w-3.5 h-3.5 fill-current" viewBox="0 0 24 24">
            <path d="M12 21.35l-1.45-1.32C5.4 15.36 2 12.28 2 8.5 2 5.42 4.42 3 7.5 3c1.74 0 3.41.81 4.5 2.09C13.09 3.81 14.76 3 16.5 3 19.58 3 22 5.42 22 8.5c0 3.78-3.4 6.86-8.55 11.54L12 21.35z" />
          </svg>
          <span>Поддержать</span>
        </button>

        {/* Настройки */}
        <button
          onClick={onOpenSettings}
          className="p-1.5 text-surface-400 hover:text-white rounded-lg hover:bg-surface-800 transition-colors"
          title="Настройки"
        >
          <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M10.325 4.317c.426-1.756 2.924-1.756 3.35 0a1.724 1.724 0 002.573 1.066c1.543-.94 3.31.826 2.37 2.37a1.724 1.724 0 001.065 2.572c1.756.426 1.756 2.924 0 3.35a1.724 1.724 0 00-1.066 2.573c.94 1.543-.826 3.31-2.37 2.37a1.724 1.724 0 00-2.572 1.065c-.426 1.756-2.924 1.756-3.35 0a1.724 1.724 0 00-2.573-1.066c-1.543.94-3.31-.826-2.37-2.37a1.724 1.724 0 00-1.065-2.572c-1.756-.426-1.756-2.924 0-3.35a1.724 1.724 0 001.066-2.573c-.94-1.543.826-3.31 2.37-2.37.996.608 2.296.07 2.572-1.065z" />
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 12a3 3 0 11-6 0 3 3 0 016 0z" />
          </svg>
        </button>

        {/* Разделитель перед кнопками окна */}
        <div className="h-5 w-px bg-surface-800 mx-1" />

        {/* Оконные кнопки Windows */}
        <div className="flex items-center">
          <button
            onClick={handleMinimize}
            className="w-7 h-7 flex items-center justify-center text-surface-400 hover:text-white hover:bg-surface-800 rounded transition-colors"
            title="Свернуть"
          >
            <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M20 12H4" />
            </svg>
          </button>
          <button
            onClick={handleMaximize}
            className="w-7 h-7 flex items-center justify-center text-surface-400 hover:text-white hover:bg-surface-800 rounded transition-colors"
            title="Развернуть"
          >
            <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <rect x="5" y="5" width="14" height="14" rx="2" strokeWidth={2} />
            </svg>
          </button>
          <button
            onClick={handleClose}
            className="w-7 h-7 flex items-center justify-center text-surface-400 hover:text-white hover:bg-rose-600 rounded transition-colors"
            title="Закрыть в трей"
          >
            <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
            </svg>
          </button>
        </div>
      </div>
    </header>
  );
};
