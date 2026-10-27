import { createBenchServer } from './app'

const PORT = Number(process.env.PORT) || 4100

async function main() {
  console.log('🚀 Starting ScraplingJS Test Bench Server...')
  const instance = await createBenchServer(PORT)
  console.log(`\n======================================================`)
  console.log(`✨ Test Bench Dashboard running at: ${instance.url}`)
  console.log(`✨ Open in browser to interactively test element relocation!`)
  console.log(`======================================================\n`)

  const shutdown = async () => {
    console.log('\nStopping test bench server...')
    await instance.close()
    process.exit(0)
  }

  process.on('SIGINT', shutdown)
  process.on('SIGTERM', shutdown)
}

main().catch((err) => {
  console.error('Server startup error:', err)
  process.exit(1)
})
