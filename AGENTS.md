
# AGENTS.md — Rate My Gov


## Project

Rate My Gov is a civic feedback website where anyone in India can vote **Satisfied** or **Dissatisfied** on governance in their state or Union Territory and view aggregate results through tables, a red/blue India map, and historical trends.

The site must be fast, accessible, privacy-conscious, neutral, and inexpensive to operate at high traffic volumes.

## Non-negotiable technology stack

- Astro 5 with SSR using `@astrojs/cloudflare`.
- TypeScript with strict mode enabled.
- pnpm for package management.
- PostgreSQL accessed through `postgres.js` and raw SQL.
- Cloudflare Workers for SSR and server-side endpoints.
- Cloudflare Hyperdrive for PostgreSQL connectivity and connection pooling.
- Cloudflare CDN caching for public GET pages.
- Wrangler for local runtime development, configuration, and deployment.

Do not use:
- An ORM or query builder.
- React, Vue, Svelte, or another UI framework.
- A CSS framework.
- A charting or mapping library.
- Analytics scripts or third-party trackers.
- Web fonts.
- Additional dependencies without explicit approval.

Use semantic HTML, handwritten CSS, plain TypeScript, and inline SVG.

## Deployment and runtime

- Target Cloudflare Workers, not Vercel or Vercel Functions.
- Configure Astro's Cloudflare adapter in `astro.config.mjs`.
- Use `wrangler.jsonc` for Worker configuration and bindings.
- Use Cloudflare Hyperdrive to connect to the existing PostgreSQL database.
- Keep the database schema and SQL portable PostgreSQL; do not migrate to D1 or another database.
- Use `pnpm` for all dependency and script commands.
- Generate or maintain Worker binding types with Wrangler where appropriate.
- Access Worker environment bindings using Astro's supported Cloudflare runtime APIs.
- Store secrets in Cloudflare Worker secrets, never in committed configuration or client-side code.
- Keep local development configuration separate from production secrets.
- Do not add a paid Cloudflare feature or another hosting service without approval.
- Do not assume that a free tier provides unlimited SSR, database, or write capacity.

The deployment must work with the selected Astro 5 and adapter versions. Do not upgrade to Astro 6 or change the major adapter version without approval.

## Performance budgets

- Ordinary HTML: under 15 KB gzipped per page.
- Home page and `/trends`: under 45 KB gzipped, including the inline SVG map.
- CSS: under 6 KB.
- Total client JavaScript: under 3 KB, excluding Cloudflare Turnstile.
- Load Turnstile only on the first interaction with the vote form.
- No client-side hydration framework.
- No unnecessary client-side rendering, polling, animation, or runtime dependencies.
- Pages must remain functional with JavaScript disabled.
- The vote form must use a normal HTML POST and redirect after processing.
- Map regions must be plain links to the corresponding state or UT results pages.
- Prefer native browser capabilities and server-rendered HTML.
- Keep assets small and avoid unnecessary requests.

Measure compressed HTML and CSS against these budgets. Do not silently relax a budget to accommodate a new feature.

## CDN caching and database reads

Every public GET page must return:

`Cache-Control: public, s-maxage=30, stale-while-revalidate=300`

- Public GET responses must be cacheable by the Cloudflare edge.
- Configure and verify Cloudflare Cache Rules or the appropriate Worker caching mechanism so HTML responses are actually cached.
- Do not assume that setting a response header alone guarantees edge caching.
- Never query PostgreSQL on every visitor's page request.
- Serve state results, national aggregates, and trends from cached responses or precomputed data.
- Keep vote submissions separate from cacheable GET routes.
- Never cache POST responses, vote submissions, personalized responses, or responses containing device-specific information.
- Do not cache secrets, raw identifiers, or private vote-processing responses.
- Ensure cache keys are independent of cookies and IP addresses for public results pages.
- Keep public results pages consistent with the latest available aggregate data within the cache freshness policy.
- Purge or revalidate relevant cached results after writes only when necessary and within the performance budget.
- Do not add a polling mechanism to keep results live.

Verify cache headers and actual CDN behavior in production-like testing. If Cloudflare configuration requires a different mechanism to achieve the stated caching policy, explain the difference before changing the requirement.

## Database and SQL

- Use PostgreSQL and `postgres.js` with raw parameterized SQL.
- No ORM, query builder, or alternative database.
- Never interpolate untrusted values into SQL.
- A successful vote must be recorded using one atomic SQL statement.
- Avoid unnecessary round trips and database queries.
- Keep SQL statements readable and explicit.
- Use database constraints and indexes to enforce invariants.
- Use migrations for schema changes; never modify production schema implicitly at runtime.
- Avoid fetching individual vote records when aggregate queries are sufficient.
- Use bounded queries and suitable indexes for state results and trends.
- Use Hyperdrive for connection pooling and efficient connectivity from Workers.
- Follow `postgres.js` and Hyperdrive compatibility requirements; do not disable prepared statements without approval.
- Keep database connection counts and per-request resource usage small.
- Never read the database as part of rendering a public GET request.

## Vote processing

The vote form accepts exactly one choice:

- `satisfied`
- `dissatisfied`

The selected state or UT must be validated against a server-side allowlist.

All validation must happen server-side. Never trust client-side validation, hidden fields, URL parameters, or JavaScript as a security boundary.

A vote request must:

1. Validate the HTTP method and content type.
2. Validate the state code and vote choice.
3. Validate the signed device cookie.
4. Derive and hash the request IP without persisting or logging the raw address.
5. Apply the configured geolocation policy.
6. Verify Turnstile when required by the configured anti-abuse policy.
7. Execute one atomic SQL statement that records the vote only if both duplicate-prevention constraints permit it.
8. Redirect to an appropriate results page using the Post/Redirect/Get pattern.

Use an appropriate redirect status for POST/Redirect/Get. Never return cached vote-processing responses.

Invalid requests, duplicate submissions, rejected geolocation, and failed verification must not create additional votes.

Do not add accounts, comments, free-text submissions, or other user-generated content.

## Duplicate-vote prevention

Product decision: allow at most one vote per state per device and one vote per state per IP identity.

- Generate a cryptographically random device identifier.
- Sign the device cookie using a server-side secret.
- Hash the validated device identifier before storing it.
- Derive an IP identity from the request IP.
- Reduce IPv6 addresses to their `/64` network before deriving the IP identity.
- Hash the resulting IP identity with a server-side keyed hash.
- Use unique database indexes for `(state_code, device_hash)` and `(state_code, ip_hash)`.
- Enforce both constraints atomically in the database.
- If either uniqueness constraint conflicts, do not record a second vote.
- Do not trust a client-supplied IP address or device identifier.
- Never store or log raw IP addresses.
- Never expose hashes, cookie values, or vote-level identifiers in public responses.

Use a cryptographically secure secret for signatures and keyed hashing. Do not reuse a public constant or hard-code secrets.

The database operation must correctly handle conflicts against either unique index without partial or inconsistent writes.

## Geolocation and request metadata

Use Cloudflare request metadata rather than Vercel-specific headers.

- Obtain the visitor's approximate country and region from Cloudflare's request metadata, using the supported Worker runtime API.
- Use the Cloudflare country and region information to populate `geo_state` and `geo_match`.
- Derive the actual request IP from the trusted platform-provided client IP header, not an arbitrary forwarded header.
- Hash the IP immediately for duplicate prevention; never persist or log its raw value.
- Validate state or region codes against a server-side mapping of supported Indian states and UTs.
- Handle missing, unknown, or ambiguous geolocation without crashing.

Configure `GEO_MODE` as follows:

- `flag` — default; record the available geolocation match information without rejecting a vote based on location.
- `country` — reject votes when the detected country is not India or cannot be established as India.
- `state` — apply the country check and reject votes when the detected state differs from the selected state.

The geolocation policy must be enforced server-side.

Geolocation is approximate. Never describe it as verified residency, citizenship, or proof that a voter lives in a state.

Do not assume Vercel-specific `x-vercel-*` headers exist on Cloudflare.

## Privacy and data minimization

Store only the following vote-related fields:

- `state_code`
- `device_hash`
- `ip_hash`
- `choice`
- `geo_state`
- `geo_match`
- `created_at`

Use the minimum additional database metadata required for integrity and operational correctness. Ask before introducing any new personal-data field.

- No user accounts or profiles.
- No raw IP addresses.
- No raw device identifiers.
- No request-body logging.
- No third-party analytics or tracking pixels.
- No unnecessary cookies.
- No public endpoint exposing individual vote records.
- No unnecessary request logs containing identifiers or sensitive data.
- No third-party services beyond the explicitly approved stack and Turnstile.

Use secure cookie attributes appropriate to the deployment, including `HttpOnly`, `Secure` in production, and an appropriate `SameSite` policy.

Do not claim that hashing makes identifiers anonymous. Keep retention and deletion requirements explicit rather than inventing a retention period.

## India map: official boundary requirement

The map must follow the Survey of India's official depiction of India, consistent with the applicable Geospatial Information Regulation Act, 2016 requirements.

- Never source map boundaries from Natural Earth, GADM, OpenStreetMap, Google, or Mapbox.
- Never redraw, simplify, distort, or alter official outlines.
- Never substitute a convenient open-source boundary file.
- Preserve approved source geometry and provenance.
- Use inline SVG and handwritten TypeScript/CSS rather than a mapping library.
- Make each state or UT an accessible link to its results page.
- Provide accessible labels and text-based results independently of the map.

**Do not implement, generate, or approximate the map boundaries until the approved Survey of India boundary file has been supplied. Ask the project owner for the approved boundary file if it is unavailable.**

Do not infer legal approval from the fact that a file is publicly accessible.

## Map colours and statistical presentation

Use a diverging scale:

- Blue for a satisfied majority.
- Red for a dissatisfied majority.
- Neutral treatment at exactly 50% satisfied and 50% dissatisfied.
- Grey hatching for states or UTs with fewer than `MIN_RESPONSES`.

Colour must never be the only carrier of meaning.

Always provide numerical percentages and response counts in accessible text, including for map regions.

- Define and validate `MIN_RESPONSES`.
- Do not present low-response results as reliable population estimates.
- Display a clear low-sample indicator wherever the threshold is not met.
- Do not invent missing data or imply that a state with no responses has a 0% satisfaction rate.
- Ensure contrast, labels, focus states, and non-colour cues remain accessible.

## Results and trends

Every results view must display:

- Total responses.
- Percentage satisfied.
- Percentage dissatisfied.
- Last-updated time.
- The methodology note:

  "These results reflect voluntary online responses and are not representative of the state's population."

The same methodology must apply to national, state/UT, map, and trend views.

- Calculate percentages consistently from valid recorded responses.
- Handle zero responses without division-by-zero errors.
- Use a consistent timestamp policy and present times in a clearly identified timezone.
- Never imply causal relationships from trends alone.
- Do not claim statistical representativeness.
- Keep trend queries bounded and indexed.
- Do not add chart libraries; use accessible HTML tables, inline SVG, and lightweight native elements.

## Neutrality and content

- Maintain a neutral, non-partisan tone.
- Do not include political party names, symbols, slogans, or inflammatory copy.
- Do not introduce persuasive political messaging.
- Do not label results as endorsements or election forecasts.
- Use consistent wording for satisfied and dissatisfied responses.
- Explain methodology and limitations clearly.
- Keep the interface focused on civic feedback rather than political advocacy.

## Accessibility and mobile performance

- Mobile-first design.
- Semantic HTML and accessible form controls.
- WCAG AA contrast.
- Visible keyboard focus.
- Explicit labels for every form input.
- Accessible names for interactive SVG regions.
- Keyboard-accessible map navigation.
- A text/table alternative to map-based information.
- Respect reduced-motion preferences if motion is introduced.
- Work on low-end phones and slow 3G connections.
- No dependence on JavaScript for basic navigation or vote-form submission.
- Never rely on colour alone to communicate results.
- Do not introduce web fonts, large assets, or unnecessary network requests.

## Security and anti-abuse

- Treat every request as untrusted.
- Use server-side validation and parameterized SQL.
- Verify signed cookies cryptographically.
- Validate Turnstile tokens server-side when required.
- Load Turnstile only on first interaction with the vote form.
- Keep secrets out of client bundles and source control.
- Apply appropriate request-method, origin/CSRF, and content-type checks to vote submissions.
- Never treat a client-side challenge or validation result as authoritative.
- Avoid verbose production error responses.
- Do not log raw IPs, cookie contents, secrets, or vote identifiers.
- Keep abuse controls compatible with the requirement for one atomic SQL statement per vote.

The vote form must remain a normal POST form. Do not introduce client-side JavaScript as a prerequisite for navigation or form submission. If an anti-abuse change would make voting impossible without JavaScript, explain the conflict and ask before changing the product requirements.

## Configuration

Use environment bindings and secrets supported by Cloudflare Workers.

Expected application configuration includes:

- `GEO_MODE`, defaulting to `flag`.
- `MIN_RESPONSES`.
- A PostgreSQL connection through the Cloudflare Hyperdrive binding.
- Server-side secrets for signing device cookies and keyed IP hashing.
- Turnstile site and secret configuration, where applicable.

Keep public configuration separate from secrets. Validate required configuration at startup or at a controlled initialization boundary without querying the database on every GET request.

Do not commit real credentials, production secrets, or local secret files.

Document any additional environment variables before introducing them.

## Testing requirements

Tests must cover:

- Valid satisfied and dissatisfied votes.
- Invalid state codes and choices.
- Missing or invalid device cookies.
- Duplicate votes by device.
- Duplicate votes by IP.
- IPv4 and IPv6 `/64` normalization.
- Unique-index conflicts against either constraint.
- Atomic vote insertion.
- All `GEO_MODE` values.
- Missing and ambiguous geolocation.
- Turnstile validation and failure cases.
- Zero-response and low-response states.
- Correct aggregate percentages and totals.
- Cache headers and redirects.
- No database access on public GET page renders.
- Accessibility and no-JavaScript navigation/form behaviour.
- Production Worker and Hyperdrive configuration compatibility.

Use mocks or isolated test databases as appropriate. Never run destructive tests against production data.

## Required workflow after every task

After each implementation task:

1. Run the TypeScript typecheck.
2. Run the test suite.
3. Run the production build.
4. Fix failures introduced by the change.
5. Summarize the work in five lines or fewer.

Use the repository's existing scripts where available. If a required script does not exist, report that fact rather than claiming it passed.

Before adding a dependency, changing a product requirement, changing the schema, or introducing a new service, ask for approval.

## Engineering principles

- Keep code small, explicit, and boring.
- Prefer deleting code to adding abstractions.
- Do not over-engineer.
- Avoid speculative features and unnecessary dependencies.
- Preserve all established privacy, performance, and product constraints.
- Do not silently replace unavailable services or requirements with alternatives.
- If a requirement conflicts with Cloudflare's runtime, caching behaviour, or security model, explain the conflict and ask before changing it.
