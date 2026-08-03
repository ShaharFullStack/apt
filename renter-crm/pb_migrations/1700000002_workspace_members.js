/// <reference path="../pb_data/types.d.ts" />
// Junction table: who belongs to which workspace. Everything else's API rules
// check membership by walking back through this collection, e.g.
// `workspace.workspace_members_via_workspace.user ?= @request.auth.id`.
//
// Only the owner can insert their own first row here (right after creating
// the workspace) — everyone else joins through the /api/join hook, which
// writes directly at the app level and so isn't subject to createRule at all.
migrate((app) => {
  const workspaces = app.findCollectionByNameOrId("workspaces");

  const collection = new Collection({
    type: "base",
    name: "workspace_members",
    listRule: "user = @request.auth.id || workspace.owner = @request.auth.id",
    viewRule: "user = @request.auth.id || workspace.owner = @request.auth.id",
    createRule: "user = @request.auth.id && workspace.owner = @request.auth.id",
    updateRule: null,
    deleteRule: "workspace.owner = @request.auth.id",
    fields: [
      {
        name: "workspace",
        type: "relation",
        required: true,
        collectionId: workspaces.id,
        maxSelect: 1,
        cascadeDelete: true,
      },
      {
        name: "user",
        type: "relation",
        required: true,
        collectionId: "_pb_users_auth_",
        maxSelect: 1,
        cascadeDelete: true,
      },
      { name: "role", type: "select", required: true, maxSelect: 1, values: ["owner", "member"] },
      { name: "created", type: "autodate", onCreate: true },
    ],
    indexes: [
      "CREATE UNIQUE INDEX idx_workspace_members_unique ON workspace_members (workspace, user)",
    ],
  });
  return app.save(collection);
}, (app) => {
  const collection = app.findCollectionByNameOrId("workspace_members");
  return app.delete(collection);
});
