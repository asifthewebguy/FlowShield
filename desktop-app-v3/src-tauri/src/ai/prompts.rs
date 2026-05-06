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

#[cfg(test)]
mod tests {
    use super::*;

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
}
