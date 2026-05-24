interface PdfViewerProps {
  url: string;
  title?: string;
}

export function PdfViewer({ url, title = 'Laudo' }: PdfViewerProps) {
  return (
    <div className="labs-pdf-viewer" data-testid="pdf-viewer">
      <object
        data={url}
        type="application/pdf"
        width="100%"
        height="100%"
        aria-label={title}
      >
        {/* Fallback para iOS Safari e navegadores sem suporte nativo a PDF */}
        <div className="labs-pdf-fallback">
          <p className="t-body-sm muted">Visualização de PDF não disponível neste navegador.</p>
          <a
            href={url}
            target="_blank"
            rel="noopener noreferrer"
            className="btn btn--secondary btn--sm"
          >
            Abrir PDF
          </a>
        </div>
      </object>
    </div>
  );
}
