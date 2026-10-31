import os from 'os';
import fs from 'fs';
import path from 'path';
import crypto from 'crypto';
import { CONFIG } from '../config';

/**
 * Provides multipart file upload middleware compatible with Multer (`upload.single(fieldName)`).
 * Uses `multer` if installed in node_modules, or a built-in RFC 7578 multipart/form-data parser.
 */
export function createUploadMiddleware() {
  try {
    // eslint-disable-next-line @typescript-eslint/no-var-requires
    const multer = require('multer');
    return multer({
      dest: os.tmpdir(),
      limits: { fileSize: CONFIG.MAX_UPLOAD_SIZE_BYTES }
    });
  } catch {
    return {
      single(fieldName: string) {
        return (req: any, res: any, next: () => void) => {
          const contentType = String(req.headers['content-type'] || '');
          if (!contentType.includes('multipart/form-data')) {
            return next();
          }
          const boundaryMatch = contentType.match(/boundary=(?:"([^"]+)"|([^;]+))/i);
          if (!boundaryMatch) {
            res.status(400).json({ error: 'Malformed multipart/form-data boundary.' });
            return;
          }
          const boundary = `--${boundaryMatch[1] || boundaryMatch[2]}`;
          const rawBuf: Buffer = req.rawBodyBuffer || Buffer.alloc(0);
          if (rawBuf.length > CONFIG.MAX_UPLOAD_SIZE_BYTES) {
            res.status(413).json({ error: 'Uploaded file exceeds maximum allowed size limit.' });
            return;
          }

          req.body = req.body || {};
          const boundaryBuf = Buffer.from(boundary);
          let pos = rawBuf.indexOf(boundaryBuf);

          while (pos !== -1) {
            const partStart = pos + boundaryBuf.length;
            if (rawBuf.slice(partStart, partStart + 2).toString() === '--') {
              break;
            }
            const nextBoundary = rawBuf.indexOf(boundaryBuf, partStart);
            if (nextBoundary === -1) break;

            // Strip leading CRLF and trailing CRLF before next boundary
            let sliceStart = partStart;
            if (rawBuf[sliceStart] === 13 && rawBuf[sliceStart + 1] === 10) sliceStart += 2;
            let sliceEnd = nextBoundary;
            if (rawBuf[sliceEnd - 2] === 13 && rawBuf[sliceEnd - 1] === 10) sliceEnd -= 2;

            const partBuf = rawBuf.slice(sliceStart, sliceEnd);
            const headerEnd = partBuf.indexOf(Buffer.from('\r\n\r\n'));
            if (headerEnd !== -1) {
              const headerText = partBuf.slice(0, headerEnd).toString('utf-8');
              const bodyContent = partBuf.slice(headerEnd + 4);
              const nameMatch = headerText.match(/name="([^"]+)"/i);
              const fileMatch = headerText.match(/filename="([^"]*)"/i);

              if (nameMatch) {
                const partName = nameMatch[1];
                if (fileMatch && partName === fieldName) {
                  const tmpFile = path.join(os.tmpdir(), `apkstudio_upload_${crypto.randomUUID()}`);
                  fs.writeFileSync(tmpFile, bodyContent);
                  req.file = {
                    fieldname: partName,
                    originalname: fileMatch[1] || 'upload.bin',
                    path: tmpFile,
                    size: bodyContent.length
                  };
                } else if (!fileMatch) {
                  req.body[partName] = bodyContent.toString('utf-8');
                }
              }
            }
            pos = nextBoundary;
          }
          next();
        };
      }
    };
  }
}

export const uploadLimits = createUploadMiddleware();
