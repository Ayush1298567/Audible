-- Keep updated_at accurate even when app code forgets to set it explicitly.

CREATE OR REPLACE FUNCTION app.touch_updated_at()
  RETURNS trigger
  LANGUAGE plpgsql
AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS touch_updated_at_programs ON "programs";
CREATE TRIGGER touch_updated_at_programs
  BEFORE UPDATE ON "programs"
  FOR EACH ROW
  EXECUTE FUNCTION app.touch_updated_at();

DROP TRIGGER IF EXISTS touch_updated_at_players ON "players";
CREATE TRIGGER touch_updated_at_players
  BEFORE UPDATE ON "players"
  FOR EACH ROW
  EXECUTE FUNCTION app.touch_updated_at();

DROP TRIGGER IF EXISTS touch_updated_at_walkthroughs ON "walkthroughs";
CREATE TRIGGER touch_updated_at_walkthroughs
  BEFORE UPDATE ON "walkthroughs"
  FOR EACH ROW
  EXECUTE FUNCTION app.touch_updated_at();

DROP TRIGGER IF EXISTS touch_updated_at_plays ON "plays";
CREATE TRIGGER touch_updated_at_plays
  BEFORE UPDATE ON "plays"
  FOR EACH ROW
  EXECUTE FUNCTION app.touch_updated_at();

DROP TRIGGER IF EXISTS touch_updated_at_game_plans ON "game_plans";
CREATE TRIGGER touch_updated_at_game_plans
  BEFORE UPDATE ON "game_plans"
  FOR EACH ROW
  EXECUTE FUNCTION app.touch_updated_at();

DROP TRIGGER IF EXISTS touch_updated_at_collections ON "collections";
CREATE TRIGGER touch_updated_at_collections
  BEFORE UPDATE ON "collections"
  FOR EACH ROW
  EXECUTE FUNCTION app.touch_updated_at();
