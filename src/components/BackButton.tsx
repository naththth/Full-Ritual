import { useApp } from '../store/useStore';

export function BackButton({ onClick }: { onClick?: () => void }) {
  const goBack = useApp((s) => s.goBack);

  return (
    <button className="screen-back-button" onClick={onClick ?? goBack} aria-label="voltar">
      <svg
        aria-hidden
        className="screen-back-button__glyph"
        viewBox="0 0 24 24"
        fill="none"
      >
        <path d="M14.5 7.25 9.75 12l4.75 4.75" />
        <path d="M10.25 12h8" />
        <path d="M7.25 7.75c-1.5 1.15-2.35 2.6-2.35 4.25s.85 3.1 2.35 4.25" />
      </svg>
    </button>
  );
}
