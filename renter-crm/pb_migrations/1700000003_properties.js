/// <reference path="../pb_data/types.d.ts" />
// A candidate apartment inside a workspace. Cost fields are nullable on
// purpose — a missing arnona/vaad must never silently become 0 in the
// frontend's cost calculator (see the spec's "עלות חלקית" flag).
migrate((app) => {
  const workspaces = app.findCollectionByNameOrId("workspaces");
  const membershipRule = "workspace.workspace_members_via_workspace.user ?= @request.auth.id";

  const collection = new Collection({
    type: "base",
    name: "properties",
    listRule: membershipRule,
    viewRule: membershipRule,
    createRule: membershipRule,
    updateRule: membershipRule,
    deleteRule: membershipRule,
    fields: [
      {
        name: "workspace",
        type: "relation",
        required: true,
        collectionId: workspaces.id,
        maxSelect: 1,
        cascadeDelete: true,
      },
      { name: "title", type: "text", max: 160 },
      { name: "address", type: "text", max: 240 },
      { name: "rooms", type: "number" },
      { name: "floor", type: "number" },
      { name: "rent", type: "number" },
      { name: "arnona", type: "number" },
      { name: "vaad_bayit", type: "number" },
      { name: "parking_est", type: "number" },
      {
        name: "status",
        type: "select",
        required: true,
        maxSelect: 1,
        values: ["checking", "strong", "offer_submitted", "rejected"],
      },
      {
        name: "created_by",
        type: "relation",
        collectionId: "_pb_users_auth_",
        maxSelect: 1,
        cascadeDelete: false,
      },
      { name: "created", type: "autodate", onCreate: true },
      { name: "updated", type: "autodate", onCreate: true, onUpdate: true },
    ],
  });
  return app.save(collection);
}, (app) => {
  const collection = app.findCollectionByNameOrId("properties");
  return app.delete(collection);
});
