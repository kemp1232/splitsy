import { File } from 'expo-file-system';

// Expo SDK 57's fetch/FormData implementation only accepts a real Blob (or
// Blob-like object exposing `bytes()`) for file parts — the classic React
// Native `{uri, name, type}` object idiom throws "Unsupported FormDataPart
// implementation" here. expo-file-system's `File` implements the Blob
// interface and satisfies this directly. Split out from
// BackendReceiptOcrService.ts (which has no other native-only dependency)
// specifically so that file doesn't need a `.web.ts` duplicate of its much
// larger shared parsing/validation logic just for this one platform-specific
// step — see buildImageFormDataPart.web.ts for the web counterpart.
export async function buildImageFormDataPart(imageUri: string): Promise<Blob> {
  return new File(imageUri) as unknown as Blob;
}
