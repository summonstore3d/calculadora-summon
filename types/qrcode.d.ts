// Tipos mínimos do pacote "qrcode" (o pacote não traz os próprios, e @types/qrcode não está instalado).
declare module "qrcode" {
  type Options = {
    width?: number;
    margin?: number;
    errorCorrectionLevel?: "L" | "M" | "Q" | "H";
    color?: { dark?: string; light?: string };
  };
  const QRCode: { toDataURL(text: string, options?: Options): Promise<string> };
  export default QRCode;
}
