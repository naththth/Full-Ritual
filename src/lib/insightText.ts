const PROFILE_NAME_TOKEN = '{{profile_name}}';

export function resolveInsightText(text: string, profileName?: string | null): string {
  const displayName = profileName?.trim() || 'você';
  const withCurrentName = replaceEvery(
    replaceEvery(text, PROFILE_NAME_TOKEN, displayName),
    '[NOME]',
    displayName,
  );

  return replaceLeadingStoredName(withCurrentName, displayName);
}

function replaceEvery(text: string, search: string, replacement: string): string {
  return text.split(search).join(replacement);
}

function replaceLeadingStoredName(text: string, displayName: string): string {
  const match = text.match(/^([^,\n]{2,48})(,)(\s+)/);
  if (!match) return text;

  const possibleName = match[1].trim();
  if (!looksLikeStoredProfileName(possibleName)) return text;

  return `${displayName}${match[2]}${match[3]}${text.slice(match[0].length)}`;
}

function looksLikeStoredProfileName(value: string): boolean {
  if (!value || /[!?;:]/.test(value)) return false;
  if (/[@._\d]/.test(value)) return true;

  const words = value.split(/\s+/).filter(Boolean);
  if (words.length === 1) return /^[a-zÀ-ÿ]{2,24}$/i.test(words[0]);
  if (words.length > 3) return false;

  return words.every((word) => /^[A-ZÀ-Ý][a-zÀ-ÿ'-]{1,24}$/.test(word));
}
