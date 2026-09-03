// Web counterpart to buildImageFormDataPart.ts. `imageUri` here is always a
// directly-fetchable `blob:`/`data:` URL (createOcrDerivative's own web
// implementation returns one — see receiptImage.service.web.ts), so a plain
// fetch-and-read-as-blob round trip produces the same Blob the native side
// gets from expo-file-system's `File`, with no native module involved at all.
export async function buildImageFormDataPart(imageUri: string): Promise<Blob> {
  const response = await fetch(imageUri);
  return response.blob();
}
