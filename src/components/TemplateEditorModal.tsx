import React, { useState } from 'react';
import { QuickTemplate } from '../types/scm';

interface TemplateEditorModalProps {
  isOpen: boolean;
  onClose: () => void;
  templates: QuickTemplate[];
  onSaveTemplates: (updated: QuickTemplate[]) => void;
}

export const TemplateEditorModal: React.FC<TemplateEditorModalProps> = ({
  isOpen,
  onClose,
  templates,
  onSaveTemplates,
}) => {
  const [list, setList] = useState<QuickTemplate[]>(templates);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editTitle, setEditTitle] = useState('');
  const [editText, setEditText] = useState('');
  const [editCategory, setEditCategory] = useState<QuickTemplate['category']>('custom');

  if (!isOpen) return null;

  const handleStartEdit = (t: QuickTemplate) => {
    setEditingId(t.id);
    setEditTitle(t.title);
    setEditText(t.text);
    setEditCategory(t.category);
  };

  const handleCreateNew = () => {
    const newTmpl: QuickTemplate = {
      id: `custom_${Date.now()}`,
      title: 'Новый быстрый ответ',
      category: 'custom',
      text: 'Здравствуйте! ',
    };
    const updated = [...list, newTmpl];
    setList(updated);
    handleStartEdit(newTmpl);
  };

  const handleSaveEdit = () => {
    if (!editingId) return;
    const updated = list.map((t) =>
      t.id === editingId
        ? { ...t, title: editTitle.trim() || 'Без названия', text: editText, category: editCategory }
        : t
    );
    setList(updated);
    setEditingId(null);
    onSaveTemplates(updated);
    if (window.scmAPI) {
      window.scmAPI.saveTemplates(updated).catch(console.error);
    }
  };

  const handleDelete = (id: string) => {
    const updated = list.filter((t) => t.id !== id);
    setList(updated);
    if (editingId === id) setEditingId(null);
    onSaveTemplates(updated);
    if (window.scmAPI) {
      window.scmAPI.saveTemplates(updated).catch(console.error);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/75 backdrop-blur-sm p-4 animate-fadeIn">
      <div className="bg-surface-900 border border-surface-700 w-full max-w-2xl rounded-2xl p-6 shadow-2xl relative flex flex-col max-h-[88vh]">
        {/* Шапка */}
        <div className="flex items-center justify-between pb-4 mb-4 border-b border-surface-800">
          <div className="flex items-center gap-2.5">
            <div className="w-8 h-8 rounded-lg bg-surface-800 border border-surface-700 flex items-center justify-center text-accent">
              <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8 10h.01M12 10h.01M16 10h.01M9 16H5a2 2 0 01-2-2V6a2 2 0 012-2h14a2 2 0 012 2v8a2 2 0 01-2 2h-5l-5 5v-5z" />
              </svg>
            </div>
            <h3 className="text-lg font-bold text-white">Быстрые шаблоны ответов</h3>
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

        <div className="flex-1 overflow-hidden flex gap-4">
          {/* Список шаблонов */}
          <div className="w-1/2 overflow-y-auto space-y-2 pr-1">
            <button
              onClick={handleCreateNew}
              className="w-full py-2 px-3 rounded-xl border border-dashed border-surface-600 hover:border-accent text-surface-400 hover:text-accent text-xs font-semibold flex items-center justify-center gap-1.5 transition-colors mb-2"
            >
              <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 4v16m8-8H4" />
              </svg>
              <span>Создать шаблон</span>
            </button>

            {list.map((t) => (
              <div
                key={t.id}
                onClick={() => handleStartEdit(t)}
                className={`p-3 rounded-xl border text-left cursor-pointer transition-all ${
                  editingId === t.id
                    ? 'bg-accent-subtle border-accent'
                    : 'bg-surface-850 border-surface-700/60 hover:border-surface-600'
                }`}
              >
                <div className="flex items-center justify-between mb-1">
                  <span className="font-semibold text-xs text-white truncate max-w-[170px]">{t.title}</span>
                  <button
                    onClick={(e) => {
                      e.stopPropagation();
                      handleDelete(t.id);
                    }}
                    className="text-surface-500 hover:text-rose-400 p-0.5"
                    title="Удалить"
                  >
                    <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" />
                    </svg>
                  </button>
                </div>
                <p className="text-[11px] text-surface-400 line-clamp-2 leading-relaxed">{t.text}</p>
              </div>
            ))}
          </div>

          {/* Редактор выбранного шаблона */}
          <div className="w-1/2 bg-surface-850 rounded-xl border border-surface-800 p-4 flex flex-col justify-between">
            {editingId ? (
              <div className="space-y-3 flex-1 flex flex-col">
                <div>
                  <label className="block text-[11px] font-semibold text-surface-400 mb-1">Заголовок</label>
                  <input
                    type="text"
                    value={editTitle}
                    onChange={(e) => setEditTitle(e.target.value)}
                    className="w-full bg-surface-900 border border-surface-700 rounded-lg px-2.5 py-1.5 text-xs text-white outline-none focus:border-accent"
                  />
                </div>
                <div>
                  <label className="block text-[11px] font-semibold text-surface-400 mb-1">Категория</label>
                  <select
                    value={editCategory}
                    onChange={(e) => setEditCategory(e.target.value as any)}
                    className="w-full bg-surface-900 border border-surface-700 rounded-lg px-2.5 py-1.5 text-xs text-white outline-none focus:border-accent"
                  >
                    <option value="welcome">Приветствие</option>
                    <option value="hours">Режим работы</option>
                    <option value="order">Заказ / Оформление</option>
                    <option value="faq">Частые вопросы (FAQ)</option>
                    <option value="custom">Пользовательский</option>
                  </select>
                </div>
                <div className="flex-1 flex flex-col">
                  <label className="block text-[11px] font-semibold text-surface-400 mb-1">Текст шаблона</label>
                  <textarea
                    value={editText}
                    onChange={(e) => setEditText(e.target.value)}
                    className="w-full flex-1 bg-surface-900 border border-surface-700 rounded-lg p-2.5 text-xs text-white outline-none focus:border-accent resize-none font-sans leading-relaxed"
                  />
                </div>
                <button
                  onClick={handleSaveEdit}
                  className="w-full py-2 bg-accent hover:bg-accent-hover text-white text-xs font-semibold rounded-lg shadow transition-colors"
                >
                  Применить изменения
                </button>
              </div>
            ) : (
              <div className="flex-1 flex items-center justify-center text-center text-xs text-surface-500">
                Выберите шаблон слева для редактирования или создайте новый
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
};
