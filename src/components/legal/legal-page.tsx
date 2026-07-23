import Link from "next/link";

export function LegalPage({
  title,
  children,
}: {
  title: string;
  children: React.ReactNode;
}) {
  return (
    <div className="mx-auto max-w-2xl px-6 py-12">
      <Link href="/" className="text-sm text-muted-foreground hover:underline">
        ← Volver al inicio
      </Link>
      <h1 className="mt-4 text-2xl font-semibold tracking-tight">{title}</h1>
      <div className="mt-2 rounded-md border border-dashed bg-muted/40 p-3 text-xs text-muted-foreground">
        Esta página es una plantilla inicial y no constituye asesoría legal. Debe ser revisada por un profesional
        antes de usarse en producción.
      </div>
      <div className="mt-6 space-y-4 text-sm leading-relaxed text-foreground [&_h2]:text-base [&_h2]:font-semibold [&_h2]:mt-6 [&_ul]:list-disc [&_ul]:pl-5">
        {children}
      </div>
    </div>
  );
}
