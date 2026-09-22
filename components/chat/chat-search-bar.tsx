"use client";

import { Loader2, Search, X } from "lucide-react";
import { useEffect, useState } from "react";

export function ChatSearchBar({
  onSearch,
  onClear,
  isSearching
}: {
  onSearch: (query: string) => void;
  onClear: () => void;
  isSearching: boolean;
}) {
  const [query, setQuery] = useState("");
  const [debouncedQuery, setDebouncedQuery] = useState("");

  useEffect(() => {
    const timer = window.setTimeout(() => setDebouncedQuery(query), 300);
    return () => window.clearTimeout(timer);
  }, [query]);

  useEffect(() => {
    if (debouncedQuery.trim().length > 0) {
      onSearch(debouncedQuery.trim());
    } else if (debouncedQuery.trim().length === 0 && query.length === 0) {
      onClear();
    }
  }, [debouncedQuery, onSearch, onClear, query.length]);

  return (
    <div className="chat-search-bar border-b border-brand-line px-4 py-3 xl:px-3 xl:py-2">
      <div className="relative">
        <div className="pointer-events-none absolute inset-y-0 left-0 flex items-center pl-3">
          {isSearching ? <Loader2 className="h-5 w-5 animate-spin text-neutral-400" /> : <Search className="h-5 w-5 text-neutral-400" />}
        </div>
        <input
          type="text"
          value={query}
          onChange={(event) => setQuery(event.target.value)}
          placeholder="Buscar por nombre o telefono..."
          className="block w-full rounded-full border border-transparent bg-[#F4EEE7] py-2.5 pl-10 pr-10 text-sm placeholder-neutral-500 outline-none transition focus:border-[#E9D2C1] focus:bg-white focus:shadow-[0_0_0_4px_rgba(255,90,0,0.08)] xl:py-2 xl:pl-9 xl:pr-9 xl:text-[13px]"
        />
        {query.length > 0 ? (
          <button
            type="button"
            onClick={() => {
              setQuery("");
              setDebouncedQuery("");
              onClear();
            }}
            className="absolute inset-y-0 right-0 flex items-center pr-3 text-neutral-400 transition hover:text-neutral-600"
          >
            <X className="h-5 w-5" />
          </button>
        ) : null}
      </div>
    </div>
  );
}
