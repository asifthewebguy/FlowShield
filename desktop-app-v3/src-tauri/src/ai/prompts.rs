//! Briefing + reflection prompt templates. Constants only — no I/O.

/// Used by `briefing.rs` (Plan 1.3) to build the LLM prompt. {} placeholders
/// are substituted by `render_briefing_prompt`.
const BRIEFING_TEMPLATE: &str = "\
You are FlowShield, a personal productivity coach. The user's local
activity data is below. Generate a SHORT briefing (2-3 sentences max) that:
- compares last 7 days to their baseline (use ONLY the numbers given)
- surfaces ONE specific pattern or blocker
- suggests ONE concrete action for today
Be warm but direct. No corporate-speak.

USER DATA:
{chunks}

YESTERDAY'S REFLECTION:
{reflection}

TODAY: {weekday} {date}, {local_time}.

BRIEFING:";

pub struct BriefingContext<'a> {
    pub chunks: &'a [String],
    pub reflection: Option<&'a str>,
    pub weekday: &'a str,
    pub date: &'a str,
    pub local_time: &'a str,
}

pub fn render_briefing_prompt(ctx: &BriefingContext<'_>) -> String {
    let chunks_block = if ctx.chunks.is_empty() {
        "(no recent activity data)".to_string()
    } else {
        ctx.chunks.join("\n")
    };
    let reflection_block = ctx.reflection.unwrap_or("—");

    BRIEFING_TEMPLATE
        .replace("{chunks}", &chunks_block)
        .replace("{reflection}", reflection_block)
        .replace("{weekday}", ctx.weekday)
        .replace("{date}", ctx.date)
        .replace("{local_time}", ctx.local_time)
}

const REFLECTION_TEMPLATE: &str = "\
You are FlowShield generating an evening reflection prompt. The user's data
for TODAY is below. Generate ONE short, specific question (max 15 words)
that picks up on something noteworthy from today — a session that ended
early, an unusual app pattern, an outlier productivity score. Skip generic
'how was your day?' — be specific.

TODAY'S DATA:
{chunks}

QUESTION:";

pub struct ReflectionContext<'a> {
    pub chunks: &'a [String],
}

pub fn render_reflection_prompt(ctx: &ReflectionContext<'_>) -> String {
    let chunks_block = if ctx.chunks.is_empty() {
        "(no sessions today yet)".to_string()
    } else {
        ctx.chunks.join("\n")
    };
    REFLECTION_TEMPLATE.replace("{chunks}", &chunks_block)
}

/// Keep only the first paragraph of an LLM completion. Phi-3-mini-q4 reliably
/// produces the intended answer first (a 2-3 sentence briefing, or a single
/// reflection question), then under thin/sparse data sometimes appends extra
/// sections after a blank line — an "Explanation:" list, a restated "USER
/// DATA:" echo of the prompt chunks, a "Solution N:" follow-up. Return the text
/// before the first blank line; as a guard, also cut at any leaked
/// prompt-structure marker in case an echo isn't preceded by a blank line. A
/// real answer never contains these markers.
pub(crate) fn first_paragraph(text: &str) -> &str {
    let t = text.trim_start();
    let mut end = t.find("\n\n").unwrap_or(t.len());
    for marker in [
        "USER DATA",
        "YESTERDAY'S REFLECTION",
        "TODAY'S DATA",
        "TODAY:",
        "BRIEFING:",
        "QUESTION:",
        "[Session]",
        "[Day]",
        "[Reflection]",
    ] {
        if let Some(i) = t.find(marker) {
            end = end.min(i);
        }
    }
    t[..end].trim_end()
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn first_paragraph_strips_appended_sections() {
        // Real GPU briefing leak: an "Explanation:" list after a blank line.
        let leaked = "In the past week you had 5 sessions. Today, limit app usage.\n\n\nExplanation:\n- focus time decreased";
        assert_eq!(
            first_paragraph(leaked),
            "In the past week you had 5 sessions. Today, limit app usage."
        );
        // Real reflection leak: question then a "Solution 1:" follow-up.
        let q = "What caused the Thursday session to end 25 minutes early?\n\n\nSolution 1:\nWhat led to the 15-minute session ending early?";
        assert_eq!(
            first_paragraph(q),
            "What caused the Thursday session to end 25 minutes early?"
        );
        // Inline chunk echo with no blank line (defense-in-depth guard).
        let inline = "Focus dropped this week. [Session] Sat 10:00-10:15 echo.";
        assert_eq!(first_paragraph(inline), "Focus dropped this week.");
        // Clean single-paragraph output is unchanged.
        let clean = "You had 5 sessions averaging 10 minutes. Today, take a break.";
        assert_eq!(first_paragraph(clean), clean);
    }

    #[test]
    fn briefing_template_substitutes_all_placeholders() {
        let chunks = vec![
            "[Session] Mon 2026-05-04 09:00-09:55 (60min planned, 55min actual).".into(),
            "[Day] Mon 2026-05-04. 3 sessions, 2.5h focused.".into(),
        ];
        let ctx = BriefingContext {
            chunks: &chunks,
            reflection: Some("API spec was unclear; pinged Maya."),
            weekday: "Tuesday",
            date: "May 5",
            local_time: "08:42",
        };
        let prompt = render_briefing_prompt(&ctx);
        assert!(prompt.contains("[Session] Mon 2026-05-04"));
        assert!(prompt.contains("[Day] Mon 2026-05-04"));
        assert!(prompt.contains("API spec was unclear"));
        assert!(prompt.contains("Tuesday May 5, 08:42"));
        assert!(!prompt.contains("{chunks}"));
        assert!(!prompt.contains("{reflection}"));
        assert!(!prompt.contains("{weekday}"));
    }

    #[test]
    fn briefing_template_handles_no_reflection() {
        let ctx = BriefingContext {
            chunks: &[],
            reflection: None,
            weekday: "Tuesday",
            date: "May 5",
            local_time: "08:00",
        };
        let prompt = render_briefing_prompt(&ctx);
        assert!(prompt.contains("(no recent activity data)"));
        assert!(prompt.contains("YESTERDAY'S REFLECTION:\n—"));
    }

    #[test]
    fn reflection_template_substitutes_chunks() {
        let chunks = vec!["[Session] Tue 2026-05-05 09:30-09:47 (60min planned, 17min actual).".into()];
        let p = render_reflection_prompt(&ReflectionContext { chunks: &chunks });
        assert!(p.contains("[Session] Tue 2026-05-05"));
        assert!(!p.contains("{chunks}"));
    }

    #[test]
    fn reflection_template_handles_empty_chunks() {
        let p = render_reflection_prompt(&ReflectionContext { chunks: &[] });
        assert!(p.contains("(no sessions today yet)"));
    }
}
