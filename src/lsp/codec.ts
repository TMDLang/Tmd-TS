// MARK: - JSON-RPC Frame & Codec

export interface TmdJSONRPCFrame {
  id?: number | string | null;
  method?: string;
  params?: any;
  result?: any;
  error?: any;
}

export interface TmdJSONRPCResponse {
  id?: number | string | null;
  result?: any;
  error?: any;
}

export class TmdJSONRPCCodec {
  public static decode(input: string): TmdJSONRPCFrame[] {
    const res = this.decodeBuffer(new TextEncoder().encode(input));
    return res.frames;
  }

  public static decodeBuffer(buffer: Uint8Array): { frames: TmdJSONRPCFrame[]; remaining: Uint8Array } {
    const frames: TmdJSONRPCFrame[] = [];
    let current = buffer;
    const separator = new TextEncoder().encode("\r\n\r\n");
    const decoder = new TextDecoder();

    while (true) {
      let sepIndex = -1;
      for (let i = 0; i <= current.length - separator.length; i++) {
        let matches = true;
        for (let j = 0; j < separator.length; j++) {
          if (current[i + j] !== separator[j]) {
            matches = false;
            break;
          }
        }
        if (matches) {
          sepIndex = i;
          break;
        }
      }
      if (sepIndex === -1) break;

      const headerStr = decoder.decode(current.subarray(0, sepIndex));
      let contentLength: number | null = null;
      for (const line of headerStr.split("\r\n")) {
        const parts = line.split(":");
        if (parts.length >= 2 && parts[0].trim().toLowerCase() === "content-length") {
          contentLength = parseInt(parts[1].trim(), 10);
        }
      }

      if (contentLength === null || isNaN(contentLength)) {
        break;
      }

      const bodyStart = sepIndex + separator.length;
      const bodyEnd = bodyStart + contentLength;
      if (current.length < bodyEnd) {
        // Incomplete body chunk, wait for next buffer data
        break;
      }

      const bodyBuffer = current.subarray(bodyStart, bodyEnd);
      current = current.subarray(bodyEnd);

      try {
        const obj = JSON.parse(decoder.decode(bodyBuffer));
        frames.push({
          id: obj.id,
          method: obj.method,
          params: obj.params,
          result: obj.result,
          error: obj.error,
        });
      } catch (_) {}
    }

    return { frames, remaining: current };
  }

  public static encode(response: TmdJSONRPCResponse): string {
    const payload: Record<string, any> = {
      jsonrpc: "2.0",
      id: response.id !== undefined ? response.id : null,
    };
    if (response.result !== undefined) payload.result = response.result;
    if (response.error !== undefined) payload.error = response.error;
    return this.encodePayload(payload);
  }

  public static encodeNotification(method: string, params: any): string {
    const payload = {
      jsonrpc: "2.0",
      method,
      params,
    };
    return this.encodePayload(payload);
  }

  private static encodePayload(dict: Record<string, any>): string {
    const jsonStr = JSON.stringify(dict);
    const length = new TextEncoder().encode(jsonStr).byteLength;
    return `Content-Length: ${length}\r\n\r\n${jsonStr}`;
  }
}

// MARK: - Completion Engine
