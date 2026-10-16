/**
 * PUTs a file to a presigned storage URL and reports how much has been sent (0 to 1). XMLHttpRequest rather than fetch,
 * because fetch cannot report upload progress. Resolves true when the store accepted the file, false on any refusal or
 * network failure; it never rejects.
 */
export function putWithProgress(url: string, headers: Record<string, string>, file: Blob, onProgress: (fraction: number) => void): Promise<boolean> {
  return new Promise(resolve => {
    const request = new XMLHttpRequest();
    request.open("PUT", url);
    for (const [name, value] of Object.entries(headers)) request.setRequestHeader(name, value);
    request.upload.onprogress = event => { if (event.lengthComputable && event.total > 0) onProgress(Math.min(1, event.loaded / event.total)); };
    request.onload = () => resolve(request.status >= 200 && request.status < 300);
    request.onerror = request.onabort = request.ontimeout = () => resolve(false);
    request.send(file);
  });
}
