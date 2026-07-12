import type { SchemaDefinition } from "./schemaTypes";

export const DOGFOOD_GRAPH_APP_ID = "dogfood-graph";

const text = "String" as const;
const textList = { Array: "String" } as const;

function data(fieldNames: readonly string[]) {
  return Object.fromEntries(
    fieldNames.map((field) => [
      field,
      { sensitivity_level: 1, data_domain: "dogfood-graph" },
    ]),
  );
}

function descriptions(fieldNames: readonly string[]) {
  return Object.fromEntries(
    fieldNames.map((field) => [field, field.replaceAll("_", " ")]),
  );
}

function schema(
  name: string,
  purpose: string,
  fields: readonly string[],
  fieldTypes: Record<string, typeof text | typeof textList> = {},
  keyField = `${name[0].toLowerCase()}${name.slice(1)}_id`,
): SchemaDefinition {
  return {
    name,
    owner_app_id: DOGFOOD_GRAPH_APP_ID,
    descriptive_name: name,
    purpose_statement: purpose,
    schema_type: "Hash",
    key: { hash_field: keyField },
    fields: [...fields],
    field_types: Object.fromEntries(
      fields.map((field) => [field, fieldTypes[field] ?? text]),
    ),
    field_descriptions: descriptions(fields),
    field_classifications: {
      title: ["word"],
      summary: ["word"],
      notes: ["word"],
      intent: ["word"],
    },
    field_data_classifications: data(fields),
  };
}

export const dogfoodSchemas = {
  DogfoodFlow: schema(
    "DogfoodFlow",
    "A product area, feature, or release gate being dogfooded.",
    [
      "dogfoodFlow_id",
      "title",
      "scope",
      "owner",
      "status",
      "current_goal_revision_id",
      "tags",
    ],
    { tags: textList },
  ),
  GoalRevision: schema(
    "GoalRevision",
    "An immutable snapshot of an intended UX DAG.",
    [
      "goalRevision_id",
      "flow_id",
      "base_revision_id",
      "created_at",
      "created_by",
      "change_summary",
      "goal_state",
      "entry_node_ids",
      "terminal_node_ids",
    ],
    { entry_node_ids: textList, terminal_node_ids: textList },
  ),
  UxNode: schema(
    "UxNode",
    "A user-visible screen, action point, choice, system state, or terminal state.",
    [
      "uxNode_id",
      "goal_revision_id",
      "node_type",
      "title",
      "expected_state",
      "expected_action",
      "expected_result",
      "acceptance_checks",
      "failure_modes",
      "copy_expectations",
      "data_expectations",
      "ux_notes",
      "loop_allowed",
      "requires_rig",
    ],
    { acceptance_checks: textList, failure_modes: textList },
  ),
  UxEdge: schema(
    "UxEdge",
    "A user option or automatic transition between UX nodes.",
    [
      "uxEdge_id",
      "goal_revision_id",
      "from_node_id",
      "to_node_id",
      "trigger_type",
      "label",
      "condition",
      "expected_latency",
      "priority",
    ],
  ),
  DogfoodSession: schema(
    "DogfoodSession",
    "A human dogfood run against one goal revision.",
    [
      "dogfoodSession_id",
      "flow_id",
      "goal_revision_id",
      "started_at",
      "ended_at",
      "dogfooder",
      "environment",
      "path_intent",
      "status",
      "summary",
    ],
  ),
  Observation: schema(
    "DogfoodObservation",
    "Evidence for what was actually seen at one point in a session.",
    [
      "observation_id",
      "session_id",
      "expected_node_id",
      "actual_title",
      "actual_state",
      "actual_action",
      "actual_result",
      "selected_edge_id",
      "actual_next_node_label",
      "verdict",
      "notes",
      "captured_at",
    ],
    {},
    "observation_id",
  ),
  ScreenshotAsset: schema(
    "ScreenshotAsset",
    "Image evidence attached to an observation without hydrating bytes in every query.",
    [
      "screenshotAsset_id",
      "observation_id",
      "asset_ref",
      "mime_type",
      "width",
      "height",
      "byte_size",
      "captured_at",
      "redaction_state",
      "caption",
    ],
  ),
  ScreenshotAnnotation: schema(
    "ScreenshotAnnotation",
    "Non-destructive visual annotation metadata for screenshot evidence.",
    [
      "screenshotAnnotation_id",
      "screenshot_id",
      "shape",
      "geometry",
      "label",
      "body",
      "severity",
      "linked_expected_check",
    ],
  ),
  DiffItem: schema(
    "DiffItem",
    "A generated expected-vs-actual delta for a dogfood session.",
    [
      "diffItem_id",
      "session_id",
      "goal_revision_id",
      "category",
      "expected_ref",
      "observation_id",
      "severity",
      "summary",
      "suggested_next_action",
      "screenshot_ids",
    ],
    { screenshot_ids: textList },
  ),
  DagChangeProposal: schema(
    "DagChangeProposal",
    "A user-authored proposal that compiles into structured DAG operations.",
    [
      "dagChangeProposal_id",
      "flow_id",
      "base_goal_revision_id",
      "author",
      "created_at",
      "intent",
      "ops",
      "status",
      "result_goal_revision_id",
    ],
  ),
} as const;

export type DogfoodSchemaName = keyof typeof dogfoodSchemas;

export const dogfoodSchemaList = Object.values(dogfoodSchemas);
