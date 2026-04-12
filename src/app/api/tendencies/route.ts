import { beginSpan } from '@/lib/observability/log';
import {
  getFormationFrequency,
  getPlayTypeDistribution,
  getPlayDirectionTendency,
  getPersonnelFrequency,
  getSuccessRateByPlayType,
  getSituationBreakdown,
  getSelfScoutAlerts,
} from '@/lib/tendencies/queries';

export async function GET(req: Request): Promise<Response> {
  const span = beginSpan({ route: '/api/tendencies' }, req);

  try {
    const url = new URL(req.url);
    const programId = url.searchParams.get('programId');
    const opponentId = url.searchParams.get('opponentId');
    const type = url.searchParams.get('type') ?? 'overview';

    if (!programId) {
      return Response.json({ error: 'programId required' }, { status: 400 });
    }

    const filter = {
      opponentId: opponentId ?? undefined,
      down: url.searchParams.has('down') ? Number(url.searchParams.get('down')) : undefined,
      distanceBucket: url.searchParams.get('distanceBucket') ?? undefined,
      quarter: url.searchParams.has('quarter') ? Number(url.searchParams.get('quarter')) : undefined,
      formation: url.searchParams.get('formation') ?? undefined,
      personnel: url.searchParams.get('personnel') ?? undefined,
    };

    switch (type) {
      case 'formation': {
        const result = await getFormationFrequency(programId, filter);
        span.done({ type, sampleSize: result.sampleSize });
        return Response.json(result);
      }
      case 'playType': {
        const result = await getPlayTypeDistribution(programId, filter);
        span.done({ type, sampleSize: result.sampleSize });
        return Response.json(result);
      }
      case 'direction': {
        const result = await getPlayDirectionTendency(programId, filter);
        span.done({ type, sampleSize: result.sampleSize });
        return Response.json(result);
      }
      case 'personnel': {
        const result = await getPersonnelFrequency(programId, filter);
        span.done({ type, sampleSize: result.sampleSize });
        return Response.json(result);
      }
      case 'success': {
        const result = await getSuccessRateByPlayType(programId, filter);
        span.done({ type, sampleSize: result.sampleSize });
        return Response.json(result);
      }
      case 'situations': {
        if (!opponentId) {
          return Response.json({ error: 'opponentId required for situation breakdown' }, { status: 400 });
        }
        const result = await getSituationBreakdown(programId, opponentId);
        span.done({ type, situationCount: result.length });
        return Response.json({ situations: result });
      }
      case 'selfScout': {
        const result = await getSelfScoutAlerts(programId);
        span.done({ type, alertCount: result.length });
        return Response.json({ alerts: result });
      }
      case 'overview': {
        // Return all tendency types in one call for the scouting hub
        const [formation, playType, direction, personnel, success] = await Promise.all([
          getFormationFrequency(programId, filter),
          getPlayTypeDistribution(programId, filter),
          getPlayDirectionTendency(programId, filter),
          getPersonnelFrequency(programId, filter),
          getSuccessRateByPlayType(programId, filter),
        ]);

        const situations = opponentId
          ? await getSituationBreakdown(programId, opponentId)
          : [];

        span.done({ type: 'overview', totalPlays: formation.sampleSize });

        return Response.json({
          formation,
          playType,
          direction,
          personnel,
          success,
          situations,
        });
      }
      default:
        return Response.json({ error: `Unknown tendency type: ${type}` }, { status: 400 });
    }
  } catch (error) {
    span.fail(error);
    return Response.json({ error: 'Failed to compute tendencies' }, { status: 500 });
  }
}
