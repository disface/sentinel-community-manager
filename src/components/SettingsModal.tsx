import React, { useState } from 'react';
import { AppConfig } from '../types/scm';
import { useTheme } from '../theme/ThemeContext';

interface SettingsModalProps {
  isOpen: boolean;
  onClose: () => void;
  config: AppConfig;
  onConfigUpdated: (newConfig: AppConfig) => void;
  onOpenOnboarding: () => void;
  onClearActivity: () => void;
}

export const SettingsModal: React.FC<SettingsModalProps> = ({
  isOpen,
  onClose,
  config,
  onConfigUpdated,
  onOpenOnboarding,
  onClearActivity,
}) => {
  const { currentTheme, setTheme, presets } = useTheme();
  const [autoLaunch, setAutoLaunch] = useState(config.autoLaunch);
  const [soundEnabled, setSoundEnabled] = useState(config.soundEnabled);
  const [volume, setVolume] = useState(config.volume || 80);
  const [downloadDir, setDownloadDir] = useState(config.downloadDir || '');
  const [uiScale, setUiScale] = useState(config.uiScale || 1.0);

  if (!isOpen) return null;

  const handleSelectFolder = async () => {
    if (!window.scmAPI?.selectFolder) return;
    const folder = await window.scmAPI.selectFolder();
    if (folder) {
      setDownloadDir(folder);
      const updated = await window.scmAPI.saveConfig({ downloadDir: folder });
      onConfigUpdated(updated);
    }
  };

  const handleToggleAutoLaunch = async (val: boolean) => {
    setAutoLaunch(val);
    const updated = await window.scmAPI.saveConfig({ autoLaunch: val });
    onConfigUpdated(updated);
  };

  const handleToggleSound = async (val: boolean) => {
    setSoundEnabled(val);
    const updated = await window.scmAPI.saveConfig({ soundEnabled: val });
    onConfigUpdated(updated);
  };

  const handleChangeVolume = async (val: number) => {
    setVolume(val);
    const updated = await window.scmAPI.saveConfig({ volume: val });
    onConfigUpdated(updated);
  };

  const handleChangeUiScale = (factor: number) => {
    setUiScale(factor);
    if (window.scmAPI?.setZoomFactor) {
      window.scmAPI.setZoomFactor(factor);
    }
    window.scmAPI.saveConfig({ uiScale: factor }).then(onConfigUpdated).catch(console.error);
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/75 backdrop-blur-sm p-4 animate-fadeIn">
      <div className="bg-surface-900 border border-surface-700 w-full max-w-lg rounded-2xl p-6 shadow-2xl relative flex flex-col max-h-[88vh] overflow-y-auto">
        {/* Шапка */}
        <div className="flex items-center justify-between pb-4 mb-4 border-b border-surface-800">
          <div className="flex items-center gap-2.5">
            <div className="w-8 h-8 rounded-lg bg-surface-800 border border-surface-700 flex items-center justify-center text-accent">
              <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M10.325 4.317c.426-1.756 2.924-1.756 3.35 0a1.724 1.724 0 002.573 1.066c1.543-.94 3.31.826 2.37 2.37a1.724 1.724 0 001.065 2.572c1.756.426 1.756 2.924 0 3.35a1.724 1.724 0 00-1.066 2.573c.94 1.543-.826 3.31-2.37 2.37a1.724 1.724 0 00-2.572 1.065c-.426 1.756-2.924 1.756-3.35 0a1.724 1.724 0 00-2.573-1.066c-1.543.94-3.31-.826-2.37-2.37a1.724 1.724 0 00-1.065-2.572c-1.756-.426-1.756-2.924 0-3.35a1.724 1.724 0 001.066-2.573c-.94-1.543.826-3.31 2.37-2.37.996.608 2.296.07 2.572-1.065z" />
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 12a3 3 0 11-6 0 3 3 0 016 0z" />
              </svg>
            </div>
            <h3 className="text-lg font-bold text-white">Параметры приложения</h3>
          </div>
          <button
            onClick={onClose}
            className="p-1.5 text-surface-400 hover:text-white rounded-lg hover:bg-surface-800 transition-colors"
          >
            <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
            </svg>
          </button>
        </div>

        <div className="space-y-6 text-sm">
          {/* 1. Theme Engine */}
          <div>
            <label className="block text-xs font-semibold text-surface-300 mb-2.5">
              Цветовая тема оформления
            </label>
            <div className="grid grid-cols-3 gap-2.5">
              {presets.map((p) => {
                const isSelected = currentTheme.id === p.id;
                return (
                  <button
                    key={p.id}
                    onClick={() => setTheme(p.id)}
                    className={`flex items-center gap-2 p-2 rounded-xl border text-xs font-medium transition-all ${
                      isSelected
                        ? 'border-accent bg-accent-subtle text-white shadow-sm'
                        : 'border-surface-700 bg-surface-850 text-surface-400 hover:border-surface-600 hover:text-surface-200'
                    }`}
                  >
                    <span
                      className="w-3.5 h-3.5 rounded-full flex-shrink-0 shadow-sm"
                      style={{ backgroundColor: p.color }}
                    />
                    <span className="truncate">{p.name.split(' ')[0]}</span>
                  </button>
                );
              })}
            </div>
          </div>

          {/* 2. Масштаб интерфейса */}
          <div>
            <label className="block text-xs font-semibold text-surface-300 mb-2">
              Масштабирование интерфейса
            </label>
            <div className="flex items-center gap-2">
              {[0.9, 1.0, 1.1, 1.25].map((scale) => (
                <button
                  key={scale}
                  onClick={() => handleChangeUiScale(scale)}
                  className={`flex-1 py-1.5 rounded-lg border text-xs font-medium transition-all ${
                    Math.abs(uiScale - scale) < 0.01
                      ? 'border-accent bg-accent text-white'
                      : 'border-surface-700 bg-surface-850 text-surface-400 hover:text-white'
                  }`}
                >
                  {Math.round(scale * 100)}%
                </button>
              ))}
            </div>
          </div>

          {/* 3. Системные опции */}
          <div className="p-3.5 bg-surface-850 rounded-xl border border-surface-800 space-y-3.5">
            <div className="flex items-center justify-between">
              <div>
                <div className="font-medium text-white text-xs">Автозапуск с Windows</div>
                <div className="text-[11px] text-surface-400">Запуск в фоновом режиме в системном трее</div>
              </div>
              <input
                type="checkbox"
                checked={autoLaunch}
                onChange={(e) => handleToggleAutoLaunch(e.target.checked)}
                className="w-4 h-4 rounded text-accent focus:ring-0 cursor-pointer"
              />
            </div>

            <div className="flex items-center justify-between pt-2 border-t border-surface-800">
              <div>
                <div className="font-medium text-white text-xs">Звуки уведомлений</div>
                <div className="text-[11px] text-surface-400">Звуковой сигнал при новых сообщениях</div>
              </div>
              <input
                type="checkbox"
                checked={soundEnabled}
                onChange={(e) => handleToggleSound(e.target.checked)}
                className="w-4 h-4 rounded text-accent focus:ring-0 cursor-pointer"
              />
            </div>

            {soundEnabled && (
              <div className="pt-2 border-t border-surface-800">
                <div className="flex items-center justify-between text-xs text-surface-400 mb-1">
                  <span>Громкость уведомлений</span>
                  <span>{volume}%</span>
                </div>
                <input
                  type="range"
                  min="0"
                  max="100"
                  value={volume}
                  onChange={(e) => handleChangeVolume(Number(e.target.value))}
                  className="w-full h-1.5 bg-surface-700 rounded-lg cursor-pointer"
                />
              </div>
            )}
          </div>

          {/* 4. Папка загрузок */}
          <div>
            <label className="block text-xs font-semibold text-surface-300 mb-1.5">
              Каталог сохранения файлов
            </label>
            <div className="flex items-center gap-2">
              <input
                type="text"
                readOnly
                value={downloadDir || 'По умолчанию (папка Загрузки)'}
                className="flex-1 bg-surface-950 border border-surface-700 rounded-xl px-3 py-2 text-xs text-surface-300 outline-none truncate"
              />
              <button
                onClick={handleSelectFolder}
                className="px-3 py-2 bg-surface-800 hover:bg-surface-700 text-surface-200 text-xs font-medium rounded-xl border border-surface-700 transition-colors flex-shrink-0"
              >
                Обзор...
              </button>
            </div>
          </div>

          {/* 5. Подключенное сообщество */}
          <div className="p-3.5 bg-surface-850 rounded-xl border border-surface-800 flex items-center justify-between">
            <div className="flex items-center gap-3">
              {config.groupPhoto ? (
                <img src={config.groupPhoto} alt="Group" className="w-9 h-9 rounded-full object-cover" />
              ) : (
                <div className="w-9 h-9 rounded-full bg-surface-700 flex items-center justify-center text-xs font-bold text-surface-300">
                  VK
                </div>
              )}
              <div>
                <div className="font-semibold text-white text-xs truncate max-w-[180px]">
                  {config.groupName || `Сообщество id${config.groupId}`}
                </div>
                <div className="text-[11px] text-surface-400">ID: {config.groupId}</div>
              </div>
            </div>
            <button
              onClick={() => {
                onClose();
                onOpenOnboarding();
              }}
              className="px-3 py-1.5 bg-surface-800 hover:bg-surface-700 text-accent text-xs font-medium rounded-lg border border-surface-700 transition-colors"
            >
              Сменить сообщество
            </button>
          </div>

          {/* 6. Очистка ленты */}
          <div className="pt-2 flex justify-between items-center text-xs">
            <span className="text-surface-400">История ленты событий:</span>
            <button
              onClick={() => {
                if (window.confirm('Очистить локальный список событий в ленте?')) {
                  onClearActivity();
                }
              }}
              className="text-rose-400 hover:text-rose-300 font-medium transition-colors"
            >
              Очистить ленту активности
            </button>
          </div>
        </div>
      </div>
    </div>
  );
};
