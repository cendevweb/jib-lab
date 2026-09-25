---
name: notion-sync
description: Keep the Notion "Social Post Ideas" database in sync with jib-lab workflow phases (status changes, spec corrections as comments). Use at phase transitions of /start-project or when asked to update Notion for a project.
---

# notion-sync

Database: `https://app.notion.com/p/2706423825ba4850b9ac29ce3ee7b2ae` · data source `collection://64829b78-88ee-4fa9-bae4-9601a18ffb6e`. Page URL per project: `projects.json → notion`.

| Moment | Notion change | Tool |
|---|---|---|
| Phase 0 (scaffold) | `Status` → `Building` | `notion-update-page` (properties) |
| End of phase 1 | one comment: "jib-lab spec ready" + ≤ 5 Notion corrections + path `apps/<slug>/SPEC.md` | `notion-create-comment` |
| Phase 5 done | `Status` → `Ready to post` | `notion-update-page` |
| After publishing (user) | `Posted URL`, `Status` → `Posted` | user or on request |

Rules
- Never rewrite the page body or the idea fields (`Hook`, `Core angle`, `Build notes`…) without the user asking: corrections go in a comment so the user decides.
- Status values must be one of: Idea, Ready to build, Building, Ready to post, Posted, Template.
- Load Notion tools with ToolSearch (`select:mcp__Notion__notion-update-page,mcp__Notion__notion-create-comment`) if they are deferred.
