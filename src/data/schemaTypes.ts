export type FieldType = "String" | { Array: "String" };

export type SchemaDefinition = {
  name: string;
  owner_app_id: string;
  descriptive_name: string;
  purpose_statement: string;
  schema_type: "Hash";
  key: { hash_field: string };
  fields: string[];
  field_types: Record<string, FieldType>;
  field_descriptions: Record<string, string>;
  field_classifications?: Record<string, string[]>;
  field_data_classifications: Record<
    string,
    { sensitivity_level: number; data_domain: string }
  >;
};

export type AppSchemaDeclaration = {
  app_id: string;
  schema: string;
  canonical: string;
  resolution: "mint" | "link" | string;
  decision?: "mint" | "link" | string;
};
