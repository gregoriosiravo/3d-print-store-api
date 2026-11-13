export const REQUIRED_ADDRESS_FIELDS = [
  "firstName",
  "lastName",
  "address",
  "city",
  "zip",
  "country",
] as const;

// True when every required field is a non-empty string
export function hasAddressFields(body: unknown): boolean {
  if (!body || typeof body !== "object") return false;
  const fields = body as Record<string, unknown>;
  return REQUIRED_ADDRESS_FIELDS.every(
    (field) => typeof fields[field] === "string" && fields[field].trim() !== "",
  );
}
