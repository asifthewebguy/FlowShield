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

interface ActivityFields {
  applicationName: string;
  processName?: string | null;
  windowTitle?: string | null;
  url?: string | null;
}

function fieldValue(activity: ActivityFields, field: string): string | null {
  switch (field) {
    case 'applicationName': return activity.applicationName ?? null;
    case 'processName':     return activity.processName ?? null;
    case 'windowTitle':     return activity.windowTitle ?? null;
    case 'url':             return activity.url ?? null;
    default:                return null;
  }
}

/**
 * Resolves the category for a synced activity.
 *
 * - If the client already sent a specific category, trust it (after normalization).
 * - If the client sent a generic category (Browsing/Unknown), evaluate every
 *   server-side CategoryRule in priority order across all match fields
 *   (applicationName, processName, windowTitle, url). The first hit wins.
 * - Falls back to the client-sent category if no rule matches.
 *
 * The previous implementation only consulted `applicationName` rules even
 * when a user had configured a `windowTitle` or `url` rule — those rules
 * silently did nothing at sync time. This fix evaluates all configured
 * fields so user overrides actually apply.
 *
 * @param fields  - activity metadata (applicationName, processName, windowTitle, url)
 * @param clientCategory - category sent by the client
 * @param rules - pre-loaded CategoryRules (sorted by priority desc, isGlobal asc)
 */
export function resolveCategory(
  fields: ActivityFields | string,
  clientCategory: string,
  rules: CategoryRuleLike[]
): string {
  if (!GENERIC_CATEGORIES.includes(clientCategory)) {
    return normalizeCategory(clientCategory);
  }

  // Backwards-compat: callers that pass a bare applicationName string get
  // wrapped automatically so older sync paths keep working.
  const activity: ActivityFields =
    typeof fields === 'string' ? { applicationName: fields } : fields;

  for (const rule of rules) {
    const value = fieldValue(activity, rule.matchField);
    if (value && value.toLowerCase().includes(rule.keyword.toLowerCase())) {
      return normalizeCategory(rule.category);
    }
  }

  return normalizeCategory(clientCategory);
}
