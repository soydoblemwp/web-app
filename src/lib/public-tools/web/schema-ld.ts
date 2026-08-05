import { z } from "zod";

export type SchemaTypeId =
  | "Organization"
  | "LocalBusiness"
  | "WebSite"
  | "WebPage"
  | "Article"
  | "BlogPosting"
  | "Product"
  | "SoftwareApplication"
  | "FAQPage"
  | "BreadcrumbList"
  | "Person"
  | "Event";

export interface SchemaFieldDef {
  key: string;
  label: string;
  kind: "text" | "url" | "date" | "textarea" | "list" | "faq-list" | "breadcrumb-list";
  required: boolean;
  help: string;
}

export interface SchemaTypeDef {
  id: SchemaTypeId;
  label: string;
  description: string;
  fields: SchemaFieldDef[];
  example: string;
}

const urlField = (key: string, label: string, required = false, help = "URL absoluta (https://...)"): SchemaFieldDef => ({ key, label, kind: "url", required, help });
const textField = (key: string, label: string, required = false, help = ""): SchemaFieldDef => ({ key, label, kind: "text", required, help });
const dateField = (key: string, label: string, required = false, help = "Fecha en formato ISO 8601 (AAAA-MM-DD)."): SchemaFieldDef => ({ key, label, kind: "date", required, help });
const textareaField = (key: string, label: string, required = false, help = ""): SchemaFieldDef => ({ key, label, kind: "textarea", required, help });

export const SCHEMA_TYPES: SchemaTypeDef[] = [
  {
    id: "Organization",
    label: "Organization",
    description: "Describe una organización o empresa.",
    example: "Una empresa que quiere que buscadores y asistentes reconozcan su nombre, logo y sitio oficial.",
    fields: [
      textField("name", "Nombre", true),
      urlField("url", "URL del sitio", true),
      urlField("logo", "URL del logotipo"),
      textareaField("description", "Descripción"),
      textField("email", "Correo de contacto"),
      textField("telephone", "Teléfono"),
      { key: "sameAs", label: "Perfiles sociales (uno por línea)", kind: "list", required: false, help: "Una URL por línea (LinkedIn, X, Facebook...)." },
    ],
  },
  {
    id: "LocalBusiness",
    label: "LocalBusiness",
    description: "Describe un negocio con ubicación física.",
    example: "Una tienda, restaurante o consultorio con dirección y horario.",
    fields: [
      textField("name", "Nombre", true),
      urlField("url", "URL del sitio", true),
      textField("telephone", "Teléfono"),
      textField("streetAddress", "Dirección"),
      textField("addressLocality", "Ciudad"),
      textField("addressRegion", "Región/Estado"),
      textField("postalCode", "Código postal"),
      textField("addressCountry", "País (código ISO, ej. ES, MX)"),
      textField("priceRange", "Rango de precio (ej. €€)"),
      { key: "openingHours", label: "Horarios (uno por línea, ej. Mo-Fr 09:00-18:00)", kind: "list", required: false, help: "" },
    ],
  },
  {
    id: "WebSite",
    label: "WebSite",
    description: "Describe un sitio web como entidad.",
    example: "La página principal de un sitio, para que buscadores identifiquen su nombre oficial.",
    fields: [textField("name", "Nombre del sitio", true), urlField("url", "URL", true), textareaField("description", "Descripción")],
  },
  {
    id: "WebPage",
    label: "WebPage",
    description: "Describe una página concreta.",
    example: "Una página interna que no es un artículo ni un producto.",
    fields: [textField("name", "Título de la página", true), urlField("url", "URL", true), textareaField("description", "Descripción"), textField("inLanguage", "Idioma (ej. es, en)")],
  },
  {
    id: "Article",
    label: "Article",
    description: "Describe un artículo genérico.",
    example: "Una noticia o artículo informativo publicado en el sitio.",
    fields: [
      textField("headline", "Titular", true),
      textareaField("description", "Descripción"),
      urlField("image", "URL de la imagen principal"),
      dateField("datePublished", "Fecha de publicación", true),
      dateField("dateModified", "Fecha de modificación"),
      textField("authorName", "Nombre del autor", true),
      urlField("authorUrl", "URL del autor"),
    ],
  },
  {
    id: "BlogPosting",
    label: "BlogPosting",
    description: "Describe una publicación de blog.",
    example: "Una entrada de blog, con las mismas propiedades que Article.",
    fields: [
      textField("headline", "Titular", true),
      textareaField("description", "Descripción"),
      urlField("image", "URL de la imagen principal"),
      dateField("datePublished", "Fecha de publicación", true),
      dateField("dateModified", "Fecha de modificación"),
      textField("authorName", "Nombre del autor", true),
      urlField("authorUrl", "URL del autor"),
    ],
  },
  {
    id: "Product",
    label: "Product",
    description: "Describe un producto. No incluye reseñas ni valoraciones inventadas.",
    example: "Un producto de una tienda en línea, con precio real si se conoce.",
    fields: [
      textField("name", "Nombre del producto", true),
      textareaField("description", "Descripción"),
      urlField("image", "URL de la imagen"),
      textField("sku", "SKU"),
      textField("brand", "Marca"),
      textField("offerPrice", "Precio (solo número, opcional)"),
      textField("offerCurrency", "Moneda (ISO 4217, ej. EUR)"),
      textField("offerAvailability", "Disponibilidad (ej. InStock, OutOfStock)"),
    ],
  },
  {
    id: "SoftwareApplication",
    label: "SoftwareApplication",
    description: "Describe una aplicación de software.",
    example: "Una app o herramienta web descargable o utilizable en línea.",
    fields: [
      textField("name", "Nombre", true),
      textField("applicationCategory", "Categoría (ej. BusinessApplication)"),
      textField("operatingSystem", "Sistema operativo"),
      textareaField("description", "Descripción"),
      urlField("url", "URL"),
    ],
  },
  {
    id: "FAQPage",
    label: "FAQPage",
    description: "Describe preguntas frecuentes REALES que la página publica visiblemente.",
    example: "Una sección de preguntas frecuentes visible en la página, no preguntas inventadas para SEO.",
    fields: [{ key: "faqItems", label: "Preguntas y respuestas", kind: "faq-list", required: true, help: "Añade solo preguntas y respuestas que realmente publicarás en la página." }],
  },
  {
    id: "BreadcrumbList",
    label: "BreadcrumbList",
    description: "Describe la ruta de navegación de una página.",
    example: "Inicio > Categoría > Página actual.",
    fields: [{ key: "items", label: "Elementos de la ruta (en orden)", kind: "breadcrumb-list", required: true, help: "Cada elemento necesita un nombre y una URL." }],
  },
  {
    id: "Person",
    label: "Person",
    description: "Describe a una persona (autor, fundador, miembro del equipo).",
    example: "La página de perfil de un autor o profesional.",
    fields: [
      textField("name", "Nombre", true),
      urlField("url", "URL del perfil"),
      urlField("image", "URL de la foto"),
      textField("jobTitle", "Cargo"),
      textField("email", "Correo"),
      { key: "sameAs", label: "Perfiles sociales (uno por línea)", kind: "list", required: false, help: "" },
    ],
  },
  {
    id: "Event",
    label: "Event",
    description: "Describe un evento con fecha real.",
    example: "Un webinar, taller o evento presencial anunciado en el sitio.",
    fields: [
      textField("name", "Nombre del evento", true),
      dateField("startDate", "Fecha de inicio", true),
      dateField("endDate", "Fecha de fin"),
      textField("locationName", "Lugar (nombre)"),
      textField("locationAddress", "Dirección del lugar"),
      urlField("onlineUrl", "URL del evento en línea (si aplica)"),
      textareaField("description", "Descripción"),
      urlField("url", "URL de la página del evento"),
    ],
  },
];

export function getSchemaType(id: SchemaTypeId): SchemaTypeDef | undefined {
  return SCHEMA_TYPES.find((t) => t.id === id);
}

const httpUrlString = () =>
  z
    .string()
    .refine((value) => value === "" || (() => { try { const u = new URL(value); return u.protocol === "http:" || u.protocol === "https:"; } catch { return false; } })(), {
      message: "Debe ser una URL http/https absoluta.",
    });
const isoDateString = () => z.string().refine((value) => value === "" || /^\d{4}-\d{2}-\d{2}/.test(value), { message: "Debe ser una fecha ISO 8601 (AAAA-MM-DD)." });

/**
 * One Zod schema per schema.org type (spec section 14: "cada tipo debe
 * tener: schema Zod"), validating the raw guided-form string values BEFORE
 * `buildJsonLd` assembles the final object — required fields, URL shape,
 * and ISO date shape are all checked here rather than only after the JSON
 * is built.
 */
export const SCHEMA_ZOD_SCHEMAS: Record<SchemaTypeId, z.ZodTypeAny> = {
  Organization: z.object({ name: z.string().min(1, "El nombre es obligatorio."), url: httpUrlString().refine((v) => v !== "", "La URL es obligatoria.") }),
  LocalBusiness: z.object({ name: z.string().min(1, "El nombre es obligatorio."), url: httpUrlString().refine((v) => v !== "", "La URL es obligatoria.") }),
  WebSite: z.object({ name: z.string().min(1, "El nombre es obligatorio."), url: httpUrlString().refine((v) => v !== "", "La URL es obligatoria.") }),
  WebPage: z.object({ name: z.string().min(1, "El nombre es obligatorio."), url: httpUrlString().refine((v) => v !== "", "La URL es obligatoria.") }),
  Article: z.object({ headline: z.string().min(1, "El titular es obligatorio."), authorName: z.string().min(1, "El autor es obligatorio."), datePublished: isoDateString().refine((v) => v !== "", "La fecha de publicación es obligatoria.") }),
  BlogPosting: z.object({ headline: z.string().min(1, "El titular es obligatorio."), authorName: z.string().min(1, "El autor es obligatorio."), datePublished: isoDateString().refine((v) => v !== "", "La fecha de publicación es obligatoria.") }),
  Product: z.object({ name: z.string().min(1, "El nombre es obligatorio.") }),
  SoftwareApplication: z.object({ name: z.string().min(1, "El nombre es obligatorio.") }),
  FAQPage: z.object({ faqItems: z.array(z.object({ question: z.string().min(1), answer: z.string().min(1) })).min(1, "Añade al menos una pregunta con respuesta.") }),
  BreadcrumbList: z.object({ items: z.array(z.object({ name: z.string().min(1), url: httpUrlString() })).min(1, "Añade al menos un elemento.") }),
  Person: z.object({ name: z.string().min(1, "El nombre es obligatorio.") }),
  Event: z.object({ name: z.string().min(1, "El nombre es obligatorio."), startDate: isoDateString().refine((v) => v !== "", "La fecha de inicio es obligatoria.") }),
};

export interface ZodFieldError {
  field: string;
  message: string;
}

/** Runs the type's Zod schema against the raw form values and returns readable field errors — used before `buildJsonLd`, distinct from `validateJsonLdObject` which re-checks the assembled output independently. */
export function validateSchemaFormValues(typeId: SchemaTypeId, values: SchemaFormValues): ZodFieldError[] {
  const schema = SCHEMA_ZOD_SCHEMAS[typeId];
  const result = schema.safeParse(values);
  if (result.success) return [];
  return result.error.issues.map((issue) => ({ field: String(issue.path[0] ?? typeId), message: issue.message }));
}

function omitEmpty<T extends Record<string, unknown>>(obj: T): Partial<T> {
  const result: Partial<T> = {};
  for (const [key, value] of Object.entries(obj)) {
    if (value === undefined || value === null || value === "") continue;
    if (Array.isArray(value) && value.length === 0) continue;
    (result as Record<string, unknown>)[key] = value;
  }
  return result;
}

export interface FaqItem {
  question: string;
  answer: string;
}
export interface BreadcrumbItem {
  name: string;
  url: string;
}

export type SchemaFieldValue = string | string[] | FaqItem[] | BreadcrumbItem[];

export interface SchemaFormValues {
  [key: string]: SchemaFieldValue | undefined;
}

/** Assembles the final JSON-LD object for one type — every optional empty field is omitted rather than emitted as an empty string (schema.org consumers treat "" as a real, wrong value). */
export function buildJsonLd(typeId: SchemaTypeId, values: SchemaFormValues): Record<string, unknown> {
  const base = { "@context": "https://schema.org", "@type": typeId };

  switch (typeId) {
    case "Organization":
    case "Person": {
      const obj = omitEmpty({
        name: values.name,
        url: values.url,
        logo: values.logo,
        image: values.image,
        description: values.description,
        email: values.email,
        telephone: values.telephone,
        jobTitle: values.jobTitle,
        sameAs: values.sameAs,
      });
      return { ...base, ...obj };
    }
    case "LocalBusiness": {
      const address = omitEmpty({
        "@type": "PostalAddress",
        streetAddress: values.streetAddress,
        addressLocality: values.addressLocality,
        addressRegion: values.addressRegion,
        postalCode: values.postalCode,
        addressCountry: values.addressCountry,
      });
      const obj = omitEmpty({
        name: values.name,
        url: values.url,
        telephone: values.telephone,
        priceRange: values.priceRange,
        openingHours: values.openingHours,
        address: Object.keys(address).length > 1 ? address : undefined,
      });
      return { ...base, ...obj };
    }
    case "WebSite":
    case "WebPage":
    case "SoftwareApplication": {
      const obj = omitEmpty({
        name: values.name,
        url: values.url,
        description: values.description,
        inLanguage: values.inLanguage,
        applicationCategory: values.applicationCategory,
        operatingSystem: values.operatingSystem,
      });
      return { ...base, ...obj };
    }
    case "Article":
    case "BlogPosting": {
      const author = values.authorName ? omitEmpty({ "@type": "Person", name: values.authorName, url: values.authorUrl }) : undefined;
      const obj = omitEmpty({
        headline: values.headline,
        description: values.description,
        image: values.image,
        datePublished: values.datePublished,
        dateModified: values.dateModified,
        author,
      });
      return { ...base, ...obj };
    }
    case "Product": {
      const offers =
        values.offerPrice || values.offerCurrency || values.offerAvailability
          ? omitEmpty({
              "@type": "Offer",
              price: values.offerPrice,
              priceCurrency: values.offerCurrency,
              availability: values.offerAvailability ? `https://schema.org/${values.offerAvailability}` : undefined,
            })
          : undefined;
      const obj = omitEmpty({
        name: values.name,
        description: values.description,
        image: values.image,
        sku: values.sku,
        brand: values.brand ? { "@type": "Brand", name: values.brand } : undefined,
        offers,
      });
      return { ...base, ...obj };
    }
    case "FAQPage": {
      const faqItems = (values.faqItems as FaqItem[] | undefined) ?? [];
      const mainEntity = faqItems
        .filter((item) => item.question.trim() && item.answer.trim())
        .map((item) => ({ "@type": "Question", name: item.question, acceptedAnswer: { "@type": "Answer", text: item.answer } }));
      return { ...base, mainEntity };
    }
    case "BreadcrumbList": {
      const breadcrumbItems = (values.items as BreadcrumbItem[] | undefined) ?? [];
      const itemListElement = breadcrumbItems
        .filter((item) => item.name.trim() && item.url.trim())
        .map((item, index) => ({ "@type": "ListItem", position: index + 1, name: item.name, item: item.url }));
      return { ...base, itemListElement };
    }
    case "Event": {
      const location = values.onlineUrl
        ? omitEmpty({ "@type": "VirtualLocation", url: values.onlineUrl })
        : omitEmpty({ "@type": "Place", name: values.locationName, address: values.locationAddress });
      const obj = omitEmpty({
        name: values.name,
        startDate: values.startDate,
        endDate: values.endDate,
        description: values.description,
        url: values.url,
        location: Object.keys(location).length > 1 ? location : undefined,
      });
      return { ...base, ...obj };
    }
    default:
      return base;
  }
}

export interface JsonLdFinding {
  field: string;
  code: string;
  severity: "ERROR" | "WARNING" | "INFO";
  message: string;
}

const ISO_DATE_PATTERN = /^\d{4}-\d{2}-\d{2}(T\d{2}:\d{2}:\d{2}(\.\d+)?(Z|[+-]\d{2}:\d{2})?)?$/;

function isHttpUrl(raw: unknown): boolean {
  if (typeof raw !== "string") return false;
  try {
    const url = new URL(raw);
    return url.protocol === "http:" || url.protocol === "https:";
  } catch {
    return false;
  }
}

/**
 * Layered validation per spec section 15: JSON validity, @context, @type,
 * required fields, types, URLs, ISO dates, positive numbers — applied to
 * the actual generated (or pasted) JSON-LD object, independent of the
 * guided-form values. Never claims Google-level validity — see
 * `LOCAL_VALIDITY_LABEL`.
 */
export function validateJsonLdObject(typeId: SchemaTypeId, obj: Record<string, unknown>): JsonLdFinding[] {
  const findings: JsonLdFinding[] = [];

  if (obj["@context"] !== "https://schema.org" && obj["@context"] !== "http://schema.org") {
    findings.push({ field: "@context", code: "missing-context", severity: "ERROR", message: '@context debe ser "https://schema.org".' });
  }
  if (obj["@type"] !== typeId) {
    findings.push({ field: "@type", code: "type-mismatch", severity: "ERROR", message: `@type debe ser "${typeId}".` });
  }

  const typeDef = getSchemaType(typeId);
  if (typeDef) {
    for (const field of typeDef.fields) {
      if (!field.required) continue;
      if (field.kind === "faq-list") {
        const items = obj.mainEntity;
        if (!Array.isArray(items) || items.length === 0) findings.push({ field: field.key, code: "required", severity: "ERROR", message: "FAQPage necesita al menos una pregunta con respuesta." });
        continue;
      }
      if (field.kind === "breadcrumb-list") {
        const items = obj.itemListElement;
        if (!Array.isArray(items) || items.length === 0) findings.push({ field: field.key, code: "required", severity: "ERROR", message: "BreadcrumbList necesita al menos un elemento." });
        continue;
      }
    }
  }

  if ("url" in obj && obj.url !== undefined && !isHttpUrl(obj.url)) findings.push({ field: "url", code: "invalid-url", severity: "ERROR", message: "url debe ser una URL http/https absoluta." });
  if ("image" in obj && obj.image !== undefined && !isHttpUrl(obj.image)) findings.push({ field: "image", code: "invalid-url", severity: "WARNING", message: "image debe ser una URL http/https absoluta." });

  for (const dateField of ["datePublished", "dateModified", "startDate", "endDate"]) {
    if (dateField in obj && obj[dateField] !== undefined) {
      if (typeof obj[dateField] !== "string" || !ISO_DATE_PATTERN.test(obj[dateField] as string)) {
        findings.push({ field: dateField, code: "invalid-date", severity: "ERROR", message: `${dateField} debe ser una fecha ISO 8601.` });
      }
    }
  }

  const offers = obj.offers as Record<string, unknown> | undefined;
  if (offers?.price !== undefined) {
    const priceNum = Number(offers.price);
    if (Number.isNaN(priceNum) || priceNum < 0) findings.push({ field: "offers.price", code: "invalid-number", severity: "ERROR", message: "El precio debe ser un número positivo." });
  }

  if (typeId === "Event") {
    const start = obj.startDate as string | undefined;
    const end = obj.endDate as string | undefined;
    if (start && end && ISO_DATE_PATTERN.test(start) && ISO_DATE_PATTERN.test(end) && new Date(end).getTime() < new Date(start).getTime()) {
      findings.push({ field: "endDate", code: "incompatible-dates", severity: "ERROR", message: "endDate no puede ser anterior a startDate." });
    }
  }

  return findings;
}

export const LOCAL_VALIDITY_LABEL = "Estructura localmente válida";
