type Props = {
  size?: number;
  color?: string;
  ariaLabel?: string;
  variant?: 'auto' | 'close';
  onClick?: () => void;
};

export default function CircleButton({ size = 22, color = 'currentColor', ariaLabel, variant = 'auto', onClick }: Props) {
  return (
    <button className="circle-button" aria-label={ariaLabel} type="button" style={{ color }} onClick={onClick}>
      <svg className="circle-svg" width={size} height={size} viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg" aria-hidden>
        {variant === 'auto' && (
          <>
            <g className="icon-plus" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round">
              <path d="M12 6v12" />
              <path d="M6 12h12" />
            </g>
            <g className="icon-minus" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round">
              <path d="M6 12h12" />
            </g>
          </>
        )}
        {variant === 'close' && (
          <g className="icon-close" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round">
            <path d="M7.5 7.5l9 9" />
            <path d="M16.5 7.5l-9 9" />
          </g>
        )}
      </svg>
    </button>
  );
}
