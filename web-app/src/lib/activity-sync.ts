// Desktop → Web category name mapping (mirrors categories/route.ts)
const CATEGORY_ALIASES: Record<string, string> = {
  Productivity: 'Work',
  Social: 'Social Media',
};

function normalizeCategory(category: string): string {
  return CATEGORY_ALIASES[category] || category;
}

// Generic categories that warrant a server-side rule lookup
const GENERIC_CATEGORIES = ['Browsing', 'Unknown'];

interface CategoryRuleLike {
  keyword: string;
  matchField: string;
  category: string;
}

/**
 * Resolves the category for a synced activity.
 *
 * - If the client already sent a specific category, trust it (after normalization).
 * - If the client sent a generic category (Browsing/Unknown), try to match a
 *   server-side CategoryRule by applicationName keyword.
 * - Falls back to the client-sent category if no rule matches.
 *
 * @param applicationName - e.g. "messenger.com" or "chrome.exe"
 * @param clientCategory  - category sent by the client
 * @param rules           - pre-loaded CategoryRules (sorted by priority desc, isGlobal asc)
 */
export function resolveCategory(
  applicationName: string,
  clientCategory: string,
  rules: CategoryRuleLike[]
): string {
  if (!GENERIC_CATEGORIES.includes(clientCategory)) {
    return normalizeCategory(clientCategory);
  }

  const lowerName = applicationName.toLowerCase();
  const matched = rules.find(
    (r) => r.matchField === 'applicationName' && lowerName.includes(r.keyword)
  );

  return matched ? matched.category : normalizeCategory(clientCategory);
}
