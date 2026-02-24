import * as http from "http";

export class PluginHttpServer {
  private server: http.Server | null = null;

  async start(port: number, handler: (req: http.IncomingMessage, res: http.ServerResponse) => void) {
    this.server = http.createServer(handler);
    return new Promise<void>((resolve, reject) => {
      this.server!.on("error", reject);
      this.server!.listen(port, "127.0.0.1", () => resolve());
    });
  }

  async stop() {
    return new Promise<void>((resolve) => {
      if (this.server) {
        this.server.close(() => resolve());
        this.server = null;
      } else {
        resolve();
      }
    });
  }
}
