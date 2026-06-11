export const logger = {
  info(tag: string, message: string, ...args: any[]) {
    console.log(`\x1b[36m[${tag.toUpperCase()}]\x1b[0m ${message}`, ...args);
  },
  
  success(tag: string, message: string, ...args: any[]) {
    console.log(`\x1b[32m[${tag.toUpperCase()}] [SUCCESS]\x1b[0m \x1b[32m${message}\x1b[0m`, ...args);
  },
  
  warn(tag: string, message: string, ...args: any[]) {
    console.warn(`\x1b[33m[${tag.toUpperCase()}] [WARN]\x1b[0m \x1b[33m${message}\x1b[0m`, ...args);
  },
  
  error(tag: string, message: string, error?: any, ...args: any[]) {
    console.error(`\x1b[31m[${tag.toUpperCase()}] [ERROR]\x1b[0m \x1b[31m${message}\x1b[0m`, ...args);
    if (error) {
      if (error instanceof Error) {
        console.error(error.stack || error.message);
      } else {
        console.error(error);
      }
    }
  },
  
  debug(tag: string, message: string, ...args: any[]) {
    if (process.env.DEBUG === 'true') {
      console.log(`\x1b[35m[${tag.toUpperCase()}] [DEBUG]\x1b[0m ${message}`, ...args);
    }
  }
};
export default logger;
