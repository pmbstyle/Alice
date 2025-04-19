export class Logger {
  private prefix: string
  private logLevel: 'debug' | 'info' | 'warn' | 'error'

  constructor(
    prefix: string,
    logLevel: 'debug' | 'info' | 'warn' | 'error' = 'info'
  ) {
    this.prefix = prefix
    this.logLevel = import.meta.env.PROD ? 'info' : logLevel
  }

  debug(message: string, ...args: any[]): void {
    if (this.logLevel === 'debug')
      console.debug(`[${this.prefix}] ${message}`, ...args)
  }

  info(message: string, ...args: any[]): void {
    if (this.logLevel === 'debug' || this.logLevel === 'info')
      console.log(`[${this.prefix}] ${message}`, ...args)
  }

  warn(message: string, ...args: any[]): void {
    if (this.logLevel !== 'error')
      console.warn(`[${this.prefix}] ${message}`, ...args)
  }

  error(message: string, ...args: any[]): void {
    console.error(`[${this.prefix}] ${message}`, ...args)
  }
}