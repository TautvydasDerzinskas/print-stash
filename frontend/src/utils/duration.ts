import type { TFunction } from "i18next";

/** Formats a prepared-print's estimated duration as "1 d. 2 val. 3 min." style text. */
export function formatPreparedDuration(t: TFunction, totalSeconds?: number | null): string | null {
  if (!totalSeconds || totalSeconds < 1) return null;
  const roundedMinutes = Math.max(1, Math.round(totalSeconds / 60));
  const days = Math.floor(roundedMinutes / 1440);
  const hours = Math.floor((roundedMinutes % 1440) / 60);
  const minutes = roundedMinutes % 60;
  return [
    days ? t("library:duration.days", { count: days }) : "",
    hours ? t("library:duration.hours", { count: hours }) : "",
    minutes ? t("library:duration.minutes", { count: minutes }) : "",
  ].filter(Boolean).join(" ");
}
