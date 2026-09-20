import React, { useEffect, useState } from 'react';
import { UserProfile } from '../types/scm';

interface UserProfileModalProps {
  userId: number;
  initialUser?: UserProfile;
  onClose: () => void;
  onBanUser?: (userId: number, userName: string) => Promise<void>;
}

export const UserProfileModal: React.FC<UserProfileModalProps> = ({ userId, initialUser, onClose, onBanUser }) => {
  const [profile, setProfile] = useState<UserProfile | null>(initialUser || null);
  const [isLoading, setIsLoading] = useState(false);
  const [copied, setCopied] = useState(false);

  useEffect(() => {
    const fetchDetails = async () => {
      try {
        setIsLoading(true);
        if (window.scmAPI?.getUserDetails) {
          const details = await window.scmAPI.getUserDetails(userId);
          setProfile(details);
        }
      } catch (err) {
        console.error('Ошибка загрузки профиля:', err);
      } finally {
        setIsLoading(false);
      }
    };

    fetchDetails();
  }, [userId]);

  const copyProfileLink = () => {
    const link = `https://vk.com/${profile?.screen_name || `id${userId}`}`;
    navigator.clipboard.writeText(link);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  const openInBrowser = () => {
    const link = `https://vk.com/${profile?.screen_name || `id${userId}`}`;
    window.scmAPI?.openExternal?.(link);
  };

  const formatLastSeen = (ls?: { time: number; platform: number }) => {
    if (!ls || !ls.time) return 'Был в сети недавно';
    const date = new Date(ls.time * 1000);
    const diffMins = Math.floor((Date.now() - date.getTime()) / 60000);

    let platformStr = '';
    if (ls.platform === 1) platformStr = 'моб. версия';
    else if (ls.platform === 2 || ls.platform === 3) platformStr = 'iPhone';
    else if (ls.platform === 4) platformStr = 'Android';
    else if (ls.platform === 7) platformStr = 'ПК';

    if (diffMins < 3) return 'Сейчас онлайн' + (platformStr ? ` (${platformStr})` : '');
    if (diffMins < 60) return `Был в сети ${diffMins} мин. назад` + (platformStr ? ` (${platformStr})` : '');
    return `Был в сети ${date.toLocaleDateString([], { day: 'numeric', month: 'short' })} в ${date.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}` + (platformStr ? ` (${platformStr})` : '');
  };

  return (
    <div className="fixed inset-0 z-50 bg-black/80 backdrop-blur-sm flex items-center justify-center p-4 select-none animate-fadeIn">
      <div className="bg-surface-900 border border-surface-700 rounded-3xl w-full max-w-md overflow-hidden shadow-2xl flex flex-col">
        {/* Шапка модалки */}
        <div className="px-6 py-4 border-b border-surface-800 flex items-center justify-between">
          <div className="flex items-center gap-2">
            <span className="text-xs font-bold text-white uppercase tracking-wider">Профиль пользователя</span>
            {isLoading && (
              <svg className="w-3.5 h-3.5 animate-spin text-accent" fill="none" viewBox="0 0 24 24">
                <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
                <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z" />
              </svg>
            )}
          </div>
          <button onClick={onClose} className="p-1 hover:bg-surface-800 text-surface-400 hover:text-white rounded-lg">
            <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
            </svg>
          </button>
        </div>

        {/* Контент профиля */}
        <div className="p-6 flex flex-col items-center gap-4 text-center">
          {/* Большая аватарка */}
          <div className="relative">
            {profile?.photo_max || profile?.photo_200 || profile?.photo_100 ? (
              <img
                src={profile.photo_max || profile.photo_200 || profile.photo_100}
                alt={profile.first_name}
                className="w-24 h-24 rounded-full object-cover border-2 border-accent shadow-xl"
              />
            ) : (
              <div className="w-24 h-24 rounded-full bg-surface-800 border border-surface-700 flex items-center justify-center text-surface-400">
                <svg className="w-10 h-10" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M16 7a4 4 0 11-8 0 4 4 0 018 0zM12 14a7 7 0 00-7 7h14a7 7 0 00-7-7z" />
                </svg>
              </div>
            )}
          </div>

          <div>
            <h2 className="text-lg font-bold text-white">
              {profile?.first_name} {profile?.last_name}
            </h2>
            <p className="text-xs font-mono text-accent mt-0.5">
              @{profile?.screen_name || `id${userId}`}
            </p>
            <p className="text-[11px] text-surface-400 mt-1">
              {formatLastSeen(profile?.last_seen)}
            </p>
          </div>

          {/* Статус / Цитата */}
          {profile?.status && (
            <div className="w-full p-3 bg-surface-950 border border-surface-800 rounded-2xl text-xs text-surface-300 italic">
              «{profile.status}»
            </div>
          )}

          {/* Детали */}
          <div className="w-full flex flex-col gap-2 text-xs text-surface-300 bg-surface-950 p-3.5 rounded-2xl border border-surface-800 text-left">
            {profile?.city && (
              <div className="flex items-center gap-2">
                <span className="text-surface-400">Город:</span>
                <span className="font-semibold text-white">{profile.city}{profile.country ? `, ${profile.country}` : ''}</span>
              </div>
            )}

            {profile?.bdate && (
              <div className="flex items-center gap-2">
                <span className="text-surface-400">День рождения:</span>
                <span className="font-semibold text-white">{profile.bdate}</span>
              </div>
            )}

            <div className="flex items-center gap-2">
              <span className="text-surface-400">Личные сообщения:</span>
              <span className="text-emerald-400 font-semibold">Открыты</span>
            </div>
          </div>

          {/* Действия */}
          <div className="w-full flex items-center gap-2 pt-2">
            <button
              onClick={copyProfileLink}
              className="flex-1 py-2.5 px-3 rounded-xl bg-surface-800 hover:bg-surface-700 text-surface-200 border border-surface-700 text-xs font-semibold flex items-center justify-center gap-1.5 transition-colors"
            >
              <span>{copied ? 'Скопировано!' : 'Копировать ссылку'}</span>
            </button>

            <button
              onClick={openInBrowser}
              className="py-2.5 px-4 rounded-xl bg-accent hover:bg-accent-hover text-white text-xs font-bold flex items-center justify-center gap-1.5 transition-all shadow-md active:scale-95"
              title="Открыть в браузере"
            >
              <span>Страница VK</span>
            </button>
          </div>

          {onBanUser && (
            <button
              onClick={async () => {
                const name = `${profile?.first_name || ''} ${profile?.last_name || ''}`.trim() || `Пользователь #${userId}`;
                const confirmed = window.confirm(
                  `Заблокировать ${name} в сообществе?\nПользователь больше не сможет писать в сообщения группы.`
                );
                if (!confirmed) return;
                await onBanUser(userId, name);
                onClose();
              }}
              className="w-full mt-2 py-2 px-3 bg-rose-500/10 hover:bg-rose-500/20 text-rose-400 border border-rose-500/30 rounded-xl text-xs font-semibold transition-colors flex items-center justify-center gap-1.5"
            >
              <span>Заблокировать в сообществе</span>
            </button>
          )}
        </div>
      </div>
    </div>
  );
};
