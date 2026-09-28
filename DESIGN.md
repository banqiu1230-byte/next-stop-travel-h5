# Design System

## Theme

暖纸色的旅行票夹与城市编辑感。墨绿承载稳定信息，日落橙只用于主操作和当前状态。纸张纹理保留但维持低对比，不妨碍阅读。

## Color Palette

- Paper: `#F1EFE8`
- Secondary paper: `#E8E4D8`
- Primary ink: `#14231D`
- Muted ink: `#5F6A63`
- Forest green: `#173F32`
- Sunset orange: `#F26835`
- White surface: `#FFFEF9`
- Divider: `rgba(20, 35, 29, 0.16)`

## Typography

- Display headings: Noto Serif SC, 700–900.
- Product UI, labels, body and controls: Noto Sans SC, 400–700.
- Time and compact metadata: DM Mono, 500; never below 12px when meaningful.
- Core mobile UI scale: 12 / 14 / 16 / 20 / 24 / 32 / 36px.
- Editorial display roles may use optical sizes already established in the product: page title 30px, ticket title 26–28px, feature message 31px, detail/editor title 34px, and form title 38px. Do not introduce additional sizes without assigning a reusable role.
- Body line-height: 1.6; compact metadata line-height: 1.4.
- Display letter spacing never tighter than `-0.04em`.

## Spacing & Layout

- 4pt base scale: 4 / 8 / 12 / 16 / 24 / 32 / 40 / 48 / 64px.
- Page gutter: 24px; compact screens down to 20px at 360px and below.
- Related content gap: 8–12px; component gap: 16–24px; section gap: 40px.
- App shell fills the visible viewport and must never create document-level vertical scrolling.
- Bottom navigation occupies its own fixed 84px layout row, with safe-area padding kept inside that row; tab content ends at its upper edge and never renders underneath it.
- Today and Profile scroll inside the content row with the scrollbar visually hidden; Map remains a non-scrolling full-height canvas.
- Use 1px dividers and whitespace for grouping. Avoid nested cards.

## Components

- Primary CTA: minimum 52px high, sunset orange, 16px semibold label.
- Icon button: minimum 44×44px touch area.
- Segmented control: minimum 48px high; selected state uses white surface and ink.
- List row: minimum 88px for place rows, 56px for settings rows.
- Bottom navigation label: 12px; icon: 22px; active state uses ink plus orange dot.
- Metadata and helper copy: 12px minimum and sufficient contrast.
- Focus-visible: standard controls use a 2px orange outline with 2px offset.
- Search input exception: focus is shown on the whole search container with a forest-green border, pale-green surface, and 4px offset shadow; the inner input does not draw its own outline.
- Trip-creation destination fields use a neutral ink focus state: keep the paper background and strengthen the bottom rule without orange or green highlighting.
- Identity marks such as the circular “W” avatar are static unless a profile action exists; static marks must not use button semantics or enter the keyboard tab order.
- Any control that clears local travel data must name the full consequence and require confirmation before deletion.

## Create Trip Flow

- After trip basics, offer two explicit paths: “I have not researched yet” and “I already know some places.” Do not force a zero-start user through manual place search.
- Present those two planning paths as one compact horizontal tab control. Do not repeat the decision with an eyebrow, page title, or explanatory paragraph above it.
- The zero-start path uses three stages: basics, lightweight optional preferences, and an editable route proposal. The known-places path uses four stages by inserting real-place selection before review.
- New trips start with empty destination, dates, styles, places, and accommodation. Never prefill a fictional itinerary.
- Place and accommodation choices must come from the configured map provider and retain their provider ID and coordinates.
- Preferences are optional and collected with a small set of chips; pace and transport stay inside a collapsed advanced section.
- Generate a useful default proposal first. Users edit it by removing stops, marking must-go places, or moving stops between days instead of making a choice at every step.
- Confirming the proposal creates the usable trip plan. Never send users to another page to “organize” it before it exists.
- “Reorganize route” is a secondary action shown only after a route exists, for cases where places or preferences have changed.
- Long provider-result lists scroll inside a bounded region. The selected-place count and route action remain visible in a sticky footer.
- Every stage change resets the flow's internal scroll position to the top.
- Route generation may group and order selected places, but must label unknown travel time, price, opening hours, photos, and reviews as unknown instead of inventing values.
- Planning asks for an optional daily start time. The route review turns it into editable suggested arrival ranges, stay durations, previous-stop departure times, and movement reserves; it flags appointment, closing-time, and excessively late-finish conflicts before the trip is created.
- Suggested schedule values are planning estimates, not live facts. Travel-day screens replace them with provider-backed routes after location is granted; when a route cannot be calculated, write “出发时计算” or “路线待计算” and never fall back to a fabricated duration.
- The pre-model planner is a deterministic boundary based on real provider search results, coordinates, user priority, pace, and appointments. Do not expose implementation labels such as model or local planner in normal product copy.
- Sparse plans are described as a route skeleton, never as complete. Empty days explicitly remain available for rest or later additions.
- Users must review the generated day groups and can remove a stop, mark it must-go, or move it between days before creating the trip.
- Every AI-generated route remains editable after creation: users can reorder stops, move them between days, mark them must-go, remove them, or ask AI to reorganize the current set.
- The full-route editor completes the edit loop with an “Add place” action for every day. It reuses real map-provider search, adds the selected place directly to that date, and allows an explicitly removed place to be searched and added again.
- Accommodation is a dated schedule, not a single global hotel. Users can add multiple real stays and set check-in/check-out dates for each.
- Each day's applicable stay appears as a quiet annotation below that day's places. It uses a small home icon, is not a timeline node or numbered place, and keeps a compact edit entry to accommodation management.
- Route place rows are full-width detail links. Selecting one opens its photos, rating, public reviews, opening information, and visit guidance; route editing remains a separate action.
- Route timeline markers communicate state instead of repeating unexplained numbers: pending uses an outlined dot, appointments use a ticket, and completed stops use a check. Supporting text starts with “第 N 站”, adds appointment or completion state only when applicable, then carries category, transport mode, and estimated travel time.
- A pre-trip summary with a usable route exposes one “立即出发” action. Starting the trip preserves the planned route and enters the travel-day surface with the first available day and next stop ready; it does not regenerate the plan.
- During a trip, Today keeps the next stop and current-day route primary but always exposes a visible “查看全部 N 天” entry. The full-route view preserves completion states, accommodation annotations, place details, and route editing, then returns to the unchanged Today state.
- Today route hierarchy keeps the existing vertical progress line: the section title leads, the current-state label and marker identify the next stop, place names remain neutral ink, and edit/full-trip actions stay visually secondary.
- Today is the journey action surface, not a gateway page: it directly exposes the next stop, recommended transport and time, “打开高德出发”, “我已到达”, “完成这一站”, and “情况变了”. The next-stop screen remains an optional detail view.
- The next-stop detail screen combines destination photos, rating, visit facts, public reviews, recommendation reasons, and transport alternatives. It must not open a third-level destination-detail screen.
- Map headers use direct Chinese product language such as “成都行程 · 2 个地点 / 行程地图”; avoid internal English counters or vague ownership labels.
- The travel-day lifecycle is explicit: ready → en route → arrived → completed. Completing the last stop closes the day and offers the next planned day; completing the final planned day closes the trip without returning to the pre-trip surface.
- A completed trip is an immutable travel record. It keeps place details, completion states and accommodation notes visible, but removes route, stay, packing and restart mutations; reopening its route never enters an editor.
- Once the user has chosen a next stop, the destination screen uses explicit action-state labels such as “前往下一站”, “正在前往”, and “已经到达”; it never continues to describe the selected destination as a recommendation.
- Navigation is handed to AMap with the chosen transport mode. Location is requested only after an explicit tap, and unknown weather, origin, traffic time, price, or opening data must remain visibly unknown rather than using demo facts.
- The full-route view shows the date for every day; transport mode and estimated time live inside each destination's metadata instead of a separate travel-leg row. A quiet meal/rest note and the applicable dated accommodation remain part of the same timeline.
- A changed condition first shows a route-adjustment preview. The user confirms before the plan changes and can undo the latest adjustment.
- AI route generation is called through the project server only. API keys never enter the H5 bundle, and a deterministic planner remains available when the model is not configured or temporarily unavailable.
- When route alternatives are introduced, show at most three complete options with explicit tradeoffs—recommended, relaxed, and popular—not multiple choices at every stop.
- Route options must expose their direction, recommendation reason, tradeoff, place count, maximum stops per day, and the selected primary transport. Only self-driving plans may label the coordinate-based estimate as “longest driving”; public-transport and walking plans keep live transfer time pending until the map provider calculates it. Broad destinations may use region routes such as northern and southern Xinjiang, but all places still come from the configured map provider and the selected option alone is sent to AI for detailed day planning.
- Optional style preferences affect provider search queries, candidate-place ranking, route-option order, the “best match” label, and the final AI day plan. Must-go places and fixed appointments always outrank preference matching.
- Only constraints that materially change the route belong in planning. “Less walking”, “travelling with elders”, and “travelling with children” stay optional inside the collapsed advanced section and reduce daily density. One optional natural-language field may capture high-value context; the product restates what it understood and only surfaces unresolved questions that affect the route.
- Route generation always exposes a plain-language progress state. If detailed generation is unavailable, keep the real places and editable route, explain the fallback without naming the implementation, and offer an explicit retry.
- Route review separates what is already checked from what remains unknown: provider-backed places and daily density may be confirmed, while live traffic, opening status, and missing accommodation stay visibly pending.
- Route alternatives and place details expose evidence in two groups: provider data already available (name, address, coordinates, public rating, provider photos) and facts still requiring confirmation (opening changes, temporary closure, tickets, live traffic). Missing review text is an honest empty state; demo reviews are never presented as public reviews.
- A changed-condition preview and the committed change share the same route calculation. The preview names the new next stop, moved or removed places, and retained appointments before confirmation.
- Full-route editing keeps one-step undo for the latest add, remove, reorder, move-day, must-go, or reorganize action. Because AI re-planning can change several days at once, also retain up to eight recent local route snapshots with a plain-language diff and an explicit restore action.
- Route options compare density, movement, per-person planning budget, crowd risk and booking uncertainty. Estimates must be labelled as planning ranges and never imitate live price, inventory or traffic data.
- Every trip owns a booking-readiness checklist for intercity transport, accommodation and reservation-sensitive places. A task distinguishes confirmed, pending and not-needed states and links back to the source that can verify it.
- Journey-day recommendations surface the highest-priority execution risk before the hero action and accept a lightweight helpful/not-helpful signal. Prototype metrics are labelled as local test data and are never presented as production evidence.
- Do not use a standalone Saved tab in the MVP. Places are added directly to a trip from search or map, and are consistently called trip places.
- On the multi-trip page, settings for the selected trip sit directly below its summary card. “Create new trip” follows those settings and appears immediately before the other-trip list.
- Pre-trip preparation means a practical packing checklist. Accommodation is selected by the user from real map-provider results and managed from its route node rather than a detached overview section.

## Motion

- State transitions: 180–220ms, ease-out.
- No decorative page choreography.
- Reduced-motion users receive instant state changes.
