import React, { useState } from 'react';
import { AppConfig } from '../types/scm';

interface OnboardingModalProps {
  isOpen: boolean;
  onSuccess: (config: AppConfig) => void;
}

export const OnboardingModal: React.FC<OnboardingModalProps> = ({ isOpen, onSuccess }) => {
  const [groupIdOrLink, setGroupIdOrLink] = useState('');
  const [token, setToken] = useState('');
  const [isValidating, setIsValidating] = useState(false);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);
  const [step, setStep] = useState<'input' | 'guide'>('input');

  if (!isOpen) return null;

  const handleValidateAndConnect = async (e: React.FormEvent) => {
    e.preventDefault();
    setErrorMsg(null);

    const cleanInput = groupIdOrLink.trim();
    const cleanToken = token.trim();

    if (!cleanInput) {
      setErrorMsg('Укажите ID, короткое имя или ссылку на ваше сообщество ВКонтакте.');
      return;
    }
    if (!cleanToken) {
      setErrorMsg('Введите ключ доступа (токен) сообщества.');
      return;
    }

    setIsValidating(true);

    try {
      const res = await window.scmAPI.validateCommunity(cleanInput, cleanToken);
      if (!res.success || !res.group) {
        setErrorMsg(res.error || 'Не удалось подключиться к сообществу. Проверьте правильность токена и ID.');
        setIsValidating(false);
        return;
      }

      const grp = res.group;
      const updatedConfig = await window.scmAPI.saveConfig({
        groupId: grp.id,
        groupName: grp.name,
        groupScreenName: grp.screen_name,
        groupPhoto: grp.photo_200 || grp.photo_100,
        token: cleanToken,
      });

      onSuccess(updatedConfig);
    } catch (err: any) {
      setErrorMsg(err.message || 'Произошла ошибка при сохранении настроек.');
    } finally {
      setIsValidating(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/80 backdrop-blur-md p-4 animate-fadeIn">
      <div className="bg-surface-900 border border-surface-700 w-full max-w-xl rounded-2xl p-6 sm:p-8 shadow-2xl relative flex flex-col max-h-[90vh] overflow-y-auto">
        {/* Заголовок с бейджем */}
        <div className="flex items-center gap-3 mb-6">
          <div className="w-12 h-12 rounded-xl bg-accent-subtle border border-accent-border flex items-center justify-center text-accent">
            <svg className="w-6 h-6" fill="currentColor" viewBox="0 0 24 24">
              <path d="M12 2L4 5v6.09c0 5.05 3.41 9.76 8 10.91 4.59-1.15 8-5.86 8-10.91V5l-8-3zm1 14h-2v-2h2v2zm0-4h-2V7h2v5z" />
            </svg>
          </div>
          <div>
            <h2 className="text-xl font-bold text-white">Мастер первого запуска SCM</h2>
            <p className="text-xs text-surface-400">Подключение вашего сообщества ВКонтакте</p>
          </div>
        </div>

        {/* Информационный баннер об ограничениях VK API */}
        <div className="p-3.5 rounded-xl bg-surface-800 border border-surface-700 mb-6 flex gap-3 text-xs leading-relaxed text-surface-300">
          <div className="text-accent flex-shrink-0 mt-0.5">
            <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13 16h-1v-4h-1m1-4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
            </svg>
          </div>
          <div>
            <span className="font-semibold text-surface-100">Важно:</span> SCM работает через официальный <span className="text-accent">Bots Long Poll API</span>. Поддерживаются только публичные страницы и группы, где вы являетесь <span className="text-surface-100 font-medium">Администратором</span>. Личные страницы пользователей не поддерживают бот-протокол сообществ.
          </div>
        </div>

        {/* Переключение вкладок: Настройка / Пошаговая инструкция */}
        <div className="flex items-center gap-2 mb-6 border-b border-surface-800 pb-3">
          <button
            type="button"
            onClick={() => setStep('input')}
            className={`px-3 py-1.5 rounded-lg text-xs font-medium transition-colors ${
              step === 'input' ? 'bg-accent text-white' : 'text-surface-400 hover:text-white hover:bg-surface-800'
            }`}
          >
            1. Ввод токена и ID
          </button>
          <button
            type="button"
            onClick={() => setStep('guide')}
            className={`px-3 py-1.5 rounded-lg text-xs font-medium transition-colors ${
              step === 'guide' ? 'bg-accent text-white' : 'text-surface-400 hover:text-white hover:bg-surface-800'
            }`}
          >
            2. Инструкция по получению ключа
          </button>
        </div>

        {step === 'guide' ? (
          <div className="space-y-4 text-xs text-surface-300 mb-6">
            <div className="p-3 bg-surface-850 rounded-xl border border-surface-800">
              <div className="font-semibold text-white mb-1">Шаг 1. Создание ключа доступа (токена)</div>
              <p className="text-surface-400">
                Зайдите в вашу группу VK → <span className="text-surface-200">«Управление»</span> → <span className="text-surface-200">«Работа с API»</span> → вкладка <span className="text-surface-200">«Ключи доступа»</span> → нажмите <span className="text-accent">«Создать ключ»</span>.
              </p>
              <p className="mt-1 text-surface-400">
                Отметьте галочками: <span className="text-surface-200 font-medium">«Управление сообществом»</span>, <span className="text-surface-200 font-medium">«Сообщения сообщества»</span>, <span className="text-surface-200 font-medium">«Фотографии»</span>.
              </p>
            </div>

            <div className="p-3 bg-surface-850 rounded-xl border border-surface-800">
              <div className="font-semibold text-white mb-1">Шаг 2. Настройка Bots Long Poll API</div>
              <p className="text-surface-400">
                В том же разделе откройте вкладку <span className="text-surface-200">«Long Poll API»</span>:
              </p>
              <ul className="list-disc pl-5 mt-1 space-y-0.5 text-surface-400">
                <li>Включите переключатель Long Poll API: <span className="text-emerald-400 font-medium">Включено</span></li>
                <li>Версия API: выберите <span className="text-surface-200 font-medium">5.199</span> (или новее)</li>
                <li>Во вкладке <span className="text-surface-200">«Типы событий»</span> отметьте: <span className="text-surface-200">Входящие сообщения, Редактирование, Реакции, Вступление/Выход из группы, Лайки, Репосты, Комментарии</span>.</li>
              </ul>
            </div>

            <button
              type="button"
              onClick={() => setStep('input')}
              className="w-full py-2.5 rounded-xl bg-surface-800 hover:bg-surface-700 text-surface-200 font-medium text-xs transition-colors border border-surface-700"
            >
              ← Вернуться к подключению
            </button>
          </div>
        ) : (
          <form onSubmit={handleValidateAndConnect} className="space-y-4">
            {errorMsg && (
              <div className="p-3 rounded-xl bg-rose-500/10 border border-rose-500/30 text-rose-300 text-xs flex items-center gap-2">
                <svg className="w-4 h-4 flex-shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 8v4m0 4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
                </svg>
                <span>{errorMsg}</span>
              </div>
            )}

            <div>
              <label className="block text-xs font-semibold text-surface-300 mb-1.5">
                ID сообщества или ссылка
              </label>
              <input
                type="text"
                value={groupIdOrLink}
                onChange={(e) => setGroupIdOrLink(e.target.value)}
                placeholder="Например: 123456789 или https://vk.com/my_group"
                className="w-full bg-surface-950 border border-surface-700 focus:border-accent rounded-xl px-3.5 py-2.5 text-sm text-white placeholder-surface-500 outline-none transition-colors"
                disabled={isValidating}
              />
              <p className="text-[11px] text-surface-500 mt-1">
                Можно вставить ссылку на группу, короткий адрес (`screen_name`) или числовой ID.
              </p>
            </div>

            <div>
              <label className="block text-xs font-semibold text-surface-300 mb-1.5">
                Ключ доступа сообщества (Токен)
              </label>
              <input
                type="password"
                value={token}
                onChange={(e) => setToken(e.target.value)}
                placeholder="vk1.a.xxxxxxxxxxxxxxxxxxxx..."
                className="w-full bg-surface-950 border border-surface-700 focus:border-accent rounded-xl px-3.5 py-2.5 text-sm font-mono text-white placeholder-surface-500 outline-none transition-colors"
                disabled={isValidating}
              />
              <p className="text-[11px] text-surface-500 mt-1">
                Шифруется на вашем диске через Windows DPAPI. Не передается на сторонние серверы.
              </p>
            </div>

            <button
              type="submit"
              disabled={isValidating}
              className="w-full mt-4 py-3 rounded-xl bg-accent hover:bg-accent-hover text-white font-semibold text-sm shadow-lg transition-all flex items-center justify-center gap-2 disabled:opacity-50"
            >
              {isValidating ? (
                <>
                  <svg className="w-4 h-4 animate-spin" fill="none" viewBox="0 0 24 24">
                    <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
                    <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z" />
                  </svg>
                  <span>Проверка доступа...</span>
                </>
              ) : (
                <>
                  <span>Подключить сообщество</span>
                  <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M14 5l7 7m0 0l-7 7m7-7H3" />
                  </svg>
                </>
              )}
            </button>
          </form>
        )}
      </div>
    </div>
  );
};
