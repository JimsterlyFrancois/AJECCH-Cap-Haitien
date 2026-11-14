"use client";

import { useEffect, useState } from "react";

const FALLBACK_LOGO = "/ajecch-logo.webp";

export default function SiteLogo({
  logoUrl,
  label = "Logo officiel de l’AJECCH"
}: {
  logoUrl?: string | null;
  label?: string;
}) {
  const [src, setSrc] = useState(logoUrl || FALLBACK_LOGO);

  useEffect(() => {
    setSrc(logoUrl || FALLBACK_LOGO);
  }, [logoUrl]);

  return (
    <span className="brand-mark brand-mark-image">
      <img
        src={src}
        alt={label}
        width={56}
        height={56}
        decoding="async"
        fetchPriority="high"
        draggable={false}
        onError={() => {
          if (src !== FALLBACK_LOGO) setSrc(FALLBACK_LOGO);
        }}
      />
    </span>
  );
}
