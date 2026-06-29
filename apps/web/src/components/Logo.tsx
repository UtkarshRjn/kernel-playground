export function Logo({ size = 28 }: { size?: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 32 32" fill="none" aria-hidden>
      <rect width="32" height="32" rx="8" fill="url(#kp-g)" />
      {/* stylized kernel grid / chip */}
      <rect x="9" y="9" width="5" height="5" rx="1.2" fill="#fff" opacity="0.95" />
      <rect x="18" y="9" width="5" height="5" rx="1.2" fill="#fff" opacity="0.6" />
      <rect x="9" y="18" width="5" height="5" rx="1.2" fill="#fff" opacity="0.6" />
      <rect x="18" y="18" width="5" height="5" rx="1.2" fill="#fff" opacity="0.95" />
      <defs>
        <linearGradient id="kp-g" x1="0" y1="0" x2="32" y2="32" gradientUnits="userSpaceOnUse">
          <stop stopColor="#635bff" />
          <stop offset="1" stopColor="#8b6bff" />
        </linearGradient>
      </defs>
    </svg>
  );
}
