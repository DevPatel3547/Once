# Once release status — September 15, 2026

## Completed in this continuation

- Recovered the Once project from “Big Tech Interview Strategy” and cloned `DevPatel3547/Once` to the local machine. GitHub metadata confirms the repository is private.
- Installed the existing locked dependency set. Added standard test/typecheck scripts and GitHub Actions verification.
- Fixed screenshot timing safety: the recorder compares page revisions, viewport dimensions, and privacy-mask geometry before and after capture. Changed or uninspectable pages preserve a text-only step instead of retaining a potentially mis-masked image.
- Added two behavioral regressions for page changes and moving privacy masks. The suite now has 15 tests.
- Prepared extension 0.3.0. Packaging accepts one explicit editor origin, updates both entry points, produces a deterministic ZIP and an unpacked folder, and requires HTTPS for release packages. Removed the previous personally named editor URL from extension source and rebuilt the development ZIP.
- Fixed standalone database migration configuration and added environment-configurable Worker, D1, and R2 names/IDs.
- Fixed existing lint errors involving navigation, a render-time ref update, synchronous save-state updates in an effect, and a test module variable.
- Added a release preparation command that verifies tests and target bindings without deploying.

## Automated validation

- All 15 tests passed.
- TypeScript check and production build passed.
- ESLint passed with zero errors; seven existing warnings remain (local data-image rendering and intentionally unused or mock values).

## Observed browser checks

On Chrome with the local editor at localhost:5173:

- Created the example guide, renamed it “Once release QA,” edited a step, reordered steps, and opened preview.
- Confirmed the edited guide and step order persisted after the development server reloaded.
- Downloaded standalone HTML and checked the actual file contained the saved title and reordered steps, with no script tags.
- Created an encrypted share using local D1/R2 emulation.
- Opened that link in the separate Codex browser and verified all three steps decrypted and rendered.
- Reopened the saved owner guide, revoked the link, and verified the recipient then saw “This link has expired or was revoked.”

These checks validate the editor and local sharing implementation. They do not establish production-host performance, extension capture rendering, store approval, or real-user adoption.

## Remaining blockers and work

- Cloudflare dashboard and Wrangler were signed out. Google sign-in reached the owner's passkey verification screen; the owner must complete that challenge. No Cloudflare resources or public hostname have been created here.
- Browser automation explicitly blocks `chrome://extensions`. The owner was asked to load `/Users/overse/Documents/Once/.sites-runtime/extension` manually. Actual extension capture, permission prompts, service-worker restart, and cold editor handoff remain unverified.
- The checked-in ZIP targets localhost for development. Rebuild it for the verified neutral public origin before distribution.
- Public support inbox and brand store/marketing account availability remain unverified. Do not put personal account links in public launch assets.
- The privacy page still accurately describes the owner-only beta; update its availability and real support contact when public hosting is ready.
- Chrome Web Store submission, required registration/payment, actual store screenshots, approval, demo recording, and marketing publication remain outstanding. The existing launch drafts are preserved; nothing has been posted.
- No purchases or paid subscriptions were made.

Follow `DEPLOYMENT.md` for the remaining deployment commands, then complete `RELEASE_GATES.md`. Do not describe the project as fully launched until these checks are actually complete.
