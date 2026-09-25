"use client";

import { ArrowLeft, CheckCircle2, ChevronLeft, ChevronRight, Loader2, Minus, Plus } from "lucide-react";
import { FaInstagram, FaMapMarkerAlt, FaPhoneAlt, FaUtensils, FaWhatsapp } from "react-icons/fa";
import { useEffect, useMemo, useState } from "react";
import { cn } from "../lib/cn";

const API_URL = process.env.NEXT_PUBLIC_API_URL || "http://localhost:4000/v1";

type publicThemeKey = "classic" | "campo" | "bistro";
type Profile = { name: string; logoUrl?: string | null; coverImageUrl?: string | null; whatsappPhone?: string | null; accentColor: string; publicTheme?: publicThemeKey | null; minPartySize: number; maxPartySize: number; largePartyThreshold?: number | null; commentsEnabled?: boolean; publicInfo?: { phone?: string | null; menuUrl?: string | null; instagramUrl?: string | null; mapsUrl?: string | null }; supportedFeatures: string[]; branches: Array<{ slug: string; name: string }> };
type Slot = { time: string };
type Confirmation = { code: string; branch: string; date: string; time: string; partySize: number };

type BookingTheme = {
  key: publicThemeKey;
  label: string;
  defaultAccent: string;
  page: string;
  overlay: string;
  card: string;
  watermark: boolean;
  logo: string;
  ornament: boolean;
  header: string;
  eyebrow: string;
  title: string;
  badge: string;
  progressTrack: string;
  headingTitle: string;
  headingText: string;
  option: string;
  optionActive: string;
  optionIdle: string;
  optionActiveText: string;
  accentOutline: boolean;
  softAlpha: number;
  autoContrast: boolean;
  input: string;
  fieldLabel: string;
  whatsapp: string;
  whatsappLink: string;
  whatsappHint: string;
  panel: string;
  counterLabel: string;
  control: string;
  slot: string;
  slotActive: string;
  slotIdle: string;
  slotActiveText: string;
  notice: string;
  noticeTitle: string;
  noticeText: string;
  summary: string;
  muted: string;
  confirmTitle: string;
  chip: string;
  calendarNav: string;
  calendarMonth: string;
  calendarWeekdays: string;
  calendarDay: string;
  calendarDayEnabled: string;
  calendarDayDisabled: string;
  ghost: string;
  primary: string;
  error: string;
};

const THEMES: Record<publicThemeKey, BookingTheme> = {
  classic: {
    key: "classic", label: "Actual", defaultAccent: "#FF5A00",
    page: "flex min-h-screen items-center justify-center bg-brand-ink p-3 sm:p-10",
    overlay: "linear-gradient(rgba(0,0,0,.38),rgba(0,0,0,.38))",
    card: "w-full max-w-2xl rounded-[34px] border border-white/60 bg-white/90 shadow-[0_28px_80px_rgba(0,0,0,.32)] backdrop-blur-md sm:min-h-[600px]",
    watermark: false, logo: "mx-auto h-20 w-auto pt-7 object-contain", ornament: false,
    header: "mb-7",
    eyebrow: "text-xs font-bold uppercase tracking-[.24em]",
    title: "mt-2 text-3xl font-extrabold tracking-[-.05em] text-brand-ink",
    badge: "rounded-full bg-[#FFF4ED] px-3 py-2 text-xs font-bold",
    progressTrack: "mt-6 h-2 rounded-full bg-brand-cloud",
    headingTitle: "text-2xl font-extrabold tracking-[-.04em] text-brand-ink",
    headingText: "mt-2 text-sm text-neutral-500",
    option: "rounded-[22px] border p-4 text-left font-bold",
    optionActive: "border-brand-orange bg-[#FFF4ED]", optionIdle: "border-brand-line bg-white", optionActiveText: "",
    accentOutline: false, softAlpha: 0, autoContrast: false,
    input: "foodie-input",
    fieldLabel: "block space-y-2 text-sm font-bold text-brand-ink",
    whatsapp: "group flex items-center gap-3 rounded-[22px] border border-[#25D366]/30 bg-[#EEF9F1] px-5 py-3 text-[#187A3E] transition hover:border-[#25D366]/60 hover:bg-[#E2F6E8] focus:outline-none focus:ring-4 focus:ring-[#25D366]/20",
    whatsappLink: "mt-5 flex items-center justify-center gap-2 rounded-full border border-[#25D366]/30 bg-[#EEF9F1] px-5 py-3 text-sm font-bold text-[#187A3E] transition hover:border-[#25D366]/60 hover:bg-[#E2F6E8]",
    whatsappHint: "mt-1 block text-xs font-semibold text-[#31834E]",
    panel: "rounded-[24px] border border-brand-line bg-white p-4 text-brand-ink",
    counterLabel: "font-bold text-brand-ink",
    control: "rounded-full border border-brand-line p-2 text-brand-ink disabled:opacity-40",
    slot: "rounded-2xl border px-3 py-4 font-bold transition",
    slotActive: "border-brand-orange bg-[#FFF4ED]", slotIdle: "border-brand-line bg-white hover:border-brand-orange", slotActiveText: "",
    notice: "rounded-[22px] border border-brand-line bg-brand-cloud p-5",
    noticeTitle: "text-brand-ink", noticeText: "mt-2 text-sm text-neutral-500",
    summary: "mt-7 rounded-[24px] bg-brand-cloud p-5 text-left text-brand-ink",
    muted: "text-neutral-500",
    confirmTitle: "mt-5 text-3xl font-extrabold text-brand-ink",
    chip: "rounded-full border border-brand-line px-3 py-2",
    calendarNav: "rounded-full p-2 text-brand-ink",
    calendarMonth: "capitalize",
    calendarWeekdays: "mt-4 grid grid-cols-7 gap-1 text-center text-xs font-bold text-neutral-400",
    calendarDay: "h-10 rounded-xl text-sm font-bold",
    calendarDayEnabled: "text-brand-ink hover:bg-[#FFF4ED]",
    calendarDayDisabled: "cursor-not-allowed text-neutral-300",
    ghost: "rounded-full border border-brand-line px-5 py-3 font-bold",
    primary: "flex flex-1 items-center justify-center gap-2 rounded-full px-6 py-3 font-bold text-white disabled:opacity-60",
    error: "mt-5 rounded-2xl bg-red-50 p-4 text-sm font-semibold text-red-700"
  },
  campo: {
    key: "campo", label: "Campo", defaultAccent: "#7B2D26",
    page: "relative flex min-h-screen items-center justify-center overflow-hidden bg-[#F3EEE6] p-3 sm:p-10",
    overlay: "linear-gradient(rgba(243,238,230,.82),rgba(243,238,230,.9))",
    card: "booking-paper relative z-10 w-full max-w-2xl rounded-[6px] border border-[#D8C9B4] bg-[#FBF8F2] shadow-[0_24px_60px_rgba(90,64,38,.16)] sm:min-h-[600px]",
    watermark: true, logo: "mx-auto h-20 w-auto pt-8 object-contain", ornament: true,
    header: "mb-8",
    eyebrow: "text-[11px] font-semibold uppercase tracking-[.34em]",
    title: "mt-2 font-display text-4xl font-semibold tracking-[-.01em] text-[#3A2E24]",
    badge: "rounded-full border border-[#D8C9B4] px-3 py-1.5 text-[11px] font-semibold uppercase tracking-[.16em]",
    progressTrack: "mt-6 h-px w-full bg-[#D8C9B4]",
    headingTitle: "font-display text-3xl font-semibold text-[#3A2E24]",
    headingText: "mt-2 text-sm text-[#8B7B6B]",
    option: "rounded-[3px] border p-4 text-left font-semibold",
    optionActive: "", optionIdle: "border-[#D8C9B4] bg-transparent text-[#3A2E24] hover:border-[#B9A88F]", optionActiveText: "text-[#3A2E24]",
    accentOutline: true, softAlpha: 0.1, autoContrast: true,
    input: "w-full rounded-none border-0 border-b border-[#C9B9A2] bg-transparent px-1 py-3 font-display text-lg text-[#3A2E24] outline-none transition placeholder:text-[#B3A48F] focus:border-[#7B2D26]",
    fieldLabel: "block space-y-2 text-[11px] font-semibold uppercase tracking-[.18em] text-[#6B5B49]",
    whatsapp: "group flex items-center gap-3 rounded-[3px] border border-[#25D366]/30 bg-[#EEF9F1] px-5 py-3 text-[#187A3E] transition hover:border-[#25D366]/60 hover:bg-[#E2F6E8] focus:outline-none focus:ring-4 focus:ring-[#25D366]/20",
    whatsappLink: "mt-5 flex items-center justify-center gap-2 rounded-[3px] border border-[#25D366]/30 bg-[#EEF9F1] px-5 py-3 text-sm font-semibold text-[#187A3E] transition hover:border-[#25D366]/60 hover:bg-[#E2F6E8]",
    whatsappHint: "mt-1 block text-xs font-semibold text-[#31834E]",
    panel: "rounded-[3px] border border-[#D8C9B4] bg-[#FFFDF8] p-4 text-[#3A2E24]",
    counterLabel: "font-display text-lg font-semibold text-[#3A2E24]",
    control: "rounded-full border border-[#C9B9A2] p-2 text-[#6B5B49] disabled:opacity-40",
    slot: "rounded-[3px] border px-3 py-4 font-semibold",
    slotActive: "", slotIdle: "border-[#D8C9B4] bg-transparent text-[#3A2E24] hover:border-[#B9A88F]", slotActiveText: "text-[#3A2E24]",
    notice: "rounded-[3px] border border-[#D8C9B4] bg-[#F7F1E7] p-5",
    noticeTitle: "font-display text-lg font-semibold text-[#3A2E24]", noticeText: "mt-2 text-sm text-[#8B7B6B]",
    summary: "mt-7 rounded-[3px] border border-[#D8C9B4] bg-[#F7F1E7] p-5 text-left text-[#3A2E24]",
    muted: "text-[#8B7B6B]",
    confirmTitle: "mt-5 font-display text-3xl font-semibold text-[#3A2E24]",
    chip: "rounded-[3px] border border-[#D8C9B4] px-3 py-2",
    calendarNav: "rounded-full p-2 text-[#6B5B49] hover:bg-[#7B2D26]/10",
    calendarMonth: "font-display text-lg font-semibold capitalize text-[#3A2E24]",
    calendarWeekdays: "mt-4 grid grid-cols-7 gap-1 text-center text-[11px] font-semibold uppercase tracking-[.12em] text-[#A79782]",
    calendarDay: "h-10 rounded-[3px] font-display text-base font-semibold",
    calendarDayEnabled: "text-[#3A2E24] hover:bg-[#7B2D26]/10",
    calendarDayDisabled: "cursor-not-allowed text-[#C9B9A2]",
    ghost: "rounded-[3px] border border-[#C9B9A2] px-5 py-3 font-semibold text-[#6B5B49]",
    primary: "flex flex-1 items-center justify-center gap-2 rounded-[3px] px-6 py-3.5 text-sm font-semibold uppercase tracking-[.18em] disabled:opacity-60",
    error: "mt-5 rounded-[3px] border border-red-200 bg-red-50 p-4 text-sm font-semibold text-red-700"
  },
  bistro: {
    key: "bistro", label: "Bistró", defaultAccent: "#C9A227",
    page: "relative flex min-h-screen items-center justify-center overflow-hidden bg-[#141210] p-3 sm:p-10",
    overlay: "linear-gradient(rgba(20,18,16,.72),rgba(20,18,16,.86))",
    card: "relative z-10 w-full max-w-2xl rounded-[4px] border border-[#3A332A] bg-[#1E1B18] shadow-[0_30px_80px_rgba(0,0,0,.55)] sm:min-h-[600px]",
    watermark: true, logo: "mx-auto h-20 w-auto pt-8 object-contain", ornament: true,
    header: "mb-8",
    eyebrow: "text-[11px] font-semibold uppercase tracking-[.4em]",
    title: "mt-2 font-display text-4xl font-medium tracking-[-.01em] text-[#F4EFE6]",
    badge: "rounded-full border border-[#3A332A] px-3 py-1.5 text-[11px] font-semibold uppercase tracking-[.16em]",
    progressTrack: "mt-6 h-px w-full bg-[#3A332A]",
    headingTitle: "font-display text-3xl font-medium text-[#F4EFE6]",
    headingText: "mt-2 text-sm text-[#9A9085]",
    option: "rounded-[2px] border p-4 text-left font-semibold",
    optionActive: "", optionIdle: "border-[#3A332A] bg-[#25211C] text-[#E8E1D6] hover:border-[#C9A227]/50", optionActiveText: "text-[#F4EFE6]",
    accentOutline: true, softAlpha: 0.18, autoContrast: true,
    input: "w-full rounded-none border-0 border-b border-[#3A332A] bg-transparent px-1 py-3 text-lg text-[#F4EFE6] outline-none transition placeholder:text-[#6F665C] focus:border-[#C9A227]",
    fieldLabel: "block space-y-2 text-[11px] font-semibold uppercase tracking-[.18em] text-[#9A9085]",
    whatsapp: "group flex items-center gap-3 rounded-[2px] border border-[#25D366]/30 bg-[#12241A] px-5 py-3 text-[#7BD8A0] transition hover:border-[#25D366]/60 hover:bg-[#17301F] focus:outline-none focus:ring-4 focus:ring-[#25D366]/20",
    whatsappLink: "mt-5 flex items-center justify-center gap-2 rounded-[2px] border border-[#25D366]/30 bg-[#12241A] px-5 py-3 text-sm font-semibold text-[#7BD8A0] transition hover:border-[#25D366]/60 hover:bg-[#17301F]",
    whatsappHint: "mt-1 block text-xs font-semibold text-[#5FB37E]",
    panel: "rounded-[2px] border border-[#3A332A] bg-[#25211C] p-4 text-[#F4EFE6]",
    counterLabel: "font-display text-lg font-medium text-[#F4EFE6]",
    control: "rounded-full border border-[#3A332A] p-2 text-[#C9A227] disabled:opacity-40",
    slot: "rounded-[2px] border px-3 py-4 font-semibold",
    slotActive: "", slotIdle: "border-[#3A332A] bg-[#25211C] text-[#E8E1D6] hover:border-[#C9A227]/50", slotActiveText: "text-[#F4EFE6]",
    notice: "rounded-[2px] border border-[#3A332A] bg-[#25211C] p-5",
    noticeTitle: "font-display text-lg font-medium text-[#F4EFE6]", noticeText: "mt-2 text-sm text-[#9A9085]",
    summary: "mt-7 rounded-[2px] border border-[#3A332A] bg-[#25211C] p-5 text-left text-[#E8E1D6]",
    muted: "text-[#9A9085]",
    confirmTitle: "mt-5 font-display text-3xl font-medium text-[#F4EFE6]",
    chip: "rounded-[2px] border border-[#3A332A] px-3 py-2",
    calendarNav: "rounded-full p-2 text-[#C9A227] hover:bg-[#C9A227]/15",
    calendarMonth: "font-display text-lg font-medium capitalize text-[#F4EFE6]",
    calendarWeekdays: "mt-4 grid grid-cols-7 gap-1 text-center text-[11px] font-semibold uppercase tracking-[.12em] text-[#7A7166]",
    calendarDay: "h-10 rounded-[2px] font-display text-base font-medium",
    calendarDayEnabled: "text-[#E8E1D6] hover:bg-[#C9A227]/15",
    calendarDayDisabled: "cursor-not-allowed text-[#5A5248]",
    ghost: "rounded-[2px] border border-[#3A332A] px-5 py-3 font-semibold text-[#C9A227]",
    primary: "flex flex-1 items-center justify-center gap-2 rounded-[2px] px-6 py-3.5 text-sm font-semibold uppercase tracking-[.18em] disabled:opacity-60",
    error: "mt-5 rounded-[2px] border border-red-500/30 bg-red-500/10 p-4 text-sm font-semibold text-red-300"
  }
};

function softColor(hex: string, alpha: number) {
  const value = hex.replace("#", "");
  if (value.length !== 6) return hex;
  const red = parseInt(value.slice(0, 2), 16);
  const green = parseInt(value.slice(2, 4), 16);
  const blue = parseInt(value.slice(4, 6), 16);
  if ([red, green, blue].some((channel) => Number.isNaN(channel))) return hex;
  return `rgba(${red}, ${green}, ${blue}, ${alpha})`;
}

function contrastText(hex: string) {
  const value = hex.replace("#", "");
  if (value.length !== 6) return "#FFFFFF";
  const channels = [0, 2, 4].map((index) => parseInt(value.slice(index, index + 2), 16) / 255).map((channel) => (channel <= 0.03928 ? channel / 12.92 : ((channel + 0.055) / 1.055) ** 2.4));
  if (channels.some((channel) => Number.isNaN(channel))) return "#FFFFFF";
  const luminance = 0.2126 * channels[0] + 0.7152 * channels[1] + 0.0722 * channels[2];
  return luminance > 0.2 ? "#141210" : "#FFFFFF";
}

export function PublicBookingPage({ restaurantSlug }: { restaurantSlug: string }) {
  const [profile, setProfile] = useState<Profile | null>(null);
  const [step, setStep] = useState(1); const [branch, setBranch] = useState(""); const [partySize, setPartySize] = useState(2);
  const [date, setDate] = useState(""); const [time, setTime] = useState(""); const [slots, setSlots] = useState<Slot[]>([]);
  const [fullName, setFullName] = useState(""); const [phone, setPhone] = useState(""); const [notes, setNotes] = useState("");
  const [loading, setLoading] = useState(true); const [slotsLoading, setSlotsLoading] = useState(false); const [validating, setValidating] = useState(false); const [error, setError] = useState(""); const [confirmation, setConfirmation] = useState<Confirmation | null>(null);

  useEffect(() => {
    fetch(`${API_URL}/public/reservations/${restaurantSlug}`)
      .then(async (response) => { if (!response.ok) throw new Error(response.status === 409 ? "Las reservas online no est\u00e1n disponibles." : "No encontramos este restaurante."); return response.json() as Promise<Profile>; })
      .then((data) => { setProfile(data); setBranch(data.branches[0]?.slug || ""); setPartySize(Math.max(data.minPartySize, Math.min(2, data.maxPartySize))); })
      .catch((reason) => setError(reason.message)).finally(() => setLoading(false));
  }, [restaurantSlug]);

  useEffect(() => {
    if (!profile || step !== 3 || !date) return;
    setSlotsLoading(true);
    const query = new URLSearchParams({ branch, date, partySize: String(partySize) });
    fetch(`${API_URL}/public/reservations/${restaurantSlug}/availability?${query}`)
      .then(async (response) => { if (!response.ok) throw new Error("No pudimos consultar los horarios."); return response.json() as Promise<{ slots: Slot[] }>; })
      .then((data) => { setSlots(data.slots); if (!data.slots.some((slot) => slot.time === time)) setTime(""); })
      .catch((reason) => setError(reason.message)).finally(() => setSlotsLoading(false));
  }, [profile, step, branch, date, partySize, restaurantSlug]);

  const theme = THEMES[(profile?.publicTheme as publicThemeKey) || "classic"] || THEMES.classic;
  const accent = profile?.accentColor || theme.defaultAccent;
  const whatsappUrl = profile?.whatsappPhone ? `https://wa.me/${profile.whatsappPhone.replace(/\D/g, "")}` : null;
  const branchName = profile?.branches.find((item) => item.slug === branch)?.name || "";
  const goBack = () => { setError(""); setStep((current) => current - 1); };
  const chooseDate = (nextDate: string) => { setDate(nextDate); setTime(""); };
  const selectedStyle = (active: boolean) => active && theme.accentOutline ? { borderColor: accent, backgroundColor: softColor(accent, theme.softAlpha) } : undefined;
  const primaryStyle = { backgroundColor: accent, ...(theme.autoContrast ? { color: contrastText(accent) } : {}) };
  const onlineLimit = profile?.maxPartySize ?? 15;
  const whatsappCardTitle = `¿Mesa para más de ${onlineLimit} personas?`;
  const whatsappCardHint = "Escribinos y organizamos tu reserva por WhatsApp";
  const whatsappCard = whatsappUrl ? <a href={whatsappUrl} target="_blank" rel="noreferrer" className={theme.whatsapp}><span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-[#25D366] text-white"><FaWhatsapp className="h-5 w-5" /></span><span className="text-left leading-tight"><span className="block text-sm font-extrabold">{whatsappCardTitle}</span><span className={theme.whatsappHint}>{whatsappCardHint}</span></span><ChevronRight className="ml-auto h-5 w-5 transition-transform group-hover:translate-x-1" /></a> : null;

  const continueBooking = async () => {
    setError("");
    if (step === 1 && !branch) return setError("Eleg\u00ed una sede para continuar.");
    if (step === 1 && profile?.largePartyThreshold && partySize > profile.largePartyThreshold) return setError("Para grupos grandes, escribinos por WhatsApp y coordinamos tu reserva.");
    if (step === 2 && !date) return setError("Eleg\u00ed una fecha para continuar.");
    if (step === 3) {
      if (!time) return setError("Eleg\u00ed un horario disponible.");
      setValidating(true);
      try {
        const response = await fetch(`${API_URL}/public/reservations/${restaurantSlug}/validate-slot`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ branch, date, partySize, time }) });
        if (!response.ok) throw new Error("Ese horario acaba de dejar de estar disponible. Eleg\u00ed otro.");
        setStep(4);
      } catch (reason) { setTime(""); setError(reason instanceof Error ? reason.message : "Ese horario ya no est\u00e1 disponible."); } finally { setValidating(false); }
      return;
    }
    if (step === 4) {
      if (!fullName.trim() || !phone.trim()) return setError("Complet\u00e1 tu nombre y tel\u00e9fono.");
      setLoading(true);
      try {
        const response = await fetch(`${API_URL}/public/reservations/${restaurantSlug}`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ branch, date, partySize, time, fullName, phone, notes: notes || undefined, website: "" }) });
        const result = await response.json();
        if (!response.ok) throw new Error(result?.message?.message || result?.message || "No pudimos confirmar la reserva.");
        setConfirmation(result); setStep(5);
      } catch (reason) { setError(reason instanceof Error ? reason.message : "No pudimos confirmar la reserva."); } finally { setLoading(false); }
      return;
    }
    setStep((current) => current + 1);
  };

  if (loading && !profile) return <PublicFrame theme={theme} name={theme.label}><Loading accent={accent} /></PublicFrame>;
  if (error && !profile) return <PublicFrame theme={theme} name={theme.label}><Notice theme={theme} title="Reservas online" text={error} /></PublicFrame>;
  if (!profile) return null;

  return <PublicFrame theme={theme} accent={accent} cover={profile.coverImageUrl} logo={profile.logoUrl} name={profile.name}>
    <div className="mx-auto w-full max-w-xl px-5 py-7 sm:px-9 sm:py-10">
      <header className={theme.header}>
        <div className="flex items-start justify-between">
          <div>
            <p className={cn(theme.eyebrow, theme.ornament && "booking-ornament")} style={{ color: accent }}>Reserva online</p>
            <h1 className={theme.title}>{profile.name}</h1>
          </div>
          <span className={theme.badge} style={{ color: accent }}>Paso {step}/5</span>
        </div>
        {step < 5 ? <div className={theme.progressTrack}><div className="h-full rounded-full transition-all" style={{ width: `${step * 25}%`, backgroundColor: accent }} /></div> : null}
      </header>

      {step === 1 ? <section className="space-y-5">
        <Heading theme={theme} title={"\u00bfD\u00f3nde quer\u00e9s reservar?"} text={"Eleg\u00ed la sede y la cantidad de personas."} />
        <div className="grid gap-3">{profile.branches.map((item) => {
          const active = branch === item.slug;
          return <button type="button" key={item.slug} onClick={() => { setBranch(item.slug); setDate(""); setTime(""); }} style={selectedStyle(active)} className={cn(theme.option, active ? cn(theme.optionActive, theme.optionActiveText) : theme.optionIdle)}>{item.name}</button>;
        })}</div>
        <Counter theme={theme} value={partySize} min={profile.minPartySize} max={profile.maxPartySize} onChange={(value) => { setPartySize(value); setDate(""); setTime(""); }} />
        {whatsappCard}
      </section> : null}

      {step === 2 ? <section className="space-y-5"><Heading theme={theme} title={"\u00bfQu\u00e9 d\u00eda te gustar\u00eda venir?"} text={`Sede: ${branchName}`} /><FoodieCalendar theme={theme} restaurantSlug={restaurantSlug} branch={branch} partySize={partySize} value={date} onChange={chooseDate} accent={accent} /></section> : null}

      {step === 3 ? <section className="space-y-6"><Heading theme={theme} title="Elegí un horario" text={`${date} \u00b7 ${partySize} personas`} />{slotsLoading ? <Loading accent={accent} /> : slots.length ? <div className="grid grid-cols-3 gap-3 sm:grid-cols-4">{slots.map((slot) => { const active = time === slot.time; return <button type="button" key={slot.time} onClick={() => setTime(slot.time)} style={selectedStyle(active)} className={cn(theme.slot, active ? cn(theme.slotActive, theme.slotActiveText) : theme.slotIdle)}>{slot.time}</button>; })}</div> : <div className="space-y-4"><Notice theme={theme} title="Sin horarios" text="No encontramos horarios para esta fecha. Probá con otro día." />{whatsappCard}</div>}</section> : null}

      {step === 4 ? <section className="space-y-5"><Heading theme={theme} title="Tus datos" text={`${branchName} \u00b7 ${date} \u00b7 ${time} \u00b7 ${partySize} personas`} /><Field theme={theme} label="Nombre y apellido"><input value={fullName} onChange={(event) => setFullName(event.target.value)} className={theme.input} autoComplete="name" /></Field><Field theme={theme} label="Teléfono"><input value={phone} onChange={(event) => setPhone(event.target.value)} className={theme.input} inputMode="tel" autoComplete="tel" /></Field>{profile.commentsEnabled ? <Field theme={theme} label="Comentarios (opcional)"><textarea value={notes} onChange={(event) => setNotes(event.target.value)} className={cn(theme.input, "min-h-24")} /></Field> : null}</section> : null}

      {step === 5 ? <section className="py-6 text-center"><CheckCircle2 className="mx-auto h-16 w-16" style={{ color: accent }} /><h2 className={theme.confirmTitle}>Reserva confirmada</h2><p className={`mt-3 ${theme.muted}`}>Tu reserva fue registrada correctamente.</p><div className={theme.summary}><b>{confirmation?.branch}</b><p className="mt-2">{confirmation?.date} · {confirmation?.time}</p><p>{confirmation?.partySize} personas</p><p className="mt-4 text-sm font-bold" style={{ color: accent }}>Código: {confirmation?.code}</p></div>{whatsappUrl ? <a href={whatsappUrl} target="_blank" rel="noreferrer" className={theme.whatsappLink}><FaWhatsapp className="h-5 w-5" />¿Necesitás ayuda o son más personas? Escribinos</a> : null}</section> : null}

      {error ? <p className={theme.error}>{error}</p> : null}

      {step === 1 && profile.publicInfo && Object.values(profile.publicInfo).some(Boolean) ? <div className={`mt-5 flex flex-wrap gap-2 text-xs font-bold ${theme.muted}`}>{profile.publicInfo.menuUrl ? <a className={cn(theme.chip, "inline-flex items-center gap-1.5")} href={profile.publicInfo.menuUrl} target="_blank" rel="noreferrer"><FaUtensils className="h-3.5 w-3.5" />Ver carta</a> : null}{profile.publicInfo.mapsUrl ? <a className={cn(theme.chip, "inline-flex items-center gap-1.5")} href={profile.publicInfo.mapsUrl} target="_blank" rel="noreferrer"><FaMapMarkerAlt className="h-3.5 w-3.5" />Cómo llegar</a> : null}{profile.publicInfo.instagramUrl ? <a className={cn(theme.chip, "inline-flex items-center gap-1.5")} href={profile.publicInfo.instagramUrl} target="_blank" rel="noreferrer"><FaInstagram className="h-3.5 w-3.5" />Instagram</a> : null}{profile.publicInfo.phone ? <a className={cn(theme.chip, "inline-flex items-center gap-1.5")} href={`tel:${profile.publicInfo.phone}`}><FaPhoneAlt className="h-3.5 w-3.5" />Llamar</a> : null}</div> : null}

      {step < 5 ? <footer className="mt-8 flex gap-3">{step > 1 ? <button type="button" onClick={goBack} className={theme.ghost} aria-label="Atrás"><ArrowLeft className="h-4 w-4" /></button> : null}<button type="button" disabled={loading || slotsLoading || validating} onClick={() => void continueBooking()} style={primaryStyle} className={theme.primary}>{validating ? "Verificando..." : step === 4 ? "Confirmar reserva" : "Continuar"}<ChevronRight className="h-4 w-4" /></button></footer> : null}
    </div>
  </PublicFrame>;
}

function FoodieCalendar({ theme, restaurantSlug, branch, partySize, value, onChange, accent }: { theme: BookingTheme; restaurantSlug: string; branch: string; partySize: number; value: string; onChange: (value: string) => void; accent: string }) {
  const initial = useMemo(() => new Date(), []); const [month, setMonth] = useState(new Date(initial.getFullYear(), initial.getMonth(), 1)); const [available, setAvailable] = useState<Set<string>>(new Set()); const [loading, setLoading] = useState(false);
  const monthKey = `${month.getFullYear()}-${String(month.getMonth() + 1).padStart(2, "0")}`;
  useEffect(() => { if (!branch) return; setLoading(true); const query = new URLSearchParams({ branch, month: monthKey, partySize: String(partySize) }); fetch(`${API_URL}/public/reservations/${restaurantSlug}/calendar?${query}`).then((response) => response.ok ? response.json() : Promise.reject()).then((data: { availableDates: string[] }) => setAvailable(new Set(data.availableDates))).catch(() => setAvailable(new Set())).finally(() => setLoading(false)); }, [restaurantSlug, branch, monthKey, partySize]);
  const firstWeekday = new Date(month.getFullYear(), month.getMonth(), 1).getDay(); const days = new Date(month.getFullYear(), month.getMonth() + 1, 0).getDate();
  return <div className={theme.panel}><div className="flex items-center justify-between"><button type="button" aria-label="Mes anterior" onClick={() => setMonth(new Date(month.getFullYear(), month.getMonth() - 1, 1))} className={theme.calendarNav}><ChevronLeft className="h-4 w-4" /></button><b className={theme.calendarMonth}>{month.toLocaleDateString("es-AR", { month: "long", year: "numeric" })}</b><button type="button" aria-label="Mes siguiente" onClick={() => setMonth(new Date(month.getFullYear(), month.getMonth() + 1, 1))} className={theme.calendarNav}><ChevronRight className="h-4 w-4" /></button></div><div className={theme.calendarWeekdays}>{"D L M M J V S".split(" ").map((day, index) => <span key={`${day}-${index}`}>{day}</span>)}</div><div className="mt-3 grid grid-cols-7 gap-1">{Array.from({ length: firstWeekday }, (_, index) => <span key={`empty-${index}`} />)}{Array.from({ length: days }, (_, index) => { const current = `${monthKey}-${String(index + 1).padStart(2, "0")}`; const enabled = available.has(current); const active = value === current; return <button type="button" key={current} disabled={!enabled || loading} onClick={() => onChange(current)} style={active ? { backgroundColor: accent, color: theme.autoContrast ? contrastText(accent) : "#FFFFFF" } : undefined} className={cn(theme.calendarDay, active ? "" : enabled ? theme.calendarDayEnabled : theme.calendarDayDisabled)}>{index + 1}</button>; })}</div>{loading ? <p className={`mt-3 text-center text-xs ${theme.muted}`}>Actualizando fechas...</p> : null}</div>;
}

function PublicFrame({ children, theme, cover, logo, name }: { children: React.ReactNode; theme: BookingTheme; accent?: string; cover?: string | null; logo?: string | null; name?: string }) {
  const watermarkColor = theme.key === "bistro" ? "text-[#F4EFE6]/5" : "text-[#3A2E24]/5";
  return <main className={theme.page} style={{ backgroundImage: cover ? `${theme.overlay}, url(${cover})` : undefined, backgroundSize: "cover", backgroundPosition: "center" }}>
    {theme.watermark && name ? <div aria-hidden className="pointer-events-none absolute inset-0 flex flex-col items-center justify-center gap-4 overflow-hidden">{["-", "0", "+"].map((key) => <span key={key} className={cn("whitespace-nowrap font-display text-[16vw] font-semibold uppercase leading-none tracking-[.1em] sm:text-[120px]", watermarkColor)}>{name}</span>)}</div> : null}
    <div className={theme.card}>{logo ? <img src={logo} alt={name || "Restaurante"} className={theme.logo} /> : null}{children}</div>
  </main>;
}

function Heading({ theme, title, text }: { theme: BookingTheme; title: string; text: string }) { return <div><h2 className={theme.headingTitle}>{title}</h2><p className={theme.headingText}>{text}</p></div>; }

function Field({ theme, label, children }: { theme: BookingTheme; label: string; children: React.ReactNode }) { return <label className={theme.fieldLabel}><span>{label}</span>{children}</label>; }

function Counter({ theme, value, min, max, onChange }: { theme: BookingTheme; value: number; min: number; max: number; onChange: (value: number) => void }) { return <div className={cn("flex items-center justify-between", theme.panel)}><span className={theme.counterLabel}>Personas</span><div className="flex items-center gap-5"><button type="button" disabled={value <= min} onClick={() => onChange(value - 1)} className={theme.control} aria-label="Restar persona"><Minus className="h-4 w-4" /></button><b className="w-6 text-center">{value}</b><button type="button" disabled={value >= max} onClick={() => onChange(value + 1)} className={theme.control} aria-label="Sumar persona"><Plus className="h-4 w-4" /></button></div></div>; }

function Loading({ accent }: { accent: string }) { return <div className="flex justify-center py-14" style={{ color: accent }}><Loader2 className="h-7 w-7 animate-spin" /></div>; }

function Notice({ theme, title, text }: { theme: BookingTheme; title: string; text: string }) { return <div className={theme.notice}><b className={theme.noticeTitle}>{title}</b><p className={theme.noticeText}>{text}</p></div>; }
