/// <reference path="../pb_data/types.d.ts" />
// Append-only visit log: each toggle in the on-site checklist is its own row,
// never overwritten. This is what the shared Activity Feed merges live from
// (alongside properties/property_ratings/workspace_members) — there is no
// separate activity_log table by design, see the spec.
migrate((app) => {
  const properties = app.findCollectionByNameOrId("properties");
  const rule = "property.workspace.workspace_members_via_workspace.user ?= @request.auth.id";

  const collection = new Collection({
    type: "base",
    name: "inspection_logs",
    listRule: rule,
    viewRule: rule,
    createRule: `user = @request.auth.id && ${rule}`,
    updateRule: null,
    deleteRule: null,
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
      {
        name: "checklist_item",
        type: "select",
        required: true,
        maxSelect: 1,
        values: [
          "water_pressure", "sockets", "ac",
          "natural_light", "street_noise", "windows_blinds",
          "dampness", "cracks",
        ],
      },
      { name: "status", type: "select", required: true, maxSelect: 1, values: ["good", "bad", "na"] },
      {
        name: "photo",
        type: "file",
        maxSelect: 1,
        maxSize: 8388608,
        mimeTypes: ["image/jpeg", "image/png", "image/webp"],
        thumbs: ["100x100", "480x0"],
      },
      { name: "created", type: "autodate", onCreate: true },
    ],
  });
  return app.save(collection);
}, (app) => {
  const collection = app.findCollectionByNameOrId("inspection_logs");
  return app.delete(collection);
});
