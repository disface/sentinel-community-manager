import React from 'react';

interface FormattedTextProps {
  text: string;
}

export const FormattedText: React.FC<FormattedTextProps> = ({ text }) => {
  if (!text) return null;

  const urlRegex = /(https?:\/\/[^\s]+|vk\.com\/[^\s]+)/gi;
  const parts = text.split(urlRegex);

  return (
    <span className="whitespace-pre-wrap select-text leading-relaxed">
      {parts.map((part, index) => {
        if (part.match(urlRegex)) {
          const url = part.startsWith('http') ? part : `https://${part}`;
          return (
            <a
              key={index}
              href={url}
              onClick={(e) => {
                e.preventDefault();
                window.scmAPI?.openExternal?.(url);
              }}
              className="text-accent hover:underline font-medium cursor-pointer transition-colors break-all"
              title={`Открыть ссылку: ${url}`}
            >
              {part}
            </a>
          );
        }
        return <span key={index}>{part}</span>;
      })}
    </span>
  );
};
