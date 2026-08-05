"use client";

import { useState } from "react";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Button } from "@/components/ui/button";
import { CopyButton, DownloadButton, ResetButton } from "@/components/public-tools/copy-download-actions";
import { buildCsv } from "@/lib/public-tools/csv-export";
import { parseIpv4, computeIpv4Subnet, prefixFromMask, ipv4InSubnet, compareIpv4Networks, type Ipv4SubnetInfo } from "@/lib/public-tools/network/ipv4";
import { parseIpv6, computeIpv6Prefix, ipv6InPrefix, type Ipv6PrefixInfo } from "@/lib/public-tools/network/ipv6";
import { divideIpv4Subnet, divideIpv6Prefix } from "@/lib/public-tools/network/cidr";

type Family = "ipv4" | "ipv6";
type SubMode = "info" | "divide" | "membership" | "compare";

export function IpSubnetTool() {
  const [family, setFamily] = useState<Family>("ipv4");
  const [subMode, setSubMode] = useState<SubMode>("info");

  const [ip, setIp] = useState("192.168.1.10");
  const [prefixText, setPrefixText] = useState("24");
  const [maskText, setMaskText] = useState("");

  const [newPrefixText, setNewPrefixText] = useState("26");

  const [candidateIp, setCandidateIp] = useState("192.168.1.200");

  const [ip2, setIp2] = useState("192.168.1.128");
  const [prefix2Text, setPrefix2Text] = useState("25");

  const [error, setError] = useState<string | null>(null);
  const [v4Info, setV4Info] = useState<Ipv4SubnetInfo | null>(null);
  const [v6Info, setV6Info] = useState<Ipv6PrefixInfo | null>(null);
  const [divided, setDivided] = useState<{ network: string; prefix: number }[] | null>(null);
  const [membership, setMembership] = useState<boolean | null>(null);
  const [compareResult, setCompareResult] = useState<string | null>(null);

  function resolvePrefixFromMaskOrText(): { ok: boolean; error?: string; prefix?: number } {
    if (family === "ipv4" && maskText.trim()) {
      const maskParsed = parseIpv4(maskText);
      if (!maskParsed.ok || maskParsed.value === undefined) return { ok: false, error: `Máscara inválida: ${maskParsed.error}` };
      return prefixFromMask(maskParsed.value);
    }
    const maxPrefix = family === "ipv4" ? 32 : 128;
    const n = Number(prefixText);
    if (!Number.isInteger(n) || n < 0 || n > maxPrefix) return { ok: false, error: `El prefijo debe ser un entero entre 0 y ${maxPrefix}.` };
    return { ok: true, prefix: n };
  }

  function handleCompute() {
    setError(null);
    setV4Info(null);
    setV6Info(null);
    setDivided(null);
    setMembership(null);
    setCompareResult(null);

    const prefixResult = resolvePrefixFromMaskOrText();
    if (!prefixResult.ok || prefixResult.prefix === undefined) return setError(prefixResult.error!);
    const prefix = prefixResult.prefix;

    if (family === "ipv4") {
      const result = computeIpv4Subnet(ip, prefix);
      if (!result.ok || !result.info) return setError(result.error ?? "Error desconocido.");
      setV4Info(result.info);

      if (subMode === "divide") {
        const parsedIp = parseIpv4(ip);
        const network = (parsedIp.value! & (prefix === 0 ? 0 : (0xffffffff << (32 - prefix)) >>> 0)) >>> 0;
        const div = divideIpv4Subnet(network, prefix, Number(newPrefixText));
        if (!div.ok || !div.subnets) return setError(div.error ?? "Error desconocido.");
        setDivided(div.subnets);
      } else if (subMode === "membership") {
        const candidate = parseIpv4(candidateIp);
        if (!candidate.ok || candidate.value === undefined) return setError(`IP a comprobar inválida: ${candidate.error}`);
        const network = parseIpv4(result.info.networkAddress);
        setMembership(ipv4InSubnet(candidate.value, network.value!, prefix));
      } else if (subMode === "compare") {
        const p2 = Number(prefix2Text);
        const a = parseIpv4(ip);
        const b = parseIpv4(ip2);
        if (!a.ok || !b.ok || a.value === undefined || b.value === undefined) return setError("Alguna de las dos direcciones no es válida.");
        const cmp = compareIpv4Networks(a.value, prefix, b.value, p2);
        setCompareResult({ equal: "Las dos redes son iguales.", "a-contains-b": "La primera red contiene a la segunda.", "b-contains-a": "La segunda red contiene a la primera.", disjoint: "Las redes son disjuntas (no se solapan).", "overlap-partial": "Las redes se solapan parcialmente." }[cmp.relationship]);
      }
    } else {
      const result = computeIpv6Prefix(ip, prefix);
      if (!result.ok || !result.info) return setError(result.error ?? "Error desconocido.");
      setV6Info(result.info);

      if (subMode === "divide") {
        const parsedIp = parseIpv6(ip);
        const networkStart = parseIpv6(result.info.networkStart);
        const div = divideIpv6Prefix(networkStart.value ?? parsedIp.value!, prefix, Number(newPrefixText));
        if (!div.ok || !div.subnets) return setError(div.error ?? "Error desconocido.");
        setDivided(div.subnets);
      } else if (subMode === "membership") {
        const candidate = parseIpv6(candidateIp);
        if (!candidate.ok || candidate.value === undefined) return setError(`IP a comprobar inválida: ${candidate.error}`);
        const network = parseIpv6(result.info.networkStart);
        setMembership(ipv6InPrefix(candidate.value, network.value!, prefix));
      }
    }
  }

  const csv = divided ? buildCsv(["Red", "Prefijo"], divided.map((d) => [d.network, `/${d.prefix}`])) : "";
  const summaryText = v4Info
    ? [`IP: ${v4Info.ipString}/${v4Info.prefix}`, `Máscara: ${v4Info.maskString}`, `Wildcard: ${v4Info.wildcardString}`, `Red: ${v4Info.networkAddress}`, v4Info.broadcastAddress ? `Broadcast: ${v4Info.broadcastAddress}` : "", `Rango utilizable: ${v4Info.firstUsable ?? "-"} - ${v4Info.lastUsable ?? "-"}`, `Total direcciones: ${v4Info.totalAddresses}`, `Utilizables: ${v4Info.usableAddresses}`, `Clasificación: ${v4Info.classification}`].filter(Boolean).join("\n")
    : v6Info
      ? [`IP expandida: ${v6Info.expanded}`, `IP comprimida: ${v6Info.compressed}/${v6Info.prefix}`, `Inicio de red: ${v6Info.networkStart}`, `Fin de red: ${v6Info.networkEnd}`, `Total direcciones: ${v6Info.totalAddresses}`, `Clasificación: ${v6Info.classification}`].join("\n")
      : "";

  return (
    <div className="space-y-6">
      <p className="rounded-lg border border-dashed bg-muted/30 p-3 text-xs text-muted-foreground">Los datos se procesan en tu dispositivo y no se envían al servidor. No se realiza geolocalización ni consulta de propietario/ISP/ASN.</p>

      <div className="flex flex-wrap gap-2">
        <Button type="button" variant={family === "ipv4" ? "default" : "outline"} size="sm" onClick={() => setFamily("ipv4")}>
          IPv4
        </Button>
        <Button type="button" variant={family === "ipv6" ? "default" : "outline"} size="sm" onClick={() => setFamily("ipv6")}>
          IPv6
        </Button>
      </div>
      <div className="flex flex-wrap gap-2">
        {(["info", "divide", "membership", ...(family === "ipv4" ? (["compare"] as SubMode[]) : [])] as SubMode[]).map((m) => (
          <Button key={m} type="button" variant={subMode === m ? "default" : "outline"} size="sm" onClick={() => setSubMode(m)}>
            {{ info: "Información", divide: "Dividir en subredes", membership: "Comprobar pertenencia", compare: "Comparar dos redes" }[m]}
          </Button>
        ))}
      </div>

      <div className="grid gap-4 sm:grid-cols-3">
        <div>
          <Label htmlFor="ip-address" className="mb-1">
            Dirección {family === "ipv4" ? "IPv4" : "IPv6"}
          </Label>
          <Input id="ip-address" value={ip} onChange={(e) => setIp(e.target.value)} className="font-mono" />
        </div>
        <div>
          <Label htmlFor="ip-prefix" className="mb-1">
            Prefijo CIDR (/{family === "ipv4" ? "0-32" : "0-128"})
          </Label>
          <Input id="ip-prefix" value={prefixText} onChange={(e) => setPrefixText(e.target.value)} className="font-mono" />
        </div>
        {family === "ipv4" ? (
          <div>
            <Label htmlFor="ip-mask" className="mb-1">
              O máscara (opcional, sustituye al prefijo)
            </Label>
            <Input id="ip-mask" value={maskText} onChange={(e) => setMaskText(e.target.value)} placeholder="255.255.255.0" className="font-mono" />
          </div>
        ) : null}
      </div>

      {subMode === "divide" ? (
        <div className="max-w-xs">
          <Label htmlFor="ip-new-prefix" className="mb-1">
            Nuevo prefijo (subredes más pequeñas)
          </Label>
          <Input id="ip-new-prefix" value={newPrefixText} onChange={(e) => setNewPrefixText(e.target.value)} className="font-mono" />
        </div>
      ) : null}
      {subMode === "membership" ? (
        <div className="max-w-xs">
          <Label htmlFor="ip-candidate" className="mb-1">
            Dirección a comprobar
          </Label>
          <Input id="ip-candidate" value={candidateIp} onChange={(e) => setCandidateIp(e.target.value)} className="font-mono" />
        </div>
      ) : null}
      {subMode === "compare" ? (
        <div className="grid gap-4 sm:grid-cols-2">
          <div>
            <Label htmlFor="ip-2" className="mb-1">
              Segunda dirección
            </Label>
            <Input id="ip-2" value={ip2} onChange={(e) => setIp2(e.target.value)} className="font-mono" />
          </div>
          <div>
            <Label htmlFor="ip-2-prefix" className="mb-1">
              Segundo prefijo
            </Label>
            <Input id="ip-2-prefix" value={prefix2Text} onChange={(e) => setPrefix2Text(e.target.value)} className="font-mono" />
          </div>
        </div>
      ) : null}

      <Button type="button" onClick={handleCompute}>
        Calcular
      </Button>

      {error ? (
        <p role="alert" className="text-sm text-destructive">
          {error}
        </p>
      ) : null}

      {v4Info ? (
        <div aria-live="polite" className="overflow-x-auto rounded-lg border">
          <table className="w-full min-w-[420px] text-sm">
            <tbody>
              {[
                ["IP normalizada", `${v4Info.ipString}/${v4Info.prefix}`],
                ["Máscara", v4Info.maskString],
                ["Wildcard", v4Info.wildcardString],
                ["Dirección de red", v4Info.networkAddress],
                ["Dirección de broadcast", v4Info.broadcastAddress ?? "— (no aplica en /31 o /32)"],
                ["Primera utilizable", v4Info.firstUsable ?? "—"],
                ["Última utilizable", v4Info.lastUsable ?? "—"],
                ["Total de direcciones", v4Info.totalAddresses.toLocaleString("es-ES")],
                ["Direcciones utilizables", v4Info.usableAddresses.toLocaleString("es-ES")],
                ["Binario", v4Info.binary],
                ["Hexadecimal", v4Info.hex],
                ["Clasificación", v4Info.classification],
                ["Clase histórica (legado)", v4Info.historicalClass],
              ].map(([k, v]) => (
                <tr key={k} className="border-b last:border-0">
                  <th scope="row" className="px-3 py-2 text-left font-normal text-muted-foreground">
                    {k}
                  </th>
                  <td className="px-3 py-2 font-mono text-xs">{v}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      ) : null}

      {v6Info ? (
        <div aria-live="polite" className="overflow-x-auto rounded-lg border">
          <table className="w-full min-w-[420px] text-sm">
            <tbody>
              {[
                ["Forma expandida", v6Info.expanded],
                ["Forma comprimida", `${v6Info.compressed}/${v6Info.prefix}`],
                ["Inicio de la red", v6Info.networkStart],
                ["Fin de la red", v6Info.networkEnd],
                ["Total de direcciones", v6Info.totalAddresses],
                ["Clasificación", v6Info.classification],
                ["IPv4 embebida", v6Info.hadEmbeddedIpv4 ? "sí" : "no"],
              ].map(([k, v]) => (
                <tr key={k} className="border-b last:border-0">
                  <th scope="row" className="px-3 py-2 text-left font-normal text-muted-foreground">
                    {k}
                  </th>
                  <td className="px-3 py-2 font-mono text-xs">{v}</td>
                </tr>
              ))}
            </tbody>
          </table>
          <p className="px-3 py-2 text-xs text-muted-foreground">IPv6 no tiene concepto de dirección de broadcast.</p>
        </div>
      ) : null}

      {membership !== null ? (
        <p aria-live="polite" className={`text-sm font-semibold ${membership ? "text-green-700 dark:text-green-400" : "text-destructive"}`}>
          {membership ? "La dirección SÍ pertenece a esta red." : "La dirección NO pertenece a esta red."}
        </p>
      ) : null}

      {compareResult ? (
        <p aria-live="polite" className="text-sm font-semibold">
          {compareResult}
        </p>
      ) : null}

      {divided ? (
        <div aria-live="polite" className="overflow-x-auto rounded-lg border">
          <table className="w-full min-w-[300px] text-sm">
            <thead>
              <tr className="border-b bg-muted/40">
                <th scope="col" className="px-3 py-2 text-left">
                  Red
                </th>
                <th scope="col" className="px-3 py-2 text-left">
                  Prefijo
                </th>
              </tr>
            </thead>
            <tbody>
              {divided.map((d) => (
                <tr key={`${d.network}/${d.prefix}`} className="border-b last:border-0">
                  <td className="px-3 py-2 font-mono text-xs">{d.network}</td>
                  <td className="px-3 py-2 font-mono text-xs">/{d.prefix}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      ) : null}

      <div className="flex flex-wrap gap-2">
        <CopyButton text={summaryText} label="Copiar resumen" />
        <DownloadButton content={summaryText} filename="subred.txt" label="Descargar TXT" />
        {divided ? <DownloadButton content={csv} filename="subredes.csv" mimeType="text/csv;charset=utf-8" label="Descargar CSV" /> : null}
        <ResetButton
          onReset={() => {
            setIp("");
            setPrefixText("24");
            setMaskText("");
            setError(null);
            setV4Info(null);
            setV6Info(null);
            setDivided(null);
            setMembership(null);
            setCompareResult(null);
          }}
        />
      </div>
    </div>
  );
}
