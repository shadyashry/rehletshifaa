const TITLES = /^(dr\.?|prof\.?|mr\.?|mrs\.?|ms\.?|د\.?|أ\.د\.?|الدكتور|الدكتورة|الأستاذ|الأستاذة)$/i;
const ARABIC = /\p{Script=Arabic}/u;

/**
 * A person's initials for a monogram. Titles ("Dr", "د.") and the Arabic article are skipped so the initials are the
 * name's own. Two Arabic letters side by side join into what reads as a word, so an Arabic name shows its first letter
 * only; a Latin name shows its first and last.
 */
export function initials(name: string) {
  const words = name.trim().split(/\s+/).filter(word => word && !TITLES.test(word));
  const arabic = ARABIC.test(words[0] ?? "");
  const picked = words.length > 1 && !arabic ? [words[0], words[words.length - 1]] : words.slice(0, 1);
  return picked.map(word => Array.from(word.length > 3 && word.startsWith("ال") ? word.slice(2) : word)[0] ?? "").join("").toLocaleUpperCase();
}

/**
 * A Consultant's mark in the profile's own language. The stored initials are kept when they are written in the name's
 * script; Latin initials beside an Arabic name (the Arabic profile copied from the English one) give way to the Arabic
 * name's own letter, so an Arabic page never draws a Consultant as "AA".
 */
export function consultantMark(profile: { initials: string; name: string }) {
  const arabicName = ARABIC.test(profile.name);
  if (arabicName === ARABIC.test(profile.initials) && profile.initials.trim()) return profile.initials;
  return initials(profile.name) || profile.initials;
}
