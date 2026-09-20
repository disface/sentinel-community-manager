import React, { useState } from 'react';
import qrImage from '../assets/ozon_sbp_qr.png';

interface SupportModalProps {
  isOpen: boolean;
  onClose: () => void;
}

export const SupportModal: React.FC<SupportModalProps> = ({ isOpen, onClose }) => {
  const [copied, setCopied] = useState(false);
  const donationUrl = 'https://finance.ozon.ru/apps/sbp/ozonbankpay/01a0bc28-c9be-75eb-807d-e5abcaa7cc2d';

  if (!isOpen) return null;

  const handleOpenLink = () => {
    if (window.scmAPI?.openExternal) {
      window.scmAPI.openExternal(donationUrl);
    } else {
      window.open(donationUrl, '_blank');
    }
  };

  const handleCopyLink = async () => {
    try {
      await navigator.clipboard.writeText(donationUrl);
      setCopied(true);
      setTimeout(() => setCopied(false), 2500);
    } catch {
      // fallback
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/75 backdrop-blur-sm p-4 animate-fadeIn">
      <div className="bg-surface-900 border border-surface-700 w-full max-w-md rounded-2xl p-6 shadow-2xl relative flex flex-col items-center text-center">
        {/* Кнопка закрытия */}
        <button
          onClick={onClose}
          className="absolute top-4 right-4 p-2 text-surface-400 hover:text-white rounded-lg hover:bg-surface-800 transition-colors"
          title="Закрыть"
        >
          <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
          </svg>
        </button>

        {/* Иконка сердца */}
        <div className="w-14 h-14 rounded-2xl bg-accent-subtle border border-accent-border flex items-center justify-center text-accent mb-4 shadow-lg">
          <svg className="w-7 h-7" fill="currentColor" viewBox="0 0 24 24">
            <path d="M12 21.35l-1.45-1.32C5.4 15.36 2 12.28 2 8.5 2 5.42 4.42 3 7.5 3c1.74 0 3.41.81 4.5 2.09C13.09 3.81 14.76 3 16.5 3 19.58 3 22 5.42 22 8.5c0 3.78-3.4 6.86-8.55 11.54L12 21.35z" />
          </svg>
        </div>

        <h3 className="text-xl font-bold text-white mb-1">Поддержать проект</h3>
        <p className="text-sm text-surface-400 mb-5 leading-relaxed max-w-xs">
          Sentinel Community Manager — полностью бесплатный Open Source клиент. Если программа экономит ваше время, вы можете угостить разработчиков чашкой кофе!
        </p>

        {/* QR-код в стильной рамке */}
        <div className="bg-white p-3 rounded-2xl shadow-xl mb-4 border-2 border-accent-border relative group">
          <img
            src={qrImage}
            alt="СБП Озон Банк QR"
            className="w-48 h-48 rounded-xl object-contain mx-auto"
          />
          <div className="absolute -bottom-2 left-1/2 -translate-x-1/2 bg-surface-900 border border-surface-700 px-2.5 py-0.5 rounded-full text-[10px] font-medium text-surface-300 shadow">
            Система Быстрых Платежей (СБП)
          </div>
        </div>

        {/* Прямая ссылка и копирование */}
        <div className="w-full mt-2 space-y-2.5">
          <button
            onClick={handleOpenLink}
            className="w-full py-2.5 px-4 rounded-xl bg-accent hover:bg-accent-hover text-white font-semibold text-sm shadow-lg transition-all flex items-center justify-center gap-2"
          >
            <span>Перейти к переводу</span>
            <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M10 6H6a2 2 0 00-2 2v10a2 2 0 002 2h10a2 2 0 002-2v-4M14 4h6m0 0v6m0-6L10 14" />
            </svg>
          </button>

          <button
            onClick={handleCopyLink}
            className="w-full py-2 px-4 rounded-xl bg-surface-800 hover:bg-surface-700 text-surface-300 hover:text-white font-medium text-xs transition-colors border border-surface-700 flex items-center justify-center gap-1.5"
          >
            {copied ? (
              <>
                <svg className="w-4 h-4 text-emerald-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
                </svg>
                <span className="text-emerald-400">Ссылка скопирована в буфер!</span>
              </>
            ) : (
              <>
                <svg className="w-4 h-4 text-surface-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8 16H6a2 2 0 01-2-2V6a2 2 0 012-2h8a2 2 0 012 2v2m-6 12h8a2 2 0 002-2v-8a2 2 0 00-2-2h-8a2 2 0 00-2 2v8a2 2 0 002 2z" />
                </svg>
                <span>Скопировать прямую ссылку на оплату</span>
              </>
            )}
          </button>
        </div>

        {/* Футер с авторством */}
        <div className="mt-5 pt-3 border-t border-surface-800 w-full text-center text-xs text-surface-500">
          Разработано с ❤️ командой <span className="text-surface-300 font-medium">Максим & Antigravity AI</span>
        </div>
      </div>
    </div>
  );
};
