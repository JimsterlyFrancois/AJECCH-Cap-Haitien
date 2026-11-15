"use client";

import { useState } from "react";

const OFFICIAL_LOGO = "/ajecch-logo.webp";

export default function SiteLogo({
  logoUrl,
  variant = "header",
  label = "Emblème officiel de l’Association des Jeunes Chrétiens du Cap-Haïtien"
}: {
  logoUrl?: string | null;
  variant?: "header" | "footer";
  label?: string;
}) {
  // The institution's supplied logo is the canonical source. A CMS image is
  // only a fallback if the bundled repository asset cannot be loaded.
  const [src, setSrc] = useState(OFFICIAL_LOGO);

  return (
    <span className={`brand-mark brand-mark-image site-logo site-logo-${variant}`}>
      <img
        src={src}
        alt={label}
        width={200}
        height={200}
        decoding="async"
        fetchPriority="high"
        draggable={false}
        onError={() => {
          if (logoUrl && src !== logoUrl) setSrc(logoUrl);
        }}
      />
    </span>
  );
}
