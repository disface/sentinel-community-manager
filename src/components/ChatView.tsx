import React, { useState, useEffect, useRef } from 'react';
import { ConversationItem, QuickTemplate, VKMessage } from '../types/scm';
import { AudioPlayer } from './AudioPlayer';
import { FormattedText } from './FormattedText';
import { EmojiPicker } from './EmojiPicker';
import { UserProfileModal } from './UserProfileModal';

interface ChatViewProps {
  conversation: ConversationItem | null;
  messages: VKMessage[];
  isLoading: boolean;
  templates: QuickTemplate[];
  onSendMessage: (text: string, replyTo?: number) => Promise<void>;
  onSendSticker?: (stickerId: number) => Promise<void>;
  onUploadImage: (file: File) => Promise<void>;
  onSendReaction: (cmid: number, reactionId: number) => Promise<void>;
  onDeleteConversation: (peerId: number) => Promise<void>;
  onBanUser: (userId: number, comment?: string) => Promise<void>;
  onOpenTemplatesModal: () => void;
}

const QUICK_REACTIONS = [
  { id: 1, emoji: '❤️' },
  { id: 2, emoji: '👍' },
  { id: 3, emoji: '👎' },
  { id: 4, emoji: '🔥' },
  { id: 5, emoji: '👏' },
  { id: 6, emoji: '😂' },
  { id: 7, emoji: '💯' },
  { id: 8, emoji: '🥳' },
];

export const ChatView: React.FC<ChatViewProps> = ({
  conversation,
  messages,
  isLoading,
  templates,
  onSendMessage,
  onSendSticker,
  onUploadImage,
  onSendReaction,
  onDeleteConversation,
  onBanUser,
  onOpenTemplatesModal,
}) => {
  const [inputText, setInputText] = useState('');
  const [replyingTo, setReplyingTo] = useState<VKMessage | null>(null);
  const [showEmojiPicker, setShowEmojiPicker] = useState(false);
  const [showProfileModal, setShowProfileModal] = useState(false);
  const [activeMediaUrl, setActiveMediaUrl] = useState<string | null>(null);
  const [hoveredMessageCmid, setHoveredMessageCmid] = useState<number | null>(null);
  const [isSending, setIsSending] = useState(false);
  const [isUploading, setIsUploading] = useState(false);
  const [sendError, setSendError] = useState<string | null>(null);

  const messagesEndRef = useRef<HTMLDivElement>(null);
  const listRef = useRef<HTMLDivElement>(null);
  const atBottomRef = useRef(true);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const textareaRef = useRef<HTMLTextAreaElement>(null);

  const handleListScroll = () => {
    const el = listRef.current;
    if (!el) return;
    atBottomRef.current = el.scrollHeight - el.scrollTop - el.clientHeight < 120;
  };

  useEffect(() => {
    if (atBottomRef.current) {
      messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
    }
  }, [messages]);

  useEffect(() => {
    atBottomRef.current = true;
    messagesEndRef.current?.scrollIntoView({ behavior: 'auto' });
  }, [conversation?.peerId]);

  useEffect(() => {
    if (!activeMediaUrl) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') setActiveMediaUrl(null);
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [activeMediaUrl]);

  if (!conversation) {
    return (
      <div className="flex-1 flex flex-col items-center justify-center bg-surface-950 text-surface-500 select-none p-6 text-center">
        <div className="w-16 h-16 rounded-2xl bg-surface-900 border border-surface-800 flex items-center justify-center text-surface-600 mb-3 shadow-lg">
          <svg className="w-8 h-8" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M8 12h.01M12 12h.01M16 12h.01M21 12c0 4.418-4.03 8-9 8a9.863 9.863 0 01-4.255-.949L3 20l1.395-3.72C3.512 15.042 3 13.574 3 12c0-4.418 4.03-8 9-8s9 3.582 9 8z" />
          </svg>
        </div>
        <h3 className="text-base font-bold text-surface-300 mb-1">Выберите диалог</h3>
        <p className="text-xs text-surface-500 max-w-sm">
          Выберите переписку из списка слева для просмотра сообщений или ответа клиенту.
        </p>
      </div>
    );
  }

  const handleSend = async () => {
    const text = inputText.trim();
    if (!text || isSending) return;
    setIsSending(true);
    setSendError(null);
    const replyId = replyingTo?.conversation_message_id || replyingTo?.id;
    try {
      await onSendMessage(text, replyId);
      setInputText('');
      setReplyingTo(null);
      if (textareaRef.current) {
        textareaRef.current.style.height = 'auto';
      }
    } catch (err: any) {
      setSendError(err?.message || 'Не удалось отправить сообщение');
    } finally {
      setIsSending(false);
    }
  };

  const handleKeyDown = (e: React.KeyboardEvent<HTMLTextAreaElement>) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      handleSend();
    }
  };

  const handleFileChange = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    e.target.value = '';
    if (!file) return;
    if (!file.type.startsWith('image/')) {
      setSendError('Можно прикреплять только изображения.');
      return;
    }
    if (file.size > 25 * 1024 * 1024) {
      setSendError('Размер изображения превышает 25 МБ.');
      return;
    }
    setIsUploading(true);
    setSendError(null);
    try {
      await onUploadImage(file);
    } catch (err: any) {
      setSendError(err?.message || 'Не удалось загрузить изображение');
    } finally {
      setIsUploading(false);
    }
  };

  const handleTextChange = (e: React.ChangeEvent<HTMLTextAreaElement>) => {
    setInputText(e.target.value);
    if (textareaRef.current) {
      textareaRef.current.style.height = 'auto';
      textareaRef.current.style.height = `${Math.min(textareaRef.current.scrollHeight, 128)}px`;
    }
  };

  const handleApplyTemplate = (tmpl: QuickTemplate) => {
    setInputText((prev) => (prev ? `${prev} ${tmpl.text}` : tmpl.text));
    textareaRef.current?.focus();
  };

  const user = conversation.user;

  return (
    <div className="flex-1 flex flex-col bg-surface-950 overflow-hidden relative">
      {/* Шапка чата */}
      <div className="h-14 bg-surface-900 border-b border-surface-800 px-4 flex items-center justify-between shrink-0 select-none">
        <div
          onClick={() => setShowProfileModal(true)}
          className="flex items-center gap-3 cursor-pointer group"
          title="Открыть профиль пользователя"
        >
          <div className="relative">
            <img
              src={user.photo_100 || 'https://vk.com/images/camera_100.png'}
              alt={user.first_name}
              className="w-10 h-10 rounded-full object-cover border border-surface-700 group-hover:border-accent transition-colors"
            />
            {user.online ? (
              <span className="absolute bottom-0 right-0 w-2.5 h-2.5 bg-emerald-500 border-2 border-surface-900 rounded-full" />
            ) : null}
          </div>
          <div>
            <div className="text-xs font-bold text-white group-hover:text-accent transition-colors flex items-center gap-1.5">
              <span>{user.first_name} {user.last_name}</span>
              <svg className="w-3.5 h-3.5 text-surface-500 opacity-0 group-hover:opacity-100 transition-opacity" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5l7 7-7 7" />
              </svg>
            </div>
            <div className="text-[11px] text-surface-400">
              {user.online ? <span className="text-emerald-400 font-medium">Онлайн</span> : 'Был в сети недавно'}
            </div>
          </div>
        </div>

        {/* Действия в шапке */}
        <div className="flex items-center gap-2">
          <button
            onClick={() => window.scmAPI?.openExternal?.(`https://vk.com/${user.screen_name || `id${user.id}`}`)}
            className="p-2 text-surface-400 hover:text-white rounded-lg hover:bg-surface-800 transition-colors"
            title="Открыть страницу VK"
          >
            <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M10 6H6a2 2 0 00-2 2v10a2 2 0 002 2h10a2 2 0 002-2v-4M14 4h6m0 0v6m0-6L10 14" />
            </svg>
          </button>
          <button
            onClick={() => {
              if (window.confirm('Удалить эту переписку от имени сообщества?')) {
                onDeleteConversation(conversation.peerId);
              }
            }}
            className="p-2 text-surface-400 hover:text-rose-400 rounded-lg hover:bg-surface-800 transition-colors"
            title="Удалить переписку"
          >
            <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" />
            </svg>
          </button>
        </div>
      </div>

      {/* Список сообщений */}
      <div ref={listRef} onScroll={handleListScroll} className="flex-1 overflow-y-auto p-4 space-y-3">
        {isLoading && messages.length === 0 ? (
          <div className="flex items-center justify-center h-full text-xs text-surface-500">
            Загрузка сообщений...
          </div>
        ) : messages.length === 0 ? (
          <div className="flex items-center justify-center h-full text-xs text-surface-500">
            Сообщений пока нет. Начните диалог!
          </div>
        ) : (
          messages.map((m) => {
            const isOut = m.out === 1;
            const cmid = m.conversation_message_id || m.id;
            const isHovered = hoveredMessageCmid === cmid;

            return (
              <div
                key={m.id || cmid}
                onMouseEnter={() => setHoveredMessageCmid(cmid)}
                onMouseLeave={() => setHoveredMessageCmid(null)}
                className={`flex flex-col ${isOut ? 'items-end' : 'items-start'} group relative`}
              >
                {/* Быстрое меню реакций и ответа при наведении */}
                {isHovered && (
                  <div
                    className={`absolute -top-7 ${
                      isOut ? 'right-0' : 'left-0'
                    } z-20 bg-surface-900 border border-surface-700 px-2 py-1 rounded-xl shadow-xl flex items-center gap-1.5 animate-fadeIn`}
                  >
                    {QUICK_REACTIONS.slice(0, 5).map((r) => (
                      <button
                        key={r.id}
                        onClick={() => onSendReaction(cmid, r.id)}
                        className="hover:scale-125 transition-transform text-sm p-0.5"
                        title={r.emoji}
                      >
                        {r.emoji}
                      </button>
                    ))}
                    <div className="w-px h-3.5 bg-surface-800 mx-0.5" />
                    <button
                      onClick={() => setReplyingTo(m)}
                      className="text-surface-400 hover:text-white p-0.5"
                      title="Ответить на сообщение"
                    >
                      <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M3 10h10a8 8 0 018 8v2M3 10l6 6m-6-6l6-6" />
                      </svg>
                    </button>
                  </div>
                )}

                {/* Пузырь сообщения */}
                <div
                  className={`max-w-[78%] rounded-2xl p-3 text-xs relative shadow-sm ${
                    isOut
                      ? 'bg-accent text-white rounded-br-xs'
                      : 'bg-surface-850 text-surface-200 border border-surface-750 rounded-bl-xs'
                  }`}
                >
                  {/* Пересланное / ответное сообщение */}
                  {m.reply_message && (
                    <div className={`mb-2 pl-2.5 border-l-2 py-0.5 text-[11px] rounded-r ${
                      isOut ? 'border-white/60 bg-white/10 text-white/90' : 'border-accent bg-surface-900/60 text-surface-300'
                    }`}>
                      <div className="font-semibold">{m.reply_message.from_id === user.id ? user.first_name : 'Сообщество'}</div>
                      <div className="truncate">{m.reply_message.text || '[Вложение]'}</div>
                    </div>
                  )}

                  {/* Текст сообщения */}
                  {m.text && <FormattedText text={m.text} />}

                  {/* Вложения */}
                  {m.attachments?.map((att, attIdx) => {
                    if (att.type === 'photo' && att.photo?.sizes?.length) {
                      const maxImg = att.photo.sizes[att.photo.sizes.length - 1].url;
                      return (
                        <div key={attIdx} className="mt-2 rounded-xl overflow-hidden cursor-pointer" onClick={() => setActiveMediaUrl(maxImg)}>
                          <img src={maxImg} alt="Photo" className="max-h-60 rounded-xl object-contain hover:opacity-95 transition-opacity" />
                        </div>
                      );
                    }
                    if (att.type === 'audio_message' && att.audio_message && (att.audio_message.link_mp3 || att.audio_message.link_ogg)) {
                      return (
                        <AudioPlayer
                          key={attIdx}
                          src={(att.audio_message.link_mp3 || att.audio_message.link_ogg)!}
                          duration={att.audio_message.duration}
                          waveform={att.audio_message.waveform}
                        />
                      );
                    }
                    if (att.type === 'sticker' && att.sticker) {
                      return (
                        <img
                          key={attIdx}
                          src={att.sticker.image_url}
                          alt="Sticker"
                          className="w-28 h-28 object-contain my-1"
                        />
                      );
                    }
                    if (att.type === 'doc' && att.doc) {
                      return (
                        <div
                          key={attIdx}
                          onClick={() => window.scmAPI?.openExternal?.(att.doc!.url)}
                          className={`mt-2 flex items-center gap-2 p-2 rounded-xl border cursor-pointer ${
                            isOut ? 'border-white/20 bg-white/10 text-white' : 'border-surface-700 bg-surface-900 text-surface-300'
                          }`}
                        >
                          <svg className="w-5 h-5 shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
                          </svg>
                          <div className="min-w-0">
                            <div className="font-semibold truncate text-[11px]">{att.doc.title}</div>
                            <div className="text-[10px] opacity-70">
                              {att.doc.size ? `${(att.doc.size / 1024 / 1024).toFixed(1)} МБ` : ''}
                            </div>
                          </div>
                        </div>
                      );
                    }
                    return null;
                  })}

                  {/* Реакции под сообщением */}
                  {m.reactions && m.reactions.length > 0 && (
                    <div className="flex flex-wrap gap-1 mt-2">
                      {m.reactions.map((r, rIdx) => {
                        const q = QUICK_REACTIONS.find((qr) => qr.id === r.reaction_id);
                        return (
                          <span
                            key={rIdx}
                            onClick={() => onSendReaction(cmid, r.reaction_id)}
                            className="inline-flex items-center gap-1 px-1.5 py-0.5 rounded-full bg-surface-900/80 border border-surface-700 text-[11px] cursor-pointer hover:scale-105 transition-transform"
                          >
                            <span>{q?.emoji || '👍'}</span>
                            <span className="font-semibold text-surface-300">{r.count}</span>
                          </span>
                        );
                      })}
                    </div>
                  )}

                  {/* Время отправки */}
                  <div className={`text-[10px] font-mono mt-1 text-right ${isOut ? 'text-white/70' : 'text-surface-500'}`}>
                    {new Date(m.date * 1000).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
                  </div>
                </div>
              </div>
            );
          })
        )}
        <div ref={messagesEndRef} />
      </div>

      {/* Быстрые шаблоны над полем ввода */}
      {templates && templates.length > 0 && (
        <div className="px-4 py-1.5 bg-surface-900 border-t border-surface-800 flex items-center gap-2 overflow-x-auto select-none">
          <span className="text-[10px] font-semibold text-surface-500 uppercase tracking-wider shrink-0">Шаблоны:</span>
          {templates.slice(0, 6).map((t) => (
            <button
              key={t.id}
              onClick={() => handleApplyTemplate(t)}
              className="px-2.5 py-1 rounded-lg bg-surface-800 hover:bg-surface-700 border border-surface-700 text-surface-300 hover:text-white text-[11px] font-medium whitespace-nowrap transition-colors"
            >
              {t.title}
            </button>
          ))}
          <button
            onClick={onOpenTemplatesModal}
            className="p-1 text-surface-500 hover:text-accent transition-colors"
            title="Все шаблоны"
          >
            <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 4v16m8-8H4" />
            </svg>
          </button>
        </div>
      )}

      {/* Панель ответа на сообщение */}
      {replyingTo && (
        <div className="px-4 py-2 bg-surface-900 border-t border-surface-800 flex items-center justify-between text-xs text-surface-300">
          <div className="flex items-center gap-2 truncate">
            <svg className="w-4 h-4 text-accent shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M3 10h10a8 8 0 018 8v2M3 10l6 6m-6-6l6-6" />
            </svg>
            <div className="truncate">
              <span className="font-semibold text-white">Ответ для {replyingTo.from_id === user.id ? user.first_name : 'сообщения'}:</span>{' '}
              <span className="text-surface-400 truncate">{replyingTo.text || '[Вложение]'}</span>
            </div>
          </div>
          <button onClick={() => setReplyingTo(null)} className="p-1 hover:text-white text-surface-500">
            <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
            </svg>
          </button>
        </div>
      )}

      {/* Ошибка отправки */}
      {sendError && (
        <div className="mx-3 mt-2 p-2 rounded-xl bg-rose-500/15 border border-rose-500/30 text-rose-300 text-xs flex items-center justify-between animate-fadeIn">
          <span>{sendError}</span>
          <button onClick={() => setSendError(null)} className="text-rose-400 hover:text-white ml-2 text-sm font-bold">✕</button>
        </div>
      )}

      {/* Поле ввода сообщения */}
      <div className="p-3 bg-surface-900 border-t border-surface-800 flex items-end gap-2 relative">
        {/* Кнопка вложений */}
        <input
          type="file"
          ref={fileInputRef}
          onChange={handleFileChange}
          accept="image/*"
          className="hidden"
        />
        <button
          onClick={() => fileInputRef.current?.click()}
          disabled={isUploading}
          className="p-2.5 text-surface-400 hover:text-white rounded-xl hover:bg-surface-800 transition-colors disabled:opacity-40"
          title={isUploading ? 'Загрузка изображения...' : 'Прикрепить изображение'}
        >
          {isUploading ? (
            <span className="w-5 h-5 flex items-center justify-center text-accent animate-pulse text-xs font-bold">...</span>
          ) : (
            <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15.172 7l-6.586 6.586a2 2 0 102.828 2.828l6.414-6.586a4 4 0 00-5.656-5.656l-6.415 6.585a6 6 0 108.486 8.486L20.5 13" />
            </svg>
          )}
        </button>

        {/* Кнопка смайлов */}
        <button
          onClick={() => setShowEmojiPicker((prev) => !prev)}
          className="p-2.5 text-surface-400 hover:text-white rounded-xl hover:bg-surface-800 transition-colors"
          title="Эмодзи и стикеры"
        >
          <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M14.828 14.828a4 4 0 01-5.656 0M9 10h.01M15 10h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
          </svg>
        </button>

        {/* Текстовое поле */}
        <textarea
          ref={textareaRef}
          value={inputText}
          onChange={handleTextChange}
          onKeyDown={handleKeyDown}
          placeholder="Напишите ответ... (Enter для отправки, Shift+Enter для новой строки)"
          rows={1}
          className="flex-1 bg-surface-950 border border-surface-700/70 focus:border-accent rounded-xl px-3.5 py-2.5 text-xs text-white placeholder-surface-500 outline-none resize-none max-h-32 transition-colors font-sans leading-relaxed"
        />

        {/* Кнопка отправки */}
        <button
          onClick={handleSend}
          disabled={!inputText.trim() || isSending}
          className="p-2.5 bg-accent hover:bg-accent-hover text-white rounded-xl transition-all shadow-md active:scale-95 disabled:opacity-40 disabled:pointer-events-none"
          title="Отправить сообщение"
        >
          {isSending ? (
            <svg className="w-5 h-5 animate-spin" fill="none" viewBox="0 0 24 24">
              <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"></circle>
              <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8v8H4z"></path>
            </svg>
          ) : (
            <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 19l9 2-9-18-9 18 9-2zm0 0v-8" />
            </svg>
          )}
        </button>

        {/* Пикер эмодзи */}
        {showEmojiPicker && (
          <EmojiPicker
            onSelectEmoji={(em) => setInputText((prev) => prev + em)}
            onSelectSticker={onSendSticker}
            onClose={() => setShowEmojiPicker(false)}
          />
        )}
      </div>

      {/* Модалка профиля */}
      {showProfileModal && (
        <UserProfileModal
          userId={user.id}
          initialUser={user}
          onClose={() => setShowProfileModal(false)}
          onBanUser={async (id) => {
            await onBanUser(id);
            setShowProfileModal(false);
          }}
        />
      )}

      {/* Полноэкранный просмотр медиа */}
      {activeMediaUrl && (
        <div
          onClick={() => setActiveMediaUrl(null)}
          className="fixed inset-0 z-50 bg-black/90 backdrop-blur-md flex items-center justify-center p-4"
        >
          <img
            src={activeMediaUrl}
            alt="Preview"
            className="max-h-[90vh] max-w-[90vw] object-contain rounded-xl shadow-2xl"
          />
          <button
            onClick={() => setActiveMediaUrl(null)}
            className="absolute top-4 right-4 p-2 bg-surface-800 text-white rounded-full hover:bg-surface-700"
          >
            <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
            </svg>
          </button>
        </div>
      )}
    </div>
  );
};
