import { useState } from 'react';

interface BookThumbProps {
  src?: string | null;
  title: string;
  size?: 'sm' | 'md' | 'lg';
}

export function BookThumb({ src, title, size = 'md' }: BookThumbProps) {
  const [failed, setFailed] = useState(false);
  const initials = title
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, 2)
    .map((part) => part[0])
    .join('')
    .toUpperCase() || 'FR';

  return (
    <span className={`book-thumb book-thumb--${size}`} aria-hidden="true">
      {src && !failed ? (
        <img src={src} alt="" loading="lazy" onError={() => setFailed(true)} />
      ) : (
        <span>{initials}</span>
      )}
    </span>
  );
}
