import { addBrandTermAction, deleteBrandTermAction } from "@/server/actions/brand-kit";
import type { BrandTerm } from "@/generated/prisma/client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Switch } from "@/components/ui/switch";
import { Label } from "@/components/ui/label";
import { X } from "lucide-react";

export function BrandTermsManager({ projectId, terms }: { projectId: string; terms: BrandTerm[] }) {
  const addAction = addBrandTermAction.bind(null, projectId);

  return (
    <div className="space-y-4">
      <form action={addAction} className="flex flex-wrap items-end gap-3">
        <div className="flex-1 space-y-2">
          <Label htmlFor="term">Palabra o expresión</Label>
          <Input id="term" name="term" required maxLength={100} />
        </div>
        <div className="flex items-center gap-2 pb-2">
          <Switch id="isForbidden" name="isForbidden" />
          <Label htmlFor="isForbidden">Prohibida</Label>
        </div>
        <Button type="submit">Añadir</Button>
      </form>

      {terms.length === 0 ? (
        <p className="text-sm text-muted-foreground">No hay palabras preferidas ni prohibidas todavía.</p>
      ) : (
        <div className="flex flex-wrap gap-2">
          {terms.map((term) => {
            const deleteAction = deleteBrandTermAction.bind(null, projectId, term.id);
            return (
              <form key={term.id} action={deleteAction}>
                <Badge variant={term.isForbidden ? "destructive" : "secondary"} className="gap-1 pr-1">
                  {term.term}
                  <button type="submit" aria-label={`Eliminar ${term.term}`} className="rounded-full hover:bg-black/10">
                    <X className="size-3" />
                  </button>
                </Badge>
              </form>
            );
          })}
        </div>
      )}
    </div>
  );
}
