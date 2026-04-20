import { handleUpload, type HandleUploadBody } from '@vercel/blob/client';
import { beginSpan } from '@/lib/observability/log';
import { z } from 'zod';
import { AuthError, requireCoachRoleForProgram } from '@/lib/auth/guards';

/**
 * Client-upload endpoint for game film videos.
 *
 * Uses Vercel Blob's client-upload pattern:
 *   1. Browser calls this endpoint to get a signed URL
 *   2. Browser uploads directly to Blob (no 4.5MB body limit)
 *   3. Browser notifies us when done via the completion callback
 *
 * Max file size: 500MB (typical game film is 200-400MB)
 */

// Validate the token payload coming from the client
const clientPayloadSchema = z.object({
  programId: z.string().uuid(),
  gameId: z.string().uuid(),
});

export async function POST(req: Request): Promise<Response> {
  const span = beginSpan({ route: '/api/upload-video', method: 'POST' }, req);

  try {
    const body = (await req.json()) as HandleUploadBody;

    const jsonResponse = await handleUpload({
      body,
      request: req,
      onBeforeGenerateToken: async (_pathname, clientPayloadStr) => {
        // Validate client payload (programId, gameId)
        if (!clientPayloadStr) {
          throw new Error('Missing client payload');
        }
        const payload = clientPayloadSchema.parse(JSON.parse(clientPayloadStr));
        await requireCoachRoleForProgram('coordinator', payload.programId);

        return {
          allowedContentTypes: [
            'video/mp4', 'video/quicktime', 'video/x-matroska',
            'video/webm', 'video/x-msvideo',
          ],
          maximumSizeInBytes: 500 * 1024 * 1024, // 500MB
          tokenPayload: clientPayloadStr,
        };
      },
      onUploadCompleted: async ({ blob, tokenPayload }) => {
        // Upload completed — we'll trigger analysis when the client calls /api/analyze-video
        span.done({ blobUrl: blob.url, tokenPayload });
      },
    });

    return Response.json(jsonResponse);
  } catch (error) {
    span.fail(error);
    if (error instanceof AuthError) {
      return Response.json({ error: error.message }, { status: error.status });
    }
    const msg = error instanceof Error ? error.message : 'Upload failed';
    return Response.json({ error: msg }, { status: 500 });
  }
}
