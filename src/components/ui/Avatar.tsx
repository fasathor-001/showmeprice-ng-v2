import Image from "next/image";

interface AvatarProps {
  src?: string | null;
  alt: string;
  initials: string;
  size?: "sm" | "md" | "lg" | "xl";
  className?: string;
}

const sizeStyles = {
  sm: { box: "w-8 h-8 text-xs", img: 32 },
  md: { box: "w-10 h-10 text-sm", img: 40 },
  lg: { box: "w-12 h-12 text-base", img: 48 },
  // E.2.18.0 / D-142: shop-page header avatar. Responsive — 64px on
  // mobile, 80px on sm+. The Next/Image width of 80 fetches the full
  // resolution; Tailwind controls display size only.
  xl: { box: "w-16 h-16 sm:w-20 sm:h-20 text-xl", img: 80 },
};

export function Avatar({ src, alt, initials, size = "md", className = "" }: AvatarProps) {
  const s = sizeStyles[size];

  if (src) {
    return (
      <Image
        src={src}
        alt={alt}
        width={s.img}
        height={s.img}
        className={`${s.box} rounded-full object-cover ${className}`}
      />
    );
  }

  return (
    <div
      role="img"
      aria-label={alt}
      className={`${s.box} rounded-full bg-teal-50 text-teal-900 font-medium flex items-center justify-center ${className}`}
    >
      {initials.slice(0, 2).toUpperCase()}
    </div>
  );
}
