/// <reference path="../pb_data/types.d.ts" />
//
// POST /api/join  { code: string }  →  { id, name }
//
// The one place in this app that genuinely needs custom server logic instead
// of a plain collection rule: a brand-new user has no workspace_members row
// yet, so they can't satisfy the membership-gated listRule on `workspaces` to
// even look up a workspace by its invite_code — that's the whole
// chicken-and-egg problem an invite link exists to solve. This route runs at
// the app level (not subject to any collection API rule) so it can safely
// resolve the code and create the membership row in one place, without ever
// exposing the full workspaces list to someone who doesn't have the code.
//
// NOTE: written against PocketBase's current (v0.23+) JS hooks API
// (routerAdd callback takes a single event `e` with `e.app` / `e.auth` /
// `e.requestInfo()`). This could not be tested against a live PocketBase
// instance in the sandbox this was authored in (outbound access to
// github.com is blocked by org policy there, so the binary couldn't be
// downloaded) — if `pocketbase serve` logs an error pointing at this file on
// startup, check the JSVM Overview page for your installed version's exact
// event/app method names and adjust here.
routerAdd("POST", "/api/join", (e) => {
  if (!e.auth) {
    throw new ForbiddenError("יש להתחבר לפני הצטרפות לתסקיר");
  }

  const body = e.requestInfo().body;
  const code = (body.code || "").trim();
  if (!code) {
    throw new BadRequestError("חסר קוד הזמנה");
  }

  let workspace;
  try {
    workspace = e.app.findFirstRecordByFilter("workspaces", "invite_code = {:code}", { code });
  } catch (err) {
    throw new NotFoundError("קוד ההזמנה לא נמצא");
  }

  const existing = e.app.findFirstRecordByFilter(
    "workspace_members",
    "workspace = {:workspace} && user = {:user}",
    { workspace: workspace.id, user: e.auth.id }
  );

  if (!existing) {
    const collection = e.app.findCollectionByNameOrId("workspace_members");
    const membership = new Record(collection, {
      workspace: workspace.id,
      user: e.auth.id,
      role: "member",
    });
    e.app.save(membership);
  }

  e.json(200, { id: workspace.id, name: workspace.name });
});
