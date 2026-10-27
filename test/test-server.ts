import { serve } from '@hono/node-server'
import { Hono } from 'hono'
import detectPort from 'detect-port'

export interface TestServer {
  url: string
  port: number
  app: Hono
  close: () => Promise<void>
}

export async function createTestServer(configure?: (app: Hono) => void): Promise<TestServer> {
  const app = new Hono()
  if (configure) {
    configure(app)
  }

  const port = await detectPort(0)
  const server = serve({
    fetch: app.fetch,
    port,
  })

  return {
    url: `http://localhost:${port}`,
    port,
    app,
    close: () =>
      new Promise<void>((resolve, reject) => {
        server.close((err?: Error) => (err ? reject(err) : resolve()))
      }),
  }
}
