declare module 'html2pdf.js' {
  interface Html2PdfChain {
    set: (options: unknown) => Html2PdfChain;
    from: (element: HTMLElement) => Html2PdfChain;
    save: () => Promise<void> | void;
  }

  export default function html2pdf(): Html2PdfChain;
}
