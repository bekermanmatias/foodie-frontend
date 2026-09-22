"use client";

import { ChevronLeft, ChevronRight, X } from "lucide-react";
import { useEffect, useRef, useState } from "react";

export function ChatTagFilter({
  availableTags,
  selectedTag,
  onTagSelect,
  chatCount
}: {
  availableTags: Array<{ name: string; color: string }>;
  selectedTag: string | null;
  onTagSelect: (tagName: string | null) => void;
  chatCount?: number;
}) {
  const scrollContainerRef = useRef<HTMLDivElement | null>(null);
  const [canScrollLeft, setCanScrollLeft] = useState(false);
  const [canScrollRight, setCanScrollRight] = useState(false);

  useEffect(() => {
    const checkScroll = () => {
      const node = scrollContainerRef.current;
      if (!node) return;
      setCanScrollLeft(node.scrollLeft > 0);
      setCanScrollRight(node.scrollLeft < node.scrollWidth - node.clientWidth - 1);
    };

    checkScroll();
    const node = scrollContainerRef.current;
    node?.addEventListener("scroll", checkScroll);
    window.addEventListener("resize", checkScroll);
    return () => {
      node?.removeEventListener("scroll", checkScroll);
      window.removeEventListener("resize", checkScroll);
    };
  }, [availableTags]);

  return (
    <div className="chat-tag-filter border-b border-brand-line px-4 py-3 xl:px-3 xl:py-2">
      <div className="mb-2 flex items-center gap-2 xl:mb-1">
        <span className="text-[11px] font-semibold uppercase tracking-[0.18em] text-neutral-500">Filtrar por</span>
        {chatCount !== undefined ? <span className="text-xs text-neutral-500">({chatCount} chats)</span> : null}
      </div>
      <div className="relative">
        {canScrollLeft ? (
          <button
            type="button"
            onClick={() => scrollContainerRef.current?.scrollBy({ left: -200, behavior: "smooth" })}
            className="absolute left-0 top-1/2 z-10 -translate-y-1/2 rounded-full border border-[#E5D8CB] bg-[#FFFDFC] p-1.5 text-brand-ink"
          >
            <ChevronLeft className="h-4 w-4 text-brand-ink" />
          </button>
        ) : null}
        <div ref={scrollContainerRef} className="flex gap-2 overflow-x-auto px-2 pb-2 xl:gap-1.5 xl:pb-1">
          <button
            type="button"
            onClick={() => onTagSelect(null)}
            className={`shrink-0 rounded-full px-3 py-1.5 text-sm font-medium transition xl:px-2.5 xl:py-1 xl:text-[13px] ${selectedTag === null ? "bg-brand-orange text-white" : "bg-[#F4EEE7] text-brand-ink hover:bg-[#EEE4DA]"}`}
          >
            Todas
          </button>
          {availableTags.map((tag) => (
            <button
              key={tag.name}
              type="button"
              onClick={() => onTagSelect(tag.name)}
              className="shrink-0 rounded-full px-3 py-1.5 text-sm font-medium transition xl:px-2.5 xl:py-1 xl:text-[13px]"
              style={{
                backgroundColor: selectedTag === tag.name ? tag.color : `${tag.color}22`,
                color: selectedTag === tag.name ? "#ffffff" : tag.color
              }}
            >
              <span className="inline-flex items-center gap-1.5">
                {tag.name}
                {selectedTag === tag.name ? <X className="h-3 w-3" /> : null}
              </span>
            </button>
          ))}
        </div>
        {canScrollRight ? (
          <button
            type="button"
            onClick={() => scrollContainerRef.current?.scrollBy({ left: 200, behavior: "smooth" })}
            className="absolute right-0 top-1/2 z-10 -translate-y-1/2 rounded-full border border-[#E5D8CB] bg-[#FFFDFC] p-1.5 text-brand-ink"
          >
            <ChevronRight className="h-4 w-4 text-brand-ink" />
          </button>
        ) : null}
      </div>
    </div>
  );
}
