"use client";

import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";

/**
 * Shared field renderer for both the create form and the edit form inside
 * BrandProfileCard — one place defines how a Brand Kit field looks, so the
 * ~20 fields in the spec's structure never get laid out twice.
 */
export function BrandProfileField({
  idPrefix,
  label,
  name,
  defaultValue,
  textarea,
  placeholder,
  className,
  required,
}: {
  idPrefix: string;
  label: string;
  name: string;
  defaultValue?: string;
  textarea?: boolean;
  placeholder?: string;
  className?: string;
  required?: boolean;
}) {
  const id = `${idPrefix}-${name}`;
  return (
    <div className={`space-y-2 ${className ?? ""}`}>
      <Label htmlFor={id}>{label}</Label>
      {textarea ? (
        <Textarea id={id} name={name} defaultValue={defaultValue} rows={3} placeholder={placeholder} required={required} />
      ) : (
        <Input id={id} name={name} defaultValue={defaultValue} placeholder={placeholder} required={required} />
      )}
    </div>
  );
}
