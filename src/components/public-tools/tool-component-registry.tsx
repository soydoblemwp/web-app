import dynamic from "next/dynamic";

/**
 * Per-tool code-split entry points. Each tool's interactive UI (and,
 * transitively, any heavy dependency it pulls in — the local-AI engine,
 * pdf-lib, pdfjs-dist, fflate) is its own chunk — visiting /herramientas or
 * any other single tool page never downloads another tool's code (spec
 * section 36: "no cargues pdf-lib; pdfjs-dist; ZIP... al abrir
 * /herramientas").
 *
 * Deliberately a switch over a statically-known slug set (rather than an
 * object map indexed at render time) so each JSX tag below is a direct
 * reference to a top-level component identifier — satisfies the
 * react-hooks/static-components rule, which otherwise flags any
 * runtime-computed "which component do I render" lookup as if it were
 * constructing a fresh component type on every render.
 */
const WordCounterTool = dynamic(() => import("@/components/public-tools/tools/word-counter-tool").then((m) => m.WordCounterTool));
const RewriterTool = dynamic(() => import("@/components/public-tools/tools/rewriter-tool").then((m) => m.RewriterTool));
const TextCleanerTool = dynamic(() => import("@/components/public-tools/tools/text-cleaner-tool").then((m) => m.TextCleanerTool));
const SummarizerTool = dynamic(() => import("@/components/public-tools/tools/summarizer-tool").then((m) => m.SummarizerTool));
const CorrectorTool = dynamic(() => import("@/components/public-tools/tools/corrector-tool").then((m) => m.CorrectorTool));
const SeoGeneratorTool = dynamic(() => import("@/components/public-tools/tools/seo-generator-tool").then((m) => m.SeoGeneratorTool));
const SocialGeneratorTool = dynamic(() => import("@/components/public-tools/tools/social-generator-tool").then((m) => m.SocialGeneratorTool));
const QrGeneratorTool = dynamic(() => import("@/components/public-tools/tools/qr-generator-tool").then((m) => m.QrGeneratorTool));
const ImageCompressorTool = dynamic(() => import("@/components/public-tools/tools/image-compressor-tool").then((m) => m.ImageCompressorTool));
const UtmGeneratorTool = dynamic(() => import("@/components/public-tools/tools/utm-generator-tool").then((m) => m.UtmGeneratorTool));
const TitleAnalyzerTool = dynamic(() => import("@/components/public-tools/tools/title-analyzer-tool").then((m) => m.TitleAnalyzerTool));
const RepurposerTool = dynamic(() => import("@/components/public-tools/tools/repurposer-tool").then((m) => m.RepurposerTool));
const EngagementCalculatorTool = dynamic(() => import("@/components/public-tools/tools/engagement-calculator-tool").then((m) => m.EngagementCalculatorTool));

// Fase 42
const MergePdfTool = dynamic(() => import("@/components/public-tools/tools/merge-pdf-tool").then((m) => m.MergePdfTool));
const SplitPdfTool = dynamic(() => import("@/components/public-tools/tools/split-pdf-tool").then((m) => m.SplitPdfTool));
const OrganizePdfTool = dynamic(() => import("@/components/public-tools/tools/organize-pdf-tool").then((m) => m.OrganizePdfTool));
const ImagesToPdfTool = dynamic(() => import("@/components/public-tools/tools/images-to-pdf-tool").then((m) => m.ImagesToPdfTool));
const PdfToImagesTool = dynamic(() => import("@/components/public-tools/tools/pdf-to-images-tool").then((m) => m.PdfToImagesTool));
const WatermarkPdfTool = dynamic(() => import("@/components/public-tools/tools/watermark-pdf-tool").then((m) => m.WatermarkPdfTool));
const PageNumbersPdfTool = dynamic(() => import("@/components/public-tools/tools/page-numbers-pdf-tool").then((m) => m.PageNumbersPdfTool));
const CropImageTool = dynamic(() => import("@/components/public-tools/tools/crop-image-tool").then((m) => m.CropImageTool));
const StripMetadataTool = dynamic(() => import("@/components/public-tools/tools/strip-metadata-tool").then((m) => m.StripMetadataTool));
const FaviconTool = dynamic(() => import("@/components/public-tools/tools/favicon-tool").then((m) => m.FaviconTool));
const PaletteTool = dynamic(() => import("@/components/public-tools/tools/palette-tool").then((m) => m.PaletteTool));
const RedactImageTool = dynamic(() => import("@/components/public-tools/tools/redact-image-tool").then((m) => m.RedactImageTool));

// Fase 43
const PasswordGeneratorTool = dynamic(() => import("@/components/public-tools/tools/password-generator-tool").then((m) => m.PasswordGeneratorTool));
const PasswordStrengthTool = dynamic(() => import("@/components/public-tools/tools/password-strength-tool").then((m) => m.PasswordStrengthTool));
const UuidGeneratorTool = dynamic(() => import("@/components/public-tools/tools/uuid-generator-tool").then((m) => m.UuidGeneratorTool));
const HashGeneratorTool = dynamic(() => import("@/components/public-tools/tools/hash-generator-tool").then((m) => m.HashGeneratorTool));
const JsonFormatterTool = dynamic(() => import("@/components/public-tools/tools/json-formatter-tool").then((m) => m.JsonFormatterTool));
const Base64Tool = dynamic(() => import("@/components/public-tools/tools/base64-tool").then((m) => m.Base64Tool));
const UrlEncoderTool = dynamic(() => import("@/components/public-tools/tools/url-encoder-tool").then((m) => m.UrlEncoderTool));
const TimestampConverterTool = dynamic(() => import("@/components/public-tools/tools/timestamp-converter-tool").then((m) => m.TimestampConverterTool));
const UnitConverterTool = dynamic(() => import("@/components/public-tools/tools/unit-converter-tool").then((m) => m.UnitConverterTool));
const PercentageCalculatorTool = dynamic(() => import("@/components/public-tools/tools/percentage-calculator-tool").then((m) => m.PercentageCalculatorTool));
const AgeDateCalculatorTool = dynamic(() => import("@/components/public-tools/tools/age-date-calculator-tool").then((m) => m.AgeDateCalculatorTool));
const ColorContrastTool = dynamic(() => import("@/components/public-tools/tools/color-contrast-tool").then((m) => m.ColorContrastTool));

// Fase 44
const InvoiceGeneratorTool = dynamic(() => import("@/components/public-tools/tools/invoice-generator-tool").then((m) => m.InvoiceGeneratorTool));
const EmailSignatureTool = dynamic(() => import("@/components/public-tools/tools/email-signature-tool").then((m) => m.EmailSignatureTool));
const OpenGraphTool = dynamic(() => import("@/components/public-tools/tools/open-graph-tool").then((m) => m.OpenGraphTool));
const RobotsTxtTool = dynamic(() => import("@/components/public-tools/tools/robots-txt-tool").then((m) => m.RobotsTxtTool));
const SitemapGeneratorTool = dynamic(() => import("@/components/public-tools/tools/sitemap-generator-tool").then((m) => m.SitemapGeneratorTool));
const SchemaGeneratorTool = dynamic(() => import("@/components/public-tools/tools/schema-generator-tool").then((m) => m.SchemaGeneratorTool));
const CssGradientTool = dynamic(() => import("@/components/public-tools/tools/css-gradient-tool").then((m) => m.CssGradientTool));
const CssBoxShadowTool = dynamic(() => import("@/components/public-tools/tools/css-box-shadow-tool").then((m) => m.CssBoxShadowTool));
const MarkdownEditorTool = dynamic(() => import("@/components/public-tools/tools/markdown-editor-tool").then((m) => m.MarkdownEditorTool));
const CsvJsonTool = dynamic(() => import("@/components/public-tools/tools/csv-json-tool").then((m) => m.CsvJsonTool));
const RegexTesterTool = dynamic(() => import("@/components/public-tools/tools/regex-tester-tool").then((m) => m.RegexTesterTool));
const CronGeneratorTool = dynamic(() => import("@/components/public-tools/tools/cron-generator-tool").then((m) => m.CronGeneratorTool));

// Fase 45
const TrimAudioTool = dynamic(() => import("@/components/public-tools/tools/trim-audio-tool").then((m) => m.TrimAudioTool));
const JoinAudioTool = dynamic(() => import("@/components/public-tools/tools/join-audio-tool").then((m) => m.JoinAudioTool));
const ConvertAudioTool = dynamic(() => import("@/components/public-tools/tools/convert-audio-tool").then((m) => m.ConvertAudioTool));
const TrimVideoTool = dynamic(() => import("@/components/public-tools/tools/trim-video-tool").then((m) => m.TrimVideoTool));
const CompressVideoTool = dynamic(() => import("@/components/public-tools/tools/compress-video-tool").then((m) => m.CompressVideoTool));
const ResizeVideoTool = dynamic(() => import("@/components/public-tools/tools/resize-video-tool").then((m) => m.ResizeVideoTool));
const ExtractAudioTool = dynamic(() => import("@/components/public-tools/tools/extract-audio-tool").then((m) => m.ExtractAudioTool));
const VideoToGifTool = dynamic(() => import("@/components/public-tools/tools/video-to-gif-tool").then((m) => m.VideoToGifTool));
const ExtractFramesTool = dynamic(() => import("@/components/public-tools/tools/extract-frames-tool").then((m) => m.ExtractFramesTool));
const SubtitleEditorTool = dynamic(() => import("@/components/public-tools/tools/subtitle-editor-tool").then((m) => m.SubtitleEditorTool));
const VoiceRecorderTool = dynamic(() => import("@/components/public-tools/tools/voice-recorder-tool").then((m) => m.VoiceRecorderTool));
const ScreenRecorderTool = dynamic(() => import("@/components/public-tools/tools/screen-recorder-tool").then((m) => m.ScreenRecorderTool));

// Fase 46
const ScientificCalculatorTool = dynamic(() => import("@/components/public-tools/tools/scientific-calculator-tool").then((m) => m.ScientificCalculatorTool));
const LoanCalculatorTool = dynamic(() => import("@/components/public-tools/tools/loan-calculator-tool").then((m) => m.LoanCalculatorTool));
const CompoundInterestCalculatorTool = dynamic(() => import("@/components/public-tools/tools/compound-interest-calculator-tool").then((m) => m.CompoundInterestCalculatorTool));
const BusinessDaysCalculatorTool = dynamic(() => import("@/components/public-tools/tools/business-days-calculator-tool").then((m) => m.BusinessDaysCalculatorTool));
const TimezoneMeetingPlannerTool = dynamic(() => import("@/components/public-tools/tools/timezone-meeting-planner-tool").then((m) => m.TimezoneMeetingPlannerTool));
const WorkHoursCalculatorTool = dynamic(() => import("@/components/public-tools/tools/work-hours-calculator-tool").then((m) => m.WorkHoursCalculatorTool));
const StopwatchTimerTool = dynamic(() => import("@/components/public-tools/tools/stopwatch-timer-tool").then((m) => m.StopwatchTimerTool));
const PomodoroTimerTool = dynamic(() => import("@/components/public-tools/tools/pomodoro-timer-tool").then((m) => m.PomodoroTimerTool));
const RandomPickerTeamsTool = dynamic(() => import("@/components/public-tools/tools/random-picker-teams-tool").then((m) => m.RandomPickerTeamsTool));
const TypingSpeedTestTool = dynamic(() => import("@/components/public-tools/tools/typing-speed-test-tool").then((m) => m.TypingSpeedTestTool));
const BarcodeGeneratorTool = dynamic(() => import("@/components/public-tools/tools/barcode-generator-tool").then((m) => m.BarcodeGeneratorTool));
const TextComparatorTool = dynamic(() => import("@/components/public-tools/tools/text-comparator-tool").then((m) => m.TextComparatorTool));

// Fase 47
const ResumeBuilderTool = dynamic(() => import("@/components/public-tools/tools/resume-builder-tool").then((m) => m.ResumeBuilderTool));
const CoverLetterTool = dynamic(() => import("@/components/public-tools/tools/cover-letter-tool").then((m) => m.CoverLetterTool));
const BusinessCardTool = dynamic(() => import("@/components/public-tools/tools/business-card-tool").then((m) => m.BusinessCardTool));
const ReceiptGeneratorTool = dynamic(() => import("@/components/public-tools/tools/receipt-generator-tool").then((m) => m.ReceiptGeneratorTool));
const PurchaseOrderTool = dynamic(() => import("@/components/public-tools/tools/purchase-order-tool").then((m) => m.PurchaseOrderTool));
const DeliveryNoteTool = dynamic(() => import("@/components/public-tools/tools/delivery-note-tool").then((m) => m.DeliveryNoteTool));
const PrintableCalendarTool = dynamic(() => import("@/components/public-tools/tools/printable-calendar-tool").then((m) => m.PrintableCalendarTool));
const PlannerTool = dynamic(() => import("@/components/public-tools/tools/planner-tool").then((m) => m.PlannerTool));
const PrintableChecklistTool = dynamic(() => import("@/components/public-tools/tools/printable-checklist-tool").then((m) => m.PrintableChecklistTool));
const MeetingAgendaMinutesTool = dynamic(() => import("@/components/public-tools/tools/meeting-agenda-minutes-tool").then((m) => m.MeetingAgendaMinutesTool));
const RecognitionCertificateTool = dynamic(() => import("@/components/public-tools/tools/recognition-certificate-tool").then((m) => m.RecognitionCertificateTool));
const LabelGeneratorTool = dynamic(() => import("@/components/public-tools/tools/label-generator-tool").then((m) => m.LabelGeneratorTool));

// Fase 48
const BreakEvenTool = dynamic(() => import("@/components/public-tools/tools/break-even-tool").then((m) => m.BreakEvenTool));
const RoiRoasPaybackTool = dynamic(() => import("@/components/public-tools/tools/roi-roas-payback-tool").then((m) => m.RoiRoasPaybackTool));
const InventoryReorderTool = dynamic(() => import("@/components/public-tools/tools/inventory-reorder-tool").then((m) => m.InventoryReorderTool));
const ProductProfitabilityTool = dynamic(() => import("@/components/public-tools/tools/product-profitability-tool").then((m) => m.ProductProfitabilityTool));
const SalesCommissionTool = dynamic(() => import("@/components/public-tools/tools/sales-commission-tool").then((m) => m.SalesCommissionTool));
const UnitPriceComparatorTool = dynamic(() => import("@/components/public-tools/tools/unit-price-comparator-tool").then((m) => m.UnitPriceComparatorTool));
const GpaCalculatorTool = dynamic(() => import("@/components/public-tools/tools/gpa-calculator-tool").then((m) => m.GpaCalculatorTool));
const FinalGradeTool = dynamic(() => import("@/components/public-tools/tools/final-grade-tool").then((m) => m.FinalGradeTool));
const FuelTripCostTool = dynamic(() => import("@/components/public-tools/tools/fuel-trip-cost-tool").then((m) => m.FuelTripCostTool));
const RecipeScalerTool = dynamic(() => import("@/components/public-tools/tools/recipe-scaler-tool").then((m) => m.RecipeScalerTool));
const RecipeCostTool = dynamic(() => import("@/components/public-tools/tools/recipe-cost-tool").then((m) => m.RecipeCostTool));
const ElectricityConsumptionTool = dynamic(() => import("@/components/public-tools/tools/electricity-consumption-tool").then((m) => m.ElectricityConsumptionTool));

// Fase 49
const YamlJsonTool = dynamic(() => import("@/components/public-tools/tools/yaml-json-tool").then((m) => m.YamlJsonTool));
const XmlTool = dynamic(() => import("@/components/public-tools/tools/xml-tool").then((m) => m.XmlTool));
const TomlJsonTool = dynamic(() => import("@/components/public-tools/tools/toml-json-tool").then((m) => m.TomlJsonTool));
const SqlFormatterTool = dynamic(() => import("@/components/public-tools/tools/sql-formatter-tool").then((m) => m.SqlFormatterTool));
const WebCodeFormatterTool = dynamic(() => import("@/components/public-tools/tools/web-code-formatter-tool").then((m) => m.WebCodeFormatterTool));
const JsonSchemaValidatorTool = dynamic(() => import("@/components/public-tools/tools/json-schema-validator-tool").then((m) => m.JsonSchemaValidatorTool));
const JwtTool = dynamic(() => import("@/components/public-tools/tools/jwt-tool").then((m) => m.JwtTool));
const HmacTool = dynamic(() => import("@/components/public-tools/tools/hmac-tool").then((m) => m.HmacTool));
const CspTool = dynamic(() => import("@/components/public-tools/tools/csp-tool").then((m) => m.CspTool));
const SecurityHeadersTool = dynamic(() => import("@/components/public-tools/tools/security-headers-tool").then((m) => m.SecurityHeadersTool));
const IpSubnetTool = dynamic(() => import("@/components/public-tools/tools/ip-subnet-tool").then((m) => m.IpSubnetTool));
const UrlAnalyzerTool = dynamic(() => import("@/components/public-tools/tools/url-analyzer-tool").then((m) => m.UrlAnalyzerTool));

/** The full, closed set of public tool slugs this registry can render — kept in sync with PUBLIC_TOOL_DEFINITIONS by the registry-consistency test. */
export const RENDERABLE_TOOL_SLUGS = [
  "contador-de-palabras",
  "reescritor-de-textos",
  "limpiador-de-texto",
  "resumidor-de-textos",
  "corrector-de-textos",
  "generador-titulos-meta-descripciones",
  "generador-contenido-redes-sociales",
  "generador-codigo-qr",
  "comprimir-imagen",
  "generador-utm",
  "analizador-de-titulos",
  "reutilizador-de-contenido",
  "calculadora-engagement",
  "unir-pdf",
  "dividir-pdf",
  "organizar-pdf",
  "imagenes-a-pdf",
  "pdf-a-imagenes",
  "marca-de-agua-pdf",
  "numerar-paginas-pdf",
  "recortar-imagen",
  "eliminar-metadatos-imagen",
  "generador-favicon",
  "extraer-paleta-colores",
  "ocultar-informacion-imagen",
  "generador-contrasenas",
  "comprobar-fortaleza-contrasena",
  "generador-uuid",
  "generador-hash",
  "formatear-json",
  "codificar-base64",
  "codificar-url",
  "convertidor-timestamp-unix",
  "conversor-unidades",
  "calculadora-porcentajes",
  "calculadora-edad-fechas",
  "comprobar-contraste-colores",
  "generador-facturas-presupuestos",
  "generador-firma-correo",
  "generador-open-graph",
  "generador-robots-txt",
  "generador-sitemap-xml",
  "generador-schema-json-ld",
  "generador-degradados-css",
  "generador-sombras-css",
  "editor-markdown",
  "convertir-csv-json",
  "probador-expresiones-regulares",
  "generador-expresiones-cron",
  "recortar-audio",
  "unir-audios",
  "convertir-audio",
  "recortar-video",
  "comprimir-video",
  "redimensionar-video",
  "extraer-audio-video",
  "video-a-gif",
  "extraer-fotogramas-video",
  "editar-subtitulos",
  "grabador-de-voz",
  "grabador-de-pantalla",
  "calculadora-cientifica",
  "calculadora-prestamos",
  "calculadora-interes-compuesto",
  "calculadora-dias-laborables",
  "planificador-reuniones-zonas-horarias",
  "calculadora-horas-trabajadas",
  "cronometro-temporizador",
  "temporizador-pomodoro",
  "selector-aleatorio-equipos",
  "prueba-velocidad-escritura",
  "generador-codigo-barras",
  "comparar-textos",
  "crear-curriculum-cv",
  "generador-carta-presentacion",
  "generador-tarjetas-presentacion",
  "generador-recibos",
  "generador-ordenes-compra",
  "generador-notas-entrega",
  "generador-calendarios-imprimibles",
  "generador-planificador-semanal-mensual",
  "generador-listas-verificacion",
  "generador-agendas-actas-reunion",
  "generador-certificados-reconocimiento",
  "generador-etiquetas-pegatinas",
  "calculadora-punto-equilibrio",
  "calculadora-roi-roas-recuperacion",
  "calculadora-inventario-reposicion",
  "calculadora-rentabilidad-productos",
  "calculadora-comisiones-ventas",
  "comparador-precio-unidad",
  "calculadora-gpa-promedio",
  "calculadora-nota-final",
  "calculadora-costo-combustible-viaje",
  "escalar-recetas",
  "calculadora-costo-receta",
  "calculadora-consumo-electrico",
  "convertir-yaml-json",
  "formatear-validar-xml",
  "convertir-toml-json",
  "formateador-sql",
  "formateador-html-css-javascript",
  "validador-json-schema",
  "decodificar-verificar-jwt",
  "generador-verificador-hmac",
  "generador-analizador-csp",
  "analizador-cabeceras-seguridad",
  "calculadora-subredes-ip-cidr",
  "analizador-constructor-url",
] as const;

export function renderToolComponent(slug: string): React.ReactNode {
  switch (slug) {
    case "contador-de-palabras":
      return <WordCounterTool />;
    case "reescritor-de-textos":
      return <RewriterTool />;
    case "limpiador-de-texto":
      return <TextCleanerTool />;
    case "resumidor-de-textos":
      return <SummarizerTool />;
    case "corrector-de-textos":
      return <CorrectorTool />;
    case "generador-titulos-meta-descripciones":
      return <SeoGeneratorTool />;
    case "generador-contenido-redes-sociales":
      return <SocialGeneratorTool />;
    case "generador-codigo-qr":
      return <QrGeneratorTool />;
    case "comprimir-imagen":
      return <ImageCompressorTool />;
    case "generador-utm":
      return <UtmGeneratorTool />;
    case "analizador-de-titulos":
      return <TitleAnalyzerTool />;
    case "reutilizador-de-contenido":
      return <RepurposerTool />;
    case "calculadora-engagement":
      return <EngagementCalculatorTool />;
    case "unir-pdf":
      return <MergePdfTool />;
    case "dividir-pdf":
      return <SplitPdfTool />;
    case "organizar-pdf":
      return <OrganizePdfTool />;
    case "imagenes-a-pdf":
      return <ImagesToPdfTool />;
    case "pdf-a-imagenes":
      return <PdfToImagesTool />;
    case "marca-de-agua-pdf":
      return <WatermarkPdfTool />;
    case "numerar-paginas-pdf":
      return <PageNumbersPdfTool />;
    case "recortar-imagen":
      return <CropImageTool />;
    case "eliminar-metadatos-imagen":
      return <StripMetadataTool />;
    case "generador-favicon":
      return <FaviconTool />;
    case "extraer-paleta-colores":
      return <PaletteTool />;
    case "ocultar-informacion-imagen":
      return <RedactImageTool />;
    case "generador-contrasenas":
      return <PasswordGeneratorTool />;
    case "comprobar-fortaleza-contrasena":
      return <PasswordStrengthTool />;
    case "generador-uuid":
      return <UuidGeneratorTool />;
    case "generador-hash":
      return <HashGeneratorTool />;
    case "formatear-json":
      return <JsonFormatterTool />;
    case "codificar-base64":
      return <Base64Tool />;
    case "codificar-url":
      return <UrlEncoderTool />;
    case "convertidor-timestamp-unix":
      return <TimestampConverterTool />;
    case "conversor-unidades":
      return <UnitConverterTool />;
    case "calculadora-porcentajes":
      return <PercentageCalculatorTool />;
    case "calculadora-edad-fechas":
      return <AgeDateCalculatorTool />;
    case "comprobar-contraste-colores":
      return <ColorContrastTool />;
    case "generador-facturas-presupuestos":
      return <InvoiceGeneratorTool />;
    case "generador-firma-correo":
      return <EmailSignatureTool />;
    case "generador-open-graph":
      return <OpenGraphTool />;
    case "generador-robots-txt":
      return <RobotsTxtTool />;
    case "generador-sitemap-xml":
      return <SitemapGeneratorTool />;
    case "generador-schema-json-ld":
      return <SchemaGeneratorTool />;
    case "generador-degradados-css":
      return <CssGradientTool />;
    case "generador-sombras-css":
      return <CssBoxShadowTool />;
    case "editor-markdown":
      return <MarkdownEditorTool />;
    case "convertir-csv-json":
      return <CsvJsonTool />;
    case "probador-expresiones-regulares":
      return <RegexTesterTool />;
    case "generador-expresiones-cron":
      return <CronGeneratorTool />;
    case "recortar-audio":
      return <TrimAudioTool />;
    case "unir-audios":
      return <JoinAudioTool />;
    case "convertir-audio":
      return <ConvertAudioTool />;
    case "recortar-video":
      return <TrimVideoTool />;
    case "comprimir-video":
      return <CompressVideoTool />;
    case "redimensionar-video":
      return <ResizeVideoTool />;
    case "extraer-audio-video":
      return <ExtractAudioTool />;
    case "video-a-gif":
      return <VideoToGifTool />;
    case "extraer-fotogramas-video":
      return <ExtractFramesTool />;
    case "editar-subtitulos":
      return <SubtitleEditorTool />;
    case "grabador-de-voz":
      return <VoiceRecorderTool />;
    case "grabador-de-pantalla":
      return <ScreenRecorderTool />;
    case "calculadora-cientifica":
      return <ScientificCalculatorTool />;
    case "calculadora-prestamos":
      return <LoanCalculatorTool />;
    case "calculadora-interes-compuesto":
      return <CompoundInterestCalculatorTool />;
    case "calculadora-dias-laborables":
      return <BusinessDaysCalculatorTool />;
    case "planificador-reuniones-zonas-horarias":
      return <TimezoneMeetingPlannerTool />;
    case "calculadora-horas-trabajadas":
      return <WorkHoursCalculatorTool />;
    case "cronometro-temporizador":
      return <StopwatchTimerTool />;
    case "temporizador-pomodoro":
      return <PomodoroTimerTool />;
    case "selector-aleatorio-equipos":
      return <RandomPickerTeamsTool />;
    case "prueba-velocidad-escritura":
      return <TypingSpeedTestTool />;
    case "generador-codigo-barras":
      return <BarcodeGeneratorTool />;
    case "comparar-textos":
      return <TextComparatorTool />;
    case "crear-curriculum-cv":
      return <ResumeBuilderTool />;
    case "generador-carta-presentacion":
      return <CoverLetterTool />;
    case "generador-tarjetas-presentacion":
      return <BusinessCardTool />;
    case "generador-recibos":
      return <ReceiptGeneratorTool />;
    case "generador-ordenes-compra":
      return <PurchaseOrderTool />;
    case "generador-notas-entrega":
      return <DeliveryNoteTool />;
    case "generador-calendarios-imprimibles":
      return <PrintableCalendarTool />;
    case "generador-planificador-semanal-mensual":
      return <PlannerTool />;
    case "generador-listas-verificacion":
      return <PrintableChecklistTool />;
    case "generador-agendas-actas-reunion":
      return <MeetingAgendaMinutesTool />;
    case "generador-certificados-reconocimiento":
      return <RecognitionCertificateTool />;
    case "generador-etiquetas-pegatinas":
      return <LabelGeneratorTool />;
    case "calculadora-punto-equilibrio":
      return <BreakEvenTool />;
    case "calculadora-roi-roas-recuperacion":
      return <RoiRoasPaybackTool />;
    case "calculadora-inventario-reposicion":
      return <InventoryReorderTool />;
    case "calculadora-rentabilidad-productos":
      return <ProductProfitabilityTool />;
    case "calculadora-comisiones-ventas":
      return <SalesCommissionTool />;
    case "comparador-precio-unidad":
      return <UnitPriceComparatorTool />;
    case "calculadora-gpa-promedio":
      return <GpaCalculatorTool />;
    case "calculadora-nota-final":
      return <FinalGradeTool />;
    case "calculadora-costo-combustible-viaje":
      return <FuelTripCostTool />;
    case "escalar-recetas":
      return <RecipeScalerTool />;
    case "calculadora-costo-receta":
      return <RecipeCostTool />;
    case "calculadora-consumo-electrico":
      return <ElectricityConsumptionTool />;
    case "convertir-yaml-json":
      return <YamlJsonTool />;
    case "formatear-validar-xml":
      return <XmlTool />;
    case "convertir-toml-json":
      return <TomlJsonTool />;
    case "formateador-sql":
      return <SqlFormatterTool />;
    case "formateador-html-css-javascript":
      return <WebCodeFormatterTool />;
    case "validador-json-schema":
      return <JsonSchemaValidatorTool />;
    case "decodificar-verificar-jwt":
      return <JwtTool />;
    case "generador-verificador-hmac":
      return <HmacTool />;
    case "generador-analizador-csp":
      return <CspTool />;
    case "analizador-cabeceras-seguridad":
      return <SecurityHeadersTool />;
    case "calculadora-subredes-ip-cidr":
      return <IpSubnetTool />;
    case "analizador-constructor-url":
      return <UrlAnalyzerTool />;
    default:
      return null;
  }
}
