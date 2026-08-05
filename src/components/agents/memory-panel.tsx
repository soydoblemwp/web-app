"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { Trash2, Plus } from "lucide-react";
import { saveAgentMemoryAction, deleteAgentMemoryAction, setAgentMemoryActiveAction } from "@/server/actions/agent-memory";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Switch } from "@/components/ui/switch";

const MEMORY_TYPE_LABELS: Record<string, string> = {
  PREFERENCE: "Preferencia",
  DECISION: "Decisión",
  PERSISTENT_INSTRUCTION: "Instrucción persistente",
  APPROVED_LEARNING: "Aprendizaje aprobado",
  BRAND_FACT: "Dato de marca",
  CONSTRAINT: "Restricción",
  PREFERRED_FORMAT: "Formato preferido",
};

interface MemoryItem {
  id: string;
  type: string;
  content: string;
  isActive: boolean;
  createdAt: string;
  approvedBy: { id: string; name: string | null; email: string };
}

export function MemoryPanel({ projectId, agentRef, initialMemory }: { projectId: string; agentRef: string; initialMemory: MemoryItem[] }) {
  const router = useRouter();
  const [memory, setMemory] = useState(initialMemory);
  const [newContent, setNewContent] = useState("");
  const [newType, setNewType] = useState("PREFERENCE");
  const [saving, setSaving] = useState(false);

  async function handleSave() {
    if (!newContent.trim()) return;
    setSaving(true);
    const result = await saveAgentMemoryAction(projectId, { agentRef, type: newType, content: newContent.trim() });
    setSaving(false);
    if (result.error) toast.error(result.error);
    else {
      toast.success("Memoria guardada.");
      setNewContent("");
      router.refresh();
    }
  }

  async function handleToggle(id: string, isActive: boolean) {
    setMemory((prev) => prev.map((m) => (m.id === id ? { ...m, isActive } : m)));
    const result = await setAgentMemoryActiveAction(projectId, id, isActive);
    if (result.error) toast.error(result.error);
  }

  async function handleDelete(id: string) {
    setMemory((prev) => prev.filter((m) => m.id !== id));
    const result = await deleteAgentMemoryAction(projectId, id);
    if (result.error) toast.error(result.error);
  }

  return (
    <Card>
      <CardContent className="space-y-3 py-4">
        <p className="text-xs font-medium text-muted-foreground">Memoria de este agente en este proyecto</p>
        {memory.length === 0 ? (
          <p className="text-xs text-muted-foreground">Sin memoria guardada todavía.</p>
        ) : (
          <ul className="space-y-1.5">
            {memory.map((m) => (
              <li key={m.id} className="flex items-start justify-between gap-2 rounded border p-2 text-xs">
                <div className="min-w-0 flex-1">
                  <Badge variant="outline" className="mb-1">
                    {MEMORY_TYPE_LABELS[m.type] ?? m.type}
                  </Badge>
                  <p>{m.content}</p>
                  <p className="mt-1 text-[10px] text-muted-foreground">
                    Aprobado por {m.approvedBy.name || m.approvedBy.email} · {new Date(m.createdAt).toLocaleDateString("es-ES")}
                  </p>
                </div>
                <div className="flex shrink-0 items-center gap-2">
                  <Switch checked={m.isActive} onCheckedChange={(v) => handleToggle(m.id, v)} />
                  <Button type="button" variant="ghost" size="icon-xs" onClick={() => handleDelete(m.id)}>
                    <Trash2 className="size-3.5" />
                  </Button>
                </div>
              </li>
            ))}
          </ul>
        )}

        <div className="space-y-1.5 border-t pt-3">
          <Select value={newType} onValueChange={(v) => v && setNewType(v)}>
            <SelectTrigger size="sm" className="w-full">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {Object.entries(MEMORY_TYPE_LABELS).map(([value, label]) => (
                <SelectItem key={value} value={value}>
                  {label}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
          <Textarea rows={2} value={newContent} onChange={(e) => setNewContent(e.target.value)} placeholder="Guardar esto como memoria..." />
          <Button type="button" size="sm" variant="outline" disabled={saving || !newContent.trim()} onClick={handleSave}>
            <Plus className="size-3.5" /> Guardar como memoria
          </Button>
        </div>
      </CardContent>
    </Card>
  );
}
