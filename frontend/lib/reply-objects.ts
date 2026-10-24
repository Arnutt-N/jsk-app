import type { ReplyObjectFormData } from "@/components/admin/ReplyObjectForm";

export interface ReplyObjectLike {
  object_id: string;
  name: string;
  category?: string | null;
  object_type: string;
  payload: unknown;
  alt_text?: string | null;
}

/** Shared list/edit transform: stored object -> form initial values. */
export function replyObjectToForm(obj: ReplyObjectLike): ReplyObjectFormData {
  const p = obj.payload;
  const isPlain = p !== null && typeof p === "object" && !Array.isArray(p);
  return {
    object_id: obj.object_id,
    name: obj.name,
    category: obj.category || "",
    object_type: obj.object_type,
    payload: isPlain ? JSON.stringify(p, null, 2) : p ? JSON.stringify(p, null, 2) : "{}",
    alt_text: obj.alt_text || "",
  };
}

/** Shared save transform: form values -> API payload (throws on bad JSON). */
export function formToPayload(data: ReplyObjectFormData): unknown {
  return JSON.parse(data.payload);
}
