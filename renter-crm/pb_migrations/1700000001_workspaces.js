/// <reference path="../pb_data/types.d.ts" />
// Household workspace: one per couple/family/roommate group.
// invite_code is the entire access-control model — anyone who has it can join.
// Rotating it (a plain field update, owner-only) invalidates old shared links.
migrate((app) => {
  const collection = new Collection({
    type: "base",
    name: "workspaces",
    listRule: "workspace_members_via_workspace.user ?= @request.auth.id",
    viewRule: "workspace_members_via_workspace.user ?= @request.auth.id",
    createRule: "@request.auth.id != '' && owner = @request.auth.id",
    updateRule: "owner = @request.auth.id",
    deleteRule: "owner = @request.auth.id",
    fields: [
      { name: "name", type: "text", required: true, max: 120 },
      { name: "invite_code", type: "text", required: true, max: 32 },
      {
        name: "owner",
        type: "relation",
        required: true,
        collectionId: "_pb_users_auth_",
        maxSelect: 1,
        cascadeDelete: false,
      },
      { name: "created", type: "autodate", onCreate: true },
      { name: "updated", type: "autodate", onCreate: true, onUpdate: true },
    ],
    indexes: [
      "CREATE UNIQUE INDEX idx_workspaces_invite_code ON workspaces (invite_code)",
    ],
  });
  return app.save(collection);
}, (app) => {
  const collection = app.findCollectionByNameOrId("workspaces");
  return app.delete(collection);
});
