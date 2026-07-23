"use client";

import { useRouter } from "next/navigation";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";

interface ProjectOption {
  id: string;
  name: string;
}

export function ProjectSwitcher({
  projects,
  currentProjectId,
}: {
  projects: ProjectOption[];
  currentProjectId?: string;
}) {
  const router = useRouter();

  return (
    <Select
      value={currentProjectId}
      onValueChange={(value) => {
        if (value === "__new__") {
          router.push("/dashboard/new");
          return;
        }
        router.push(`/dashboard/${value}`);
      }}
    >
      <SelectTrigger className="w-48">
        <SelectValue placeholder="Selecciona un proyecto" />
      </SelectTrigger>
      <SelectContent>
        {projects.map((project) => (
          <SelectItem key={project.id} value={project.id}>
            {project.name}
          </SelectItem>
        ))}
        <SelectItem value="__new__">+ Nuevo proyecto</SelectItem>
      </SelectContent>
    </Select>
  );
}
