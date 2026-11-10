"use client";
import { useEffect, useRef, useState } from "react";

export function BannerCarousel({ banners }: { banners: any[] }) {
  const [index, setIndex] = useState(0);
  const timer = useRef<number | null>(null);

  useEffect(() => {
    if (banners.length <= 1) return;
    timer.current = window.setInterval(() => {
      setIndex((i) => (i + 1) % banners.length);
    }, 4000);
    return () => {
      if (timer.current) window.clearInterval(timer.current);
    };
  }, [banners.length]);

  if (banners.length === 0) return null;

  const go = (i: number) => setIndex(((i % banners.length) + banners.length) % banners.length);

  return (
    <div className="relative overflow-hidden rounded-lg">
      <div
        className="flex transition-transform duration-500 ease-in-out"
        style={{ transform: `translateX(-${index * 100}%)` }}
      >
        {banners.map((b: any) => (
          <a key={b.id} href={b.redirectUrl || b.url || "#"} className="block min-w-full">
            <img src={b.imageUrl} alt="banner" className="w-full object-cover" />
          </a>
        ))}
      </div>
      {banners.length > 1 && (
        <>
          <button
            aria-label="Banner anterior"
            onClick={() => go(index - 1)}
            className="absolute left-2 top-1/2 -translate-y-1/2 rounded-full bg-black/40 px-3 py-1 text-white"
          >
            ‹
          </button>
          <button
            aria-label="Banner siguiente"
            onClick={() => go(index + 1)}
            className="absolute right-2 top-1/2 -translate-y-1/2 rounded-full bg-black/40 px-3 py-1 text-white"
          >
            ›
          </button>
          <div className="absolute bottom-2 left-1/2 flex -translate-x-1/2 gap-1.5">
            {banners.map((_: any, i: number) => (
              <button
                key={i}
                aria-label={`Banner ${i + 1}`}
                onClick={() => go(i)}
                className={`h-2 w-2 rounded-full ${i === index ? "bg-white" : "bg-white/50"}`}
              />
            ))}
          </div>
        </>
      )}
    </div>
  );
}
