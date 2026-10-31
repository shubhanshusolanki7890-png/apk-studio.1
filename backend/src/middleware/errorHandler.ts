export function errorHandler(err: any, _req: any, res: any, _next?: any): void {
  const statusCode = err?.status || err?.statusCode || 500;
  const message = err?.message || 'Internal Server Error';
  if (!res.headersSent) {
    res.status(statusCode).json({
      error: message
    });
  }
}
