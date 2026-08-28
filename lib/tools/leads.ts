import { z } from "zod";
import { formatVantageApiResult, vantageApi } from "../vantage-api";

export const MOVE_SIZES = [
  "Studio",
  "1 Bedroom",
  "2 Bedrooms",
  "3 Bedrooms",
  "4 Bedrooms",
  "5+ Bedrooms",
  "Office",
] as const;

export const leadKindSchema = z.enum(["form", "call"]);
export type LeadKind = z.infer<typeof leadKindSchema>;

const optionalString = z.string().trim().min(1).optional();

function leadPaths(kind: LeadKind) {
  return kind === "form"
    ? {
        collection: "/api/v1/form-leads",
        search: "/api/v1/form-leads/search",
      }
    : {
        collection: "/api/v1/call-leads",
        search: "/api/v1/call-leads/search",
      };
}

function hasLeadName(value: {
  name?: string;
  first_name?: string;
  last_name?: string;
}) {
  return Boolean(value.name || value.first_name || value.last_name);
}

export const listLeadsInputSchema = z
  .object({
    kind: leadKindSchema,
    q: optionalString,
    source_company: optionalString,
    name: optionalString,
    email: optionalString,
    phone_number: optionalString,
    job_no: optionalString,
    booked: z.boolean().optional(),
    cancelled: z.boolean().optional(),
    limit: z.number().int().min(1).max(100).optional(),
    skip: z.number().int().min(0).optional(),
  })
  .strict();

export const getLeadInputSchema = z
  .object({
    kind: leadKindSchema,
    id: z.string().trim().min(1),
  })
  .strict();

export const searchLeadsInputSchema = z
  .object({
    kind: leadKindSchema,
    ref_no: optionalString,
    name: optionalString,
    first_name: optionalString,
    last_name: optionalString,
    email: optionalString,
    phone_number: optionalString,
    job_no: optionalString,
    limit: z.number().int().min(1).max(25).optional(),
    include_duplicates: z.boolean().optional(),
  })
  .strict()
  .refine(
    (value) =>
      Boolean(
        value.ref_no ||
          value.name ||
          value.first_name ||
          value.last_name ||
          value.email ||
          value.phone_number ||
          value.job_no,
      ),
    "Provide at least one identity field to search",
  );

export const createLeadInputSchema = z
  .object({
    kind: leadKindSchema,
    name: optionalString,
    first_name: optionalString,
    last_name: optionalString,
    phone_number: optionalString,
    email: optionalString,
    source_company: optionalString,
    pickup_zip: z.string().regex(/^\d{5}$/).optional(),
    destination_zip: z.string().regex(/^\d{5}$/).optional(),
    delivery_zip: z.string().regex(/^\d{5}$/).optional(),
    move_size: z.enum(MOVE_SIZES).optional(),
    job_no: optionalString,
    post_to_granot: z.boolean().optional(),
    body: z.record(z.string(), z.unknown()).optional(),
  })
  .loose()
  .superRefine((value, ctx) => {
    if (value.kind === "form") {
      if (!hasLeadName(value)) {
        ctx.addIssue({
          code: "custom",
          message: "Form leads require name, first_name, or last_name",
        });
      }
      if (!value.phone_number) {
        ctx.addIssue({
          code: "custom",
          path: ["phone_number"],
          message: "Form leads require phone_number",
        });
      }
      if (!value.pickup_zip) {
        ctx.addIssue({
          code: "custom",
          path: ["pickup_zip"],
          message: "Form leads require pickup_zip",
        });
      }
      if (!value.destination_zip) {
        ctx.addIssue({
          code: "custom",
          path: ["destination_zip"],
          message: "Form leads require destination_zip",
        });
      }
      if (!value.move_size) {
        ctx.addIssue({
          code: "custom",
          path: ["move_size"],
          message: "Form leads require move_size",
        });
      }
    } else if (!value.phone_number && !value.job_no) {
      ctx.addIssue({
        code: "custom",
        message: "Call leads require phone_number or job_no",
      });
    }
  });

export const updateLeadInputSchema = z
  .object({
    kind: leadKindSchema,
    id: z.string().trim().min(1),
    patch: z.record(z.string(), z.unknown()).refine(
      (value) => Object.keys(value).length > 0,
      "patch must include at least one field",
    ),
  })
  .strict();

export const deleteLeadInputSchema = z
  .object({
    kind: leadKindSchema,
    id: z.string().trim().min(1),
    confirm: z.literal(true),
    cascade: z.boolean().optional(),
  })
  .strict();

function omitKind(input: Record<string, unknown>) {
  const { kind: _kind, body, ...rest } = input;
  return { ...((body && typeof body === "object" ? body : {}) as object), ...rest };
}

export async function listLeads(input: z.infer<typeof listLeadsInputSchema>) {
  const { kind, ...query } = input;
  return formatVantageApiResult(
    await vantageApi({
      method: "GET",
      path: leadPaths(kind).collection,
      query,
    }),
  );
}

export async function getLead(input: z.infer<typeof getLeadInputSchema>) {
  return formatVantageApiResult(
    await vantageApi({
      method: "GET",
      path: `${leadPaths(input.kind).collection}/${input.id}`,
    }),
  );
}

export async function searchLeads(input: z.infer<typeof searchLeadsInputSchema>) {
  const { kind, ...body } = input;
  return formatVantageApiResult(
    await vantageApi({
      method: "POST",
      path: leadPaths(kind).search,
      body,
    }),
  );
}

export async function createLead(input: z.infer<typeof createLeadInputSchema>) {
  return formatVantageApiResult(
    await vantageApi({
      method: "POST",
      path: leadPaths(input.kind).collection,
      body: omitKind(input),
    }),
  );
}

export async function updateLead(input: z.infer<typeof updateLeadInputSchema>) {
  return formatVantageApiResult(
    await vantageApi({
      method: "PATCH",
      path: `${leadPaths(input.kind).collection}/${input.id}`,
      body: input.patch,
    }),
  );
}

export async function deleteLead(input: z.infer<typeof deleteLeadInputSchema>) {
  return formatVantageApiResult(
    await vantageApi({
      method: "DELETE",
      path: `${leadPaths(input.kind).collection}/${input.id}`,
      query: input.cascade ? { cascade: true } : undefined,
    }),
  );
}
