/// <reference path="../pb_data/types.d.ts" />
// One row per (property, user) — each person's own sliders. Everyone in the
// workspace can VIEW every row (needed to compute the group consensus score
// client-side), but can only create/update their OWN row.
migrate((app) => {
  const properties = app.findCollectionByNameOrId("properties");
  const viewRule = "property.workspace.workspace_members_via_workspace.user ?= @request.auth.id";

  const collection = new Collection({
    type: "base",
    name: "property_ratings",
    listRule: viewRule,
    viewRule: viewRule,
    createRule: `user = @request.auth.id && ${viewRule}`,
    updateRule: "user = @request.auth.id",
    deleteRule: "user = @request.auth.id",
    fields: [
      {
        name: "property",
        type: "relation",
        required: true,
        collectionId: properties.id,
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
      { name: "price_score", type: "number", min: 1, max: 10 },
      { name: "location_score", type: "number", min: 1, max: 10 },
      { name: "condition_score", type: "number", min: 1, max: 10 },
      { name: "is_dealbreaker", type: "bool" },
      { name: "notes", type: "text", max: 2000 },
      { name: "created", type: "autodate", onCreate: true },
      { name: "updated", type: "autodate", onCreate: true, onUpdate: true },
    ],
    indexes: [
      "CREATE UNIQUE INDEX idx_property_ratings_unique ON property_ratings (property, user)",
    ],
  });
  return app.save(collection);
}, (app) => {
  const collection = app.findCollectionByNameOrId("property_ratings");
  return app.delete(collection);
});
