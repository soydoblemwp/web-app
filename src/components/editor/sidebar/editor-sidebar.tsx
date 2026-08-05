"use client";

import { useState, useSyncExternalStore } from "react";
import type { Editor } from "@tiptap/react";
import { PanelRightClose, PanelRightOpen, Sparkles } from "lucide-react";
import { buildBrandProfileContext } from "@/lib/brand-profiles/context";
import type { BrandProfileLike } from "@/lib/brand-profiles/types";
import { Button } from "@/components/ui/button";
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs";
import { Sheet, SheetContent, SheetHeader, SheetTitle, SheetTrigger } from "@/components/ui/sheet";
import { SummaryTab } from "@/components/editor/sidebar/tabs/summary-tab";
import { StructureTab } from "@/components/editor/sidebar/tabs/structure-tab";
import { SeoTab } from "@/components/editor/sidebar/tabs/seo-tab";
import { RepurposeTab } from "@/components/editor/sidebar/tabs/repurpose-tab";
import { VersionsTab } from "@/components/editor/sidebar/tabs/versions-tab";
import { PublishTab } from "@/components/editor/sidebar/tabs/publish-tab";
import { KnowledgeTab } from "@/components/editor/sidebar/tabs/knowledge-tab";
import type { ContentMetadata, VersionSummary } from "@/components/editor/sidebar/types";
import { cn } from "@/lib/utils";

const OPEN_KEY = "ai-content-hub:editor-sidebar-open";
const TAB_KEY = "ai-content-hub:editor-sidebar-tab";
const TAB_IDS = ["summary", "structure", "seo", "repurpose", "knowledge", "versions", "publish"] as const;
type TabId = (typeof TAB_IDS)[number];

function readBoolPref(key: string, fallback: boolean): boolean {
  if (typeof window === "undefined") return fallback;
  try {
    const raw = window.localStorage.getItem(key);
    return raw === null ? fallback : raw === "true";
  } catch {
    return fallback;
  }
}

function readTabPref(fallback: TabId): TabId {
  if (typeof window === "undefined") return fallback;
  try {
    const raw = window.localStorage.getItem(TAB_KEY);
    return raw && (TAB_IDS as readonly string[]).includes(raw) ? (raw as TabId) : fallback;
  } catch {
    return fallback;
  }
}

function writePref(key: string, value: string) {
  if (typeof window === "undefined") return;
  try {
    window.localStorage.setItem(key, value);
  } catch {
    // private browsing / storage disabled — the panel still works, it just won't remember its state.
  }
}

const noopSubscribe = () => () => {};

/** True only after the client has hydrated — same pattern as ThemeToggle's useHasMounted (src/components/layout/theme-toggle.tsx), avoids a server/client mismatch on the panel's stored open/tab state. */
function useHasMounted(): boolean {
  return useSyncExternalStore(noopSubscribe, () => true, () => false);
}

export interface EditorSidebarProps {
  projectId: string;
  contentId: string;
  editor: Editor | null;
  title: string;
  bodyHtml: string;
  authorName: string;
  updatedAt: string;
  metadata: ContentMetadata;
  onMetadataChange: (patch: Partial<ContentMetadata>) => void;
  publishChecklistRaw: unknown;
  versions: VersionSummary[];
  brandContextText: string;
  onRestored: (title: string, body: string) => void;
}

/**
 * "AI Content Command Center" (Fase 27) — the collapsible right-hand panel
 * inside the official editor. Never a second editor: every tab reads/writes
 * through the SAME `editor` instance RichEditor already created (passed in
 * via onEditorReady), the same ContentMetadata state ContentEditorPanel
 * autosaves, and the same server actions every other surface uses.
 */
export function EditorSidebar(props: EditorSidebarProps) {
  const hasMounted = useHasMounted();
  // null = "no user action taken yet this session, defer to the stored/default value";
  // once the user toggles/switches, the explicit override always wins over storage.
  const [openOverride, setOpenOverride] = useState<boolean | null>(null);
  const [tabOverride, setTabOverride] = useState<TabId | null>(null);
  const [mobileOpen, setMobileOpen] = useState(false);
  const [brandProfileContext, setBrandProfileContext] = useState("");

  // Server render and the pre-hydration client render both use the fallback
  // (hasMounted is false in both) so they match; the real stored value only
  // ever gets read once hasMounted flips true post-hydration — never via a
  // setState-in-effect, so there's no extra render pass to correct.
  const open = openOverride ?? (hasMounted ? readBoolPref(OPEN_KEY, true) : true);
  const tab = tabOverride ?? (hasMounted ? readTabPref("summary") : "summary");

  function toggleOpen() {
    const next = !open;
    setOpenOverride(next);
    writePref(OPEN_KEY, String(next));
  }

  function handleTabChange(value: unknown) {
    if (typeof value !== "string" || !(TAB_IDS as readonly string[]).includes(value)) return;
    setTabOverride(value as TabId);
    writePref(TAB_KEY, value);
  }

  function handleBrandProfileResolved(profile: BrandProfileLike | null) {
    setBrandProfileContext(profile ? buildBrandProfileContext(profile) : "");
  }

  const composedBrandContext = [props.brandContextText, brandProfileContext].filter(Boolean).join("\n\n");

  const content = (
    <Tabs value={tab} onValueChange={handleTabChange} className="flex h-full flex-col gap-2">
      <TabsList variant="line" className="w-full justify-start overflow-x-auto">
        <TabsTrigger value="summary">Resumen</TabsTrigger>
        <TabsTrigger value="structure">Estructura</TabsTrigger>
        <TabsTrigger value="seo">SEO</TabsTrigger>
        <TabsTrigger value="repurpose">Reutilizar</TabsTrigger>
        <TabsTrigger value="knowledge">Knowledge</TabsTrigger>
        <TabsTrigger value="versions">Versiones</TabsTrigger>
        <TabsTrigger value="publish">Publicación</TabsTrigger>
      </TabsList>

      <div className="min-h-0 flex-1 overflow-y-auto pr-1">
        <TabsContent value="summary">
          <SummaryTab
            projectId={props.projectId}
            editor={props.editor}
            title={props.title}
            authorName={props.authorName}
            updatedAt={props.updatedAt}
            metadata={props.metadata}
            publishChecklistRaw={props.publishChecklistRaw}
            onMetadataChange={props.onMetadataChange}
            onBrandProfileResolved={handleBrandProfileResolved}
          />
        </TabsContent>
        <TabsContent value="structure">
          <StructureTab editor={props.editor} title={props.title} objective={props.metadata.objective} brandContext={composedBrandContext} />
        </TabsContent>
        <TabsContent value="seo">
          <SeoTab editor={props.editor} title={props.title} metadata={props.metadata} brandContext={composedBrandContext} onMetadataChange={props.onMetadataChange} />
        </TabsContent>
        <TabsContent value="repurpose">
          <RepurposeTab
            projectId={props.projectId}
            contentId={props.contentId}
            editor={props.editor}
            brandContext={composedBrandContext}
            brandProfileId={props.metadata.brandProfileId}
          />
        </TabsContent>
        <TabsContent value="knowledge">
          <KnowledgeTab projectId={props.projectId} contentId={props.contentId} editor={props.editor} />
        </TabsContent>
        <TabsContent value="versions">
          <VersionsTab
            projectId={props.projectId}
            contentId={props.contentId}
            versions={props.versions}
            currentTitle={props.title}
            currentBody={props.bodyHtml}
            onRestored={props.onRestored}
          />
        </TabsContent>
        <TabsContent value="publish">
          <PublishTab
            projectId={props.projectId}
            contentId={props.contentId}
            title={props.title}
            bodyText={props.editor?.getText() ?? ""}
            publishChecklistRaw={props.publishChecklistRaw}
          />
        </TabsContent>
      </div>
    </Tabs>
  );

  return (
    <>
      {/* Desktop: persistent collapsible column */}
      <div className={cn("hidden shrink-0 lg:flex", open ? "w-80" : "w-10")}>
        {open ? (
          <div className="flex w-80 flex-col rounded-lg border bg-card p-2">
            <div className="mb-1 flex items-center justify-between px-1">
              <p className="flex items-center gap-1.5 text-xs font-semibold text-muted-foreground">
                <Sparkles className="size-3.5" /> Centro de contenido
              </p>
              <Button type="button" variant="ghost" size="icon-xs" onClick={toggleOpen} aria-label="Cerrar panel">
                <PanelRightClose className="size-4" />
              </Button>
            </div>
            {content}
          </div>
        ) : (
          <div className="flex w-10 justify-center pt-2">
            <Button type="button" variant="outline" size="icon-sm" onClick={toggleOpen} aria-label="Abrir panel">
              <PanelRightOpen className="size-4" />
            </Button>
          </div>
        )}
      </div>

      {/* Mobile: floating trigger + slide-over sheet, so the editor keeps full width */}
      <div className="fixed right-4 bottom-4 z-40 lg:hidden">
        <Sheet open={mobileOpen} onOpenChange={setMobileOpen}>
          <SheetTrigger
            render={
              <Button type="button" size="icon" className="size-11 rounded-full shadow-lg" aria-label="Abrir centro de contenido" />
            }
          >
            <Sparkles className="size-5" />
          </SheetTrigger>
          <SheetContent side="right" className="flex w-full flex-col p-3 sm:max-w-sm">
            <SheetHeader className="px-0">
              <SheetTitle>Centro de contenido</SheetTitle>
            </SheetHeader>
            {content}
          </SheetContent>
        </Sheet>
      </div>
    </>
  );
}
