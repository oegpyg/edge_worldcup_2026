import {
  BadRequestException,
  Injectable,
  InternalServerErrorException,
  NotFoundException,
  UnauthorizedException,
} from '@nestjs/common';
import { readFileSync } from 'fs';
import { join } from 'path';

import { DatabaseService } from '../database/database.service';
import { CreateCountryDto } from './dto/create-country.dto';
import { CreateMatchDto } from './dto/create-match.dto';

type CountryRow = {
  id: number;
  name: string;
  code: string;
  group_name: string;
};

type MatchRow = {
  id: number;
  kickoff: string;
  stage: string;
  venue: string;
  home_name: string;
  home_code: string;
  away_name: string;
  away_code: string;
  home_score: number | null;
  away_score: number | null;
};

type OfficialStatusRow = {
  id: number;
  email: string;
  created_at: string;
  prediction_updated_at: string | null;
  qualified_codes: string[] | null;
  finalist_codes: string[] | null;
  champion_code: string | null;
};

type PredictionLockRow = {
  setting_value: string;
};

type CountryCodeRow = {
  code: string;
};

type DemoUserRow = {
  id: number;
  email: string;
};

type MatchResultRow = {
  home_code: string;
  away_code: string;
  home_score: number | null;
  away_score: number | null;
};

type CompetitionSnapshot = {
  qualifiers: Set<string>;
  finalists: Set<string>;
  champion: string | null;
};

const FALLBACK_MATCHES = [
  {
    homeCode: 'ARG',
    awayCode: 'POR',
    kickoff: '2026-06-21T18:00:00.000Z',
    stage: 'Grupos',
    venue: 'MetLife Stadium',
  },
  {
    homeCode: 'MEX',
    awayCode: 'BRA',
    kickoff: '2026-06-22T20:00:00.000Z',
    stage: 'Grupos',
    venue: 'Estadio Azteca',
  },
];

const MAX_PREDICTION_POINTS = 35;
const PREMIUM_START_POINTS = 25;

function loadFallbackCountries() {
  const filePath = join(process.cwd(), 'src', 'backoffice', 'data', 'worldcup-countries.json');
  const fileRaw = readFileSync(filePath, 'utf8');
  return JSON.parse(fileRaw) as Array<{ name: string; code: string; groupName: string }>;
}

@Injectable()
export class BackofficeService {
  constructor(private readonly databaseService: DatabaseService) {}

  adminLogin(username: string, password: string) {
    const envUser = process.env.BACKOFFICE_ADMIN_USER ?? 'admin';
    const envPassword = process.env.BACKOFFICE_ADMIN_PASSWORD ?? 'admin1234';
    const adminToken = process.env.BACKOFFICE_ADMIN_TOKEN ?? 'edge-backoffice-dev-token';

    if (username !== envUser || password !== envPassword) {
      throw new UnauthorizedException('Credenciales de admin invalidas');
    }

    return {
      success: true,
      token: adminToken,
    };
  }

  async listCountries(adminToken?: string) {
    this.assertAdminToken(adminToken);

    const result = await this.databaseService.query<CountryRow>(
      `
        SELECT id, name, code, group_name
        FROM wc_countries
        ORDER BY name ASC;
      `,
    );

    return result.rows.map((row) => ({
      id: row.id,
      name: row.name,
      code: row.code,
      groupName: row.group_name,
    }));
  }

  async createCountry(adminToken: string | undefined, body: CreateCountryDto) {
    this.assertAdminToken(adminToken);

    try {
      const result = await this.databaseService.query<CountryRow>(
        `
          INSERT INTO wc_countries (name, code, group_name)
          VALUES ($1, $2, $3)
          RETURNING id, name, code, group_name;
        `,
        [body.name.trim(), body.code.trim().toUpperCase(), body.groupName],
      );

      const row = result.rows[0];
      return {
        id: row.id,
        name: row.name,
        code: row.code,
        groupName: row.group_name,
      };
    } catch {
      throw new BadRequestException('No se pudo crear el pais. Verifica nombre/codigo unico.');
    }
  }

  async deleteCountry(adminToken: string | undefined, id: number) {
    this.assertAdminToken(adminToken);

    const result = await this.databaseService.query<CountryRow>(
      `
        DELETE FROM wc_countries
        WHERE id = $1
        RETURNING id;
      `,
      [id],
    );

    if (result.rowCount === 0) {
      throw new NotFoundException('Pais no encontrado');
    }

    return { success: true };
  }

  async listMatches(adminToken?: string) {
    this.assertAdminToken(adminToken);

    const result = await this.databaseService.query<MatchRow>(
      `
        SELECT
          m.id,
          m.kickoff,
          m.stage,
          m.venue,
          m.home_score,
          m.away_score,
          hc.name AS home_name,
          hc.code AS home_code,
          ac.name AS away_name,
          ac.code AS away_code
        FROM wc_matches m
        JOIN wc_countries hc ON hc.id = m.home_country_id
        JOIN wc_countries ac ON ac.id = m.away_country_id
        ORDER BY m.kickoff ASC;
      `,
    );

    return result.rows.map((row) => ({
      id: row.id,
      home: row.home_name,
      homeCode: row.home_code,
      away: row.away_name,
      awayCode: row.away_code,
      kickoff: row.kickoff,
      stage: row.stage,
      venue: row.venue,
      homeScore: row.home_score,
      awayScore: row.away_score,
    }));
  }

  async listOfficials(adminToken?: string) {
    this.assertAdminToken(adminToken);

    const snapshot = await this.getCompetitionSnapshot();

    const result = await this.databaseService.query<OfficialStatusRow>(
      `
        SELECT
          u.id,
          u.email,
          u.created_at,
          up.updated_at AS prediction_updated_at,
          up.qualified_codes,
          up.finalist_codes,
          up.champion_code
        FROM users u
        LEFT JOIN user_predictions up ON up.user_id = u.id
        ORDER BY u.created_at DESC;
      `,
    );

    return result.rows.map((row) => {
      const qualifiedCodes = row.qualified_codes ?? [];
      const finalistCodes = row.finalist_codes ?? [];
      const hasPrediction = qualifiedCodes.length > 0 || finalistCodes.length > 0 || row.champion_code != null;
      const predictionCompleted =
        qualifiedCodes.length === 32 && finalistCodes.length === 2 && row.champion_code != null;
      const status = !hasPrediction ? 'pendiente' : predictionCompleted ? 'completa' : 'incompleta';
      const points = this.calculatePoints(qualifiedCodes, finalistCodes, row.champion_code, snapshot);

      return {
        id: row.id,
        email: row.email,
        createdAt: row.created_at,
        predictionUpdatedAt: row.prediction_updated_at,
        qualifiedCount: qualifiedCodes.length,
        finalistCount: finalistCodes.length,
        championCode: row.champion_code,
        points,
        hasPrediction,
        predictionCompleted,
        status,
      };
    });
  }

  async getPredictionLock(adminToken?: string) {
    this.assertAdminToken(adminToken);

    const lockAt = await this.readPredictionLockAt();
    return {
      lockAt,
      locked: this.isPredictionLocked(lockAt),
    };
  }

  async setPredictionLock(adminToken: string | undefined, lockAtInput?: string) {
    this.assertAdminToken(adminToken);

    const normalized = lockAtInput?.trim() ?? '';
    if (!normalized) {
      await this.databaseService.query(
        `
          DELETE FROM app_settings
          WHERE setting_key = 'prediction_lock_at';
        `,
      );

      return {
        success: true,
        lockAt: null,
        locked: false,
      };
    }

    const parsed = new Date(normalized);
    if (Number.isNaN(parsed.getTime())) {
      throw new BadRequestException('Fecha de cierre invalida. Usa fecha y hora validas.');
    }

    const lockAt = parsed.toISOString();
    await this.databaseService.query(
      `
        INSERT INTO app_settings (setting_key, setting_value, updated_at)
        VALUES ('prediction_lock_at', $1, NOW())
        ON CONFLICT (setting_key)
        DO UPDATE SET
          setting_value = EXCLUDED.setting_value,
          updated_at = NOW();
      `,
      [lockAt],
    );

    return {
      success: true,
      lockAt,
      locked: this.isPredictionLocked(lockAt),
    };
  }

  async generateDemoPredictions(adminToken: string | undefined, count = 50) {
    this.assertAdminToken(adminToken);

    const demoCount = Math.min(Math.max(Math.trunc(count || 50), 1), 200);
    const countriesResult = await this.databaseService.query<CountryCodeRow>(
      `
        SELECT code
        FROM wc_countries
        ORDER BY code ASC;
      `,
    );

    if (countriesResult.rows.length < 32) {
      throw new BadRequestException('No hay suficientes paises cargados para simular predicciones.');
    }

    const countries = countriesResult.rows.map((row) => row.code);
    const demoPrefix = 'demo-%@edgeworldcup.local';

    await this.databaseService.query('BEGIN;');

    try {
      await this.databaseService.query(
        `
          DELETE FROM user_predictions
          WHERE user_id IN (
            SELECT id
            FROM users
            WHERE email LIKE 'demo-%@edgeworldcup.local'
          );
        `,
      );

      await this.databaseService.query(
        `
          DELETE FROM users
          WHERE email LIKE 'demo-%@edgeworldcup.local';
        `,
      );

      for (let index = 1; index <= demoCount; index += 1) {
        const email = `demo-${String(index).padStart(2, '0')}@edgeworldcup.local`;
        const userResult = await this.databaseService.query<{ id: number }>(
          `
            INSERT INTO users (email)
            VALUES ($1)
            RETURNING id;
          `,
          [email],
        );

        const qualifiedCodes = this.pickRandomCodes(countries, 32);
        const finalistCodes = this.pickRandomCodes(qualifiedCodes, 2);
        const championCode = finalistCodes[0] ?? qualifiedCodes[0];

        await this.databaseService.query(
          `
            INSERT INTO user_predictions (user_id, qualified_codes, finalist_codes, champion_code)
            VALUES ($1, $2::text[], $3::text[], $4)
            ON CONFLICT (user_id)
            DO UPDATE SET
              qualified_codes = EXCLUDED.qualified_codes,
              finalist_codes = EXCLUDED.finalist_codes,
              champion_code = EXCLUDED.champion_code,
              updated_at = NOW();
          `,
          [userResult.rows[0].id, qualifiedCodes, finalistCodes, championCode],
        );
      }

      await this.databaseService.query('COMMIT;');

      return {
        success: true,
        createdUsers: demoCount,
        predictions: demoCount,
        prefix: demoPrefix,
        message: 'Predicciones demo cargadas.',
      };
    } catch (error) {
      await this.databaseService.query('ROLLBACK;');
      throw error;
    }
  }

  async generateDemoMatches(adminToken: string | undefined, count = 10) {
    this.assertAdminToken(adminToken);

    const demoCount = Math.min(Math.max(Math.trunc(count || 10), 1), 50);
    const matchesResult = await this.databaseService.query<{ id: number }>(
      `
        SELECT id
        FROM wc_matches
        WHERE home_score IS NULL OR away_score IS NULL
        ORDER BY kickoff ASC, id ASC
        LIMIT $1;
      `,
      [demoCount],
    );

    const selectedMatchIds = new Set(matchesResult.rows.map((row) => row.id));

    if (selectedMatchIds.size < demoCount) {
      const countriesResult = await this.databaseService.query<CountryCodeRow>(
        `
          SELECT code
          FROM wc_countries
          ORDER BY code ASC;
        `,
      );

      if (countriesResult.rows.length < 2) {
        throw new BadRequestException('No hay suficientes paises cargados para simular partidos.');
      }

      const countryCodes = countriesResult.rows.map((row) => row.code);
      const existingDemoCount = selectedMatchIds.size;

      for (let index = existingDemoCount; index < demoCount; index += 1) {
        const [homeCode, awayCode] = this.pickTwoDistinctCodes(countryCodes);
        const kickoff = new Date(Date.now() + index * 60 * 60 * 1000).toISOString();
        const venue = `Demo Stadium ${index + 1}`;
        const homeResult = await this.databaseService.query<{ id: number }>(
          `
            INSERT INTO wc_matches (home_country_id, away_country_id, kickoff, stage, venue)
            SELECT hc.id, ac.id, $3::timestamptz, 'Demo', $4
            FROM wc_countries hc, wc_countries ac
            WHERE hc.code = $1 AND ac.code = $2
            RETURNING id;
          `,
          [homeCode, awayCode, kickoff, venue],
        );
        selectedMatchIds.add(homeResult.rows[0].id);
      }
    }

    let updated = 0;

    for (const match of Array.from(selectedMatchIds)) {
      const homeScore = Math.floor(Math.random() * 5);
      let awayScore = Math.floor(Math.random() * 5);
      if (awayScore === homeScore) {
        awayScore = (awayScore + 1) % 5;
      }

      await this.databaseService.query(
        `
          UPDATE wc_matches
          SET home_score = $2,
              away_score = $3,
              result_updated_at = NOW()
          WHERE id = $1;
        `,
        [match, homeScore, awayScore],
      );
      updated += 1;
    }

    return {
      success: true,
      updatedMatches: updated,
      message: 'Partidos demo actualizados.',
    };
  }

  async resetDemoSimulation(
    adminToken: string | undefined,
    options?: { clearMatchResults?: boolean; clearPremiumClaims?: boolean },
  ) {
    this.assertAdminToken(adminToken);

    const clearMatchResults = options?.clearMatchResults ?? true;
    const clearPremiumClaims = options?.clearPremiumClaims ?? true;

    if (clearMatchResults) {
      await this.databaseService.query(
        `
          UPDATE wc_matches
          SET home_score = NULL,
              away_score = NULL,
              result_updated_at = NULL;
        `,
      );
    }

    if (clearPremiumClaims) {
      await this.databaseService.query('DELETE FROM premium_avatar_claims;');
    }

    return {
      success: true,
      clearMatchResults,
      clearPremiumClaims,
      message: 'Simulacion limpiada. Puedes arrancar nuevas olas.',
    };
  }

  async generateDemoDistribution(adminToken: string | undefined, wave = 1) {
    this.assertAdminToken(adminToken);

    const normalizedWave = Math.min(Math.max(Math.trunc(wave || 1), 1), 4);

    await this.generateDemoMatches(adminToken, 50);

    let snapshot = await this.getCompetitionSnapshot();
    if (snapshot.qualifiers.size < 32 || !snapshot.champion) {
      await this.generateDemoMatches(adminToken, 50);
      snapshot = await this.getCompetitionSnapshot();
    }

    const countriesResult = await this.databaseService.query<CountryCodeRow>(
      `
        SELECT code
        FROM wc_countries
        ORDER BY code ASC;
      `,
    );

    const allCodes = countriesResult.rows.map((row) => row.code);
    if (allCodes.length < 40) {
      throw new BadRequestException('No hay suficientes paises para distribuir aciertos demo.');
    }

    const usersResult = await this.databaseService.query<DemoUserRow>(
      `
        SELECT id, email
        FROM users
        WHERE email LIKE 'demo-%@edgeworldcup.local'
        ORDER BY id ASC;
      `,
    );

    if (usersResult.rows.length === 0) {
      throw new BadRequestException('No hay usuarios demo. Primero genera predicciones demo.');
    }

    const premiumSlotsByWave = [0, 2, 5, 10];
    const premiumSlots = premiumSlotsByWave[normalizedWave - 1] ?? 0;

    await this.databaseService.query('BEGIN;');

    try {
      for (let index = 0; index < usersResult.rows.length; index += 1) {
        const user = usersResult.rows[index];
        const targetPoints = this.resolveWaveTargetPoints(index, premiumSlots);
        const prediction = this.buildPredictionForTargetPoints(allCodes, snapshot, targetPoints);

        await this.databaseService.query(
          `
            INSERT INTO user_predictions (user_id, qualified_codes, finalist_codes, champion_code)
            VALUES ($1, $2::text[], $3::text[], $4)
            ON CONFLICT (user_id)
            DO UPDATE SET
              qualified_codes = EXCLUDED.qualified_codes,
              finalist_codes = EXCLUDED.finalist_codes,
              champion_code = EXCLUDED.champion_code,
              updated_at = NOW();
          `,
          [user.id, prediction.qualifiedCodes, prediction.finalistCodes, prediction.championCode],
        );
      }

      await this.databaseService.query('COMMIT;');
    } catch (error) {
      await this.databaseService.query('ROLLBACK;');
      throw error;
    }

    return {
      success: true,
      wave: normalizedWave,
      premiumCandidates: premiumSlots,
      usersUpdated: usersResult.rows.length,
      message: `Distribucion demo aplicada. Wave ${normalizedWave} lista.`,
    };
  }

  async createMatch(adminToken: string | undefined, body: CreateMatchDto) {
    this.assertAdminToken(adminToken);

    const homeCode = body.homeCode.trim().toUpperCase();
    const awayCode = body.awayCode.trim().toUpperCase();

    if (homeCode === awayCode) {
      throw new BadRequestException('Local y visita no pueden ser iguales');
    }

    const countries = await this.databaseService.query<CountryRow>(
      `
        SELECT id, name, code, group_name
        FROM wc_countries
        WHERE code IN ($1, $2);
      `,
      [homeCode, awayCode],
    );

    const home = countries.rows.find((item) => item.code === homeCode);
    const away = countries.rows.find((item) => item.code === awayCode);

    if (!home || !away) {
      throw new BadRequestException('Local o visita no existe en paises cargados');
    }

    const result = await this.databaseService.query<{ id: number }>(
      `
        INSERT INTO wc_matches (home_country_id, away_country_id, kickoff, stage, venue)
        VALUES ($1, $2, $3::timestamptz, $4, $5)
        RETURNING id;
      `,
      [home.id, away.id, body.kickoff, body.stage.trim(), body.venue.trim()],
    );

    return {
      success: true,
      id: result.rows[0].id,
    };
  }

  async deleteMatch(adminToken: string | undefined, id: number) {
    this.assertAdminToken(adminToken);

    const result = await this.databaseService.query<{ id: number }>(
      `
        DELETE FROM wc_matches
        WHERE id = $1
        RETURNING id;
      `,
      [id],
    );

    if (result.rowCount === 0) {
      throw new NotFoundException('Partido no encontrado');
    }

    return { success: true };
  }

  async importFromApiWithFallback(adminToken?: string) {
    this.assertAdminToken(adminToken);

    const apiUrl = process.env.WORLDCUP_IMPORT_URL;

    try {
      if (!apiUrl) {
        throw new Error('WORLDCUP_IMPORT_URL not set');
      }

      const response = await fetch(apiUrl);
      if (!response.ok) {
        throw new Error(`Import API error: ${response.status}`);
      }

      const payload = (await response.json()) as {
        countries?: Array<{ name: string; code: string; groupName: string }>;
        matches?: Array<{
          homeCode: string;
          awayCode: string;
          kickoff: string;
          stage: string;
          venue: string;
        }>;
      };

      if (!payload.countries || payload.countries.length === 0) {
        throw new Error('Import API returned empty countries');
      }

      await this.replaceAllData(payload.countries, payload.matches ?? []);

      return {
        success: true,
        source: 'api',
        countries: payload.countries.length,
        matches: payload.matches?.length ?? 0,
      };
    } catch {
      const fallbackCountries = loadFallbackCountries();
      await this.replaceAllData(fallbackCountries, FALLBACK_MATCHES);

      return {
        success: true,
        source: 'fallback',
        message: 'No se pudo importar desde API. Se cargo dataset manual de respaldo.',
        countries: fallbackCountries.length,
        matches: FALLBACK_MATCHES.length,
      };
    }
  }

  private async replaceAllData(
    countries: Array<{ name: string; code: string; groupName: string }>,
    matches: Array<{
      homeCode: string;
      awayCode: string;
      kickoff: string;
      stage: string;
      venue: string;
    }>,
  ) {
    await this.databaseService.query('DELETE FROM wc_matches;');
    await this.databaseService.query('DELETE FROM wc_countries;');

    for (const country of countries) {
      await this.databaseService.query(
        `
          INSERT INTO wc_countries (name, code, group_name)
          VALUES ($1, $2, $3);
        `,
        [country.name.trim(), country.code.trim().toUpperCase(), country.groupName],
      );
    }

    for (const match of matches) {
      const codeResult = await this.databaseService.query<{ id: number; code: string }>(
        `
          SELECT id, code
          FROM wc_countries
          WHERE code IN ($1, $2);
        `,
        [match.homeCode.trim().toUpperCase(), match.awayCode.trim().toUpperCase()],
      );

      const home = codeResult.rows.find((item) => item.code === match.homeCode.trim().toUpperCase());
      const away = codeResult.rows.find((item) => item.code === match.awayCode.trim().toUpperCase());

      if (!home || !away) {
        throw new InternalServerErrorException('Import inconsistente: pais no encontrado para partido');
      }

      await this.databaseService.query(
        `
          INSERT INTO wc_matches (home_country_id, away_country_id, kickoff, stage, venue)
          VALUES ($1, $2, $3::timestamptz, $4, $5);
        `,
        [home.id, away.id, match.kickoff, match.stage, match.venue],
      );
    }
  }

  private assertAdminToken(adminToken?: string) {
    const expected = process.env.BACKOFFICE_ADMIN_TOKEN ?? 'edge-backoffice-dev-token';
    if (!adminToken || adminToken !== expected) {
      throw new UnauthorizedException('No autorizado para backoffice');
    }
  }

  private async readPredictionLockAt() {
    const result = await this.databaseService.query<PredictionLockRow>(
      `
        SELECT setting_value
        FROM app_settings
        WHERE setting_key = 'prediction_lock_at'
        LIMIT 1;
      `,
    );

    return result.rows[0]?.setting_value ?? null;
  }

  private isPredictionLocked(lockAt: string | null) {
    if (!lockAt) {
      return false;
    }

    const parsed = new Date(lockAt);
    return !Number.isNaN(parsed.getTime()) && parsed <= new Date();
  }

  private pickRandomCodes(codes: string[], count: number) {
    const shuffled = [...codes];

    for (let index = shuffled.length - 1; index > 0; index -= 1) {
      const swapIndex = Math.floor(Math.random() * (index + 1));
      [shuffled[index], shuffled[swapIndex]] = [shuffled[swapIndex], shuffled[index]];
    }

    return shuffled.slice(0, count);
  }

  private resolveWaveTargetPoints(index: number, premiumSlots: number) {
    if (index < premiumSlots) {
      const highTargets = [25, 26, 27, 28, 29, 30, 31, 28, 27, 26];
      return highTargets[index % highTargets.length];
    }

    const distributedTargets = [5, 7, 9, 11, 13, 15, 17, 19, 21, 23, 24, 20, 18, 16, 14, 12, 10, 8, 6, 22];
    return distributedTargets[index % distributedTargets.length];
  }

  private buildPredictionForTargetPoints(
    allCodes: string[],
    snapshot: CompetitionSnapshot,
    targetPointsRaw: number,
  ) {
    const targetPoints = Math.min(Math.max(targetPointsRaw, 0), MAX_PREDICTION_POINTS);
    const qualifiers = this.pickRandomCodes(Array.from(snapshot.qualifiers), 32);
    const nonQualifiers = allCodes.filter((code) => !snapshot.qualifiers.has(code));
    const finalists = Array.from(snapshot.finalists);
    const champion = snapshot.champion;

    if (!champion || finalists.length < 2 || nonQualifiers.length < 8) {
      throw new BadRequestException('Snapshot insuficiente para distribuir aciertos. Simula mas partidos.');
    }

    let championHit = 0;
    let finalistHits = 0;
    let qualifierHits = 0;

    if (targetPoints >= PREMIUM_START_POINTS) {
      championHit = 1;
      finalistHits = 2;
      qualifierHits = targetPoints - 3;
    } else if (targetPoints >= 15) {
      championHit = 0;
      finalistHits = 1;
      qualifierHits = targetPoints - 1;
    } else {
      championHit = 0;
      finalistHits = 0;
      qualifierHits = targetPoints;
    }

    qualifierHits = Math.min(Math.max(qualifierHits, finalistHits), 32);

    const correctFinalists = finalists.slice(0, finalistHits);
    const requiredCorrect = new Set(correctFinalists);
    const extraCorrectNeeded = Math.max(0, qualifierHits - requiredCorrect.size);
    const extraCorrect = qualifiers.filter((code) => !requiredCorrect.has(code)).slice(0, extraCorrectNeeded);
    const correctQualified = [...requiredCorrect, ...extraCorrect];

    const wrongQualifiedNeeded = 32 - correctQualified.length;
    const wrongQualified = this.pickRandomCodes(nonQualifiers, wrongQualifiedNeeded);
    const qualifiedCodes = this.pickRandomCodes([...correctQualified, ...wrongQualified], 32);

    const wrongFinalistCandidates = qualifiedCodes.filter((code) => !snapshot.finalists.has(code));
    const wrongFinalists = this.pickRandomCodes(wrongFinalistCandidates, Math.max(0, 2 - finalistHits));
    const finalistCodes = this.pickRandomCodes([...correctFinalists, ...wrongFinalists], 2);

    let championCode = finalistCodes.find((code) => code !== champion) ?? finalistCodes[0];
    if (championHit === 1) {
      if (!finalistCodes.includes(champion)) {
        finalistCodes[0] = champion;
      }
      championCode = champion;
    }

    return {
      qualifiedCodes,
      finalistCodes,
      championCode,
    };
  }

  private async getCompetitionSnapshot() {
    const result = await this.databaseService.query<MatchResultRow>(
      `
        SELECT
          hc.code AS home_code,
          ac.code AS away_code,
          m.home_score,
          m.away_score
        FROM wc_matches m
        JOIN wc_countries hc ON hc.id = m.home_country_id
        JOIN wc_countries ac ON ac.id = m.away_country_id
        WHERE m.home_score IS NOT NULL
          AND m.away_score IS NOT NULL;
      `,
    );

    const teamPoints = new Map<string, number>();

    for (const row of result.rows) {
      const homeScore = Number(row.home_score ?? 0);
      const awayScore = Number(row.away_score ?? 0);
      const homePoints = teamPoints.get(row.home_code) ?? 0;
      const awayPoints = teamPoints.get(row.away_code) ?? 0;

      if (homeScore > awayScore) {
        teamPoints.set(row.home_code, homePoints + 3);
        teamPoints.set(row.away_code, awayPoints);
      } else if (awayScore > homeScore) {
        teamPoints.set(row.home_code, homePoints);
        teamPoints.set(row.away_code, awayPoints + 3);
      } else {
        teamPoints.set(row.home_code, homePoints + 1);
        teamPoints.set(row.away_code, awayPoints + 1);
      }
    }

    const ranked = Array.from(teamPoints.entries())
      .sort((entryA, entryB) => {
        if (entryB[1] !== entryA[1]) {
          return entryB[1] - entryA[1];
        }

        return entryA[0].localeCompare(entryB[0]);
      })
      .map(([code]) => code);

    return {
      qualifiers: new Set(ranked.slice(0, 32)),
      finalists: new Set(ranked.slice(0, 2)),
      champion: ranked[0] ?? null,
    };
  }

  private calculatePoints(
    qualifiedCodes: string[],
    finalistCodes: string[],
    championCode: string | null,
    snapshot: CompetitionSnapshot,
  ) {
    const qualifiedPoints = qualifiedCodes.filter((code) => snapshot.qualifiers.has(code)).length;
    const finalistPoints = finalistCodes.filter((code) => snapshot.finalists.has(code)).length;
    const championPoints = championCode && snapshot.champion === championCode ? 1 : 0;

    return qualifiedPoints + finalistPoints + championPoints;
  }

  private pickTwoDistinctCodes(codes: string[]) {
    const shuffled = [...codes];

    for (let index = shuffled.length - 1; index > 0; index -= 1) {
      const swapIndex = Math.floor(Math.random() * (index + 1));
      [shuffled[index], shuffled[swapIndex]] = [shuffled[swapIndex], shuffled[index]];
    }

    return [shuffled[0], shuffled[1]] as const;
  }
}
