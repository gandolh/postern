# Routing profile: Postern

Read by the `orchestrate` skill at the start of a work request.

## Skill choices

| Purpose | Skill |
|---|---|
| Implement | `plan-split-dispatch` |
| Capture | `corpus-flow` |
| Query knowledge | `corpus-flow` §5 |
| Design / UI | `impeccable`, keeping the Gmail-familiar layout in [wiki/design.md](wiki/design.md) |
| Browser checks | `ui-test-plans` once the web app exists |
| Review | `code-review`; `security-review` for anything touching message rendering or tokens |
| Pre-PR | none (single-user repo) |

## Intent table

| The user says | Route to |
|---|---|
| "add a todo", "note this for later" | `corpus-flow` §1 |
| "let's build brief NN" | `corpus-flow` §3, then `plan-split-dispatch` |
| "what does the wiki say about X" | `corpus-flow` §5 |
| "grill me", "stress-test this design" | `grill-me` |
| "make it look better", "polish the inbox" | `impeccable` |
| "deploy it" | brief 18's owner steps; the deploy itself runs from `../vps-deploy` |

## READ / SKIP / SKILLS

| Always READ | Always SKIP | Load SKILL |
|---|---|---|
| [index.md](index.md) | `node_modules/`, `dist/`, `dev-dist/` | `corpus-flow` for any capture or completion |
| [wiki/status.md](wiki/status.md) | lockfiles, `dev/data/` | `plan-split-dispatch` for 3 or more independent chunks |
| [wiki/glossary.md](wiki/glossary.md) | `briefs/` wholesale | `impeccable` for visual or UX work |
| [CLAUDE.md](CLAUDE.md) hard rules | | `grill-me` before a new subsystem |

## Knowledge routing

| Question shape | Layer | Why |
|---|---|---|
| "Why is it built this way?" | `wiki/` | The corpus is the why. |
| "How does Postern talk to Stalwart?" | [wiki/architecture.md](wiki/architecture.md) | Owns JMAP, the proxy path and push. |
| "Is this safe to render / store?" | [wiki/security.md](wiki/security.md) | Owns the sandbox and token rules. |
| "How do sign-in and the session work?" | [wiki/sign-in.md](wiki/sign-in.md) | Owns Stalwart's sign-in endpoints, refresh and the session a reload keeps. |
| "How is a message body rendered?" | [wiki/rendering.md](wiki/rendering.md) | Owns the sanitiser and the frame as built. |
| "What does the Gmail feature map to in JMAP?" | [wiki/gmail-on-jmap.md](wiki/gmail-on-jmap.md) | Owns the feature mapping. |
| "Where does feature Y live?" | `grep` | Structural. Never ask the wiki. |
| "Did I get every usage?" | `grep -rnw` | Completeness needs exhaustive search. |
| "Does the client handle this JMAP response?" | the tests | Behaviour is verified, not remembered. |

**Code graph:** not installed. Revisit once the app passes about 20k lines.
