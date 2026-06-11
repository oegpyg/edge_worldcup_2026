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
  full_name: string | null;
  sex: string | null;
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

type UserEmailRow = {
  email: string;
};

type CountRow = {
  count: string;
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

  async importOfficialsFromCsv(
    adminToken: string | undefined,
    csvContent: string,
    clearPreviousData = false,
  ) {
    this.assertAdminToken(adminToken);

    const parsed = this.parseOfficialsCsv(csvContent);

    if (parsed.rows.length === 0) {
      throw new BadRequestException('CSV sin correos validos para importar.');
    }

    const emails = parsed.rows.map((row) => row.email);
    const names = parsed.rows.map((row) => row.fullName);
    const sexes = parsed.rows.map((row) => row.sex);

    if (clearPreviousData) {
      await this.databaseService.query('BEGIN;');

      try {
        await this.databaseService.query('DELETE FROM users;');

        const insertResult = await this.databaseService.query<UserEmailRow>(
          `
            INSERT INTO users (email, full_name, sex, is_official)
            SELECT email, full_name, sex, true
            FROM unnest($1::text[], $2::text[], $3::text[]) AS source(email, full_name, sex)
            RETURNING email;
          `,
          [emails, names, sexes],
        );

        await this.databaseService.query('COMMIT;');

        return {
          success: true,
          processedRows: parsed.processedRows,
          validRows: parsed.rows.length,
          createdUsers: insertResult.rowCount ?? parsed.rows.length,
          updatedUsers: 0,
          alreadyExisting: 0,
          ignoredRows: parsed.ignoredRows,
          invalidRows: parsed.invalidRows,
          invalidSexRows: parsed.invalidSexRows,
          duplicatesInFile: parsed.duplicatesInFile,
          clearPreviousData: true,
          message: 'Importacion CSV completada. Datos anteriores limpiados.',
        };
      } catch (error) {
        await this.databaseService.query('ROLLBACK;');
        throw error;
      }
    }

    const existingResult = await this.databaseService.query<CountRow>(
      `
        SELECT COUNT(*)::text AS count
        FROM users
        WHERE email = ANY($1::text[]);
      `,
      [emails],
    );
    const existingUsers = Number(existingResult.rows[0]?.count ?? '0');

    const insertResult = await this.databaseService.query<UserEmailRow>(
      `
        INSERT INTO users (email, full_name, sex, is_official)
        SELECT email, full_name, sex, true
        FROM unnest($1::text[], $2::text[], $3::text[]) AS source(email, full_name, sex)
        ON CONFLICT (email)
        DO UPDATE SET
          full_name = CASE
            WHEN EXCLUDED.full_name IS NOT NULL AND EXCLUDED.full_name <> '' THEN EXCLUDED.full_name
            ELSE users.full_name
          END,
          sex = COALESCE(EXCLUDED.sex, users.sex),
          is_official = true
        RETURNING email;
      `,
      [emails, names, sexes],
    );
    const upsertedUsers = insertResult.rowCount ?? 0;
    const createdUsers = Math.max(0, upsertedUsers - existingUsers);
    const updatedUsers = Math.max(0, existingUsers);

    return {
      success: true,
      processedRows: parsed.processedRows,
      validRows: parsed.rows.length,
      createdUsers,
      updatedUsers,
      alreadyExisting: existingUsers,
      ignoredRows: parsed.ignoredRows,
      invalidRows: parsed.invalidRows,
      invalidSexRows: parsed.invalidSexRows,
      duplicatesInFile: parsed.duplicatesInFile,
      clearPreviousData: false,
      message: 'Importacion CSV completada.',
    };
  }

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
          u.full_name,
          u.sex,
          u.created_at,
          up.updated_at AS prediction_updated_at,
          up.qualified_codes,
          up.finalist_codes,
          up.champion_code
        FROM users u
        LEFT JOIN user_predictions up ON up.user_id = u.id
        WHERE u.is_official = true
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
        fullName: row.full_name,
        sex: row.sex,
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

  async updateOfficial(
    officialId: number,
    fullName?: string,
    sex?: string,
    adminToken?: string,
  ) {
    this.assertAdminToken(adminToken);

    if (!fullName && !sex) {
      throw new BadRequestException('Debe proporcionar al menos un campo para actualizar.');
    }

    if (sex && sex !== 'male' && sex !== 'female') {
      throw new BadRequestException('El sexo debe ser "male" o "female".');
    }

    const updates: string[] = [];
    const values: (string | number)[] = [];
    let paramIndex = 1;

    if (fullName !== undefined) {
      updates.push(`full_name = $${paramIndex}`);
      values.push(fullName);
      paramIndex++;
    }

    if (sex !== undefined) {
      updates.push(`sex = $${paramIndex}`);
      values.push(sex);
      paramIndex++;
    }

    values.push(officialId);

    const query = `
      UPDATE users
      SET ${updates.join(', ')}
      WHERE id = $${paramIndex}
      RETURNING id, email, full_name, sex;
    `;

    const result = await this.databaseService.query(query, values);

    if (result.rows.length === 0) {
      throw new NotFoundException('Funcionario no encontrado.');
    }

    return result.rows[0];
  }

  async markAllUsersAsOfficials(adminToken?: string) {
    this.assertAdminToken(adminToken);

    const result = await this.databaseService.query<{ id: number }>(
      `
        UPDATE users
        SET is_official = true
        WHERE is_official = false
        RETURNING id;
      `,
    );

    return {
      success: true,
      updatedUsers: result.rowCount ?? 0,
      message: 'Todos los usuarios fueron marcados como funcionarios.',
    };
  }

  async getPredictionLock(adminToken?: string) {
    this.assertAdminToken(adminToken);

    const lockAt = await this.readPredictionStageLockAt(1);
    const stage2LockAt = await this.readPredictionStageLockAt(2);
    return {
      lockAt,
      stage2LockAt,
      locked: this.isPredictionLocked(lockAt),
      stage2Locked: this.isPredictionLocked(stage2LockAt),
    };
  }

  async setPredictionLock(adminToken: string | undefined, lockAtInput?: string, stage2LockAtInput?: string) {
    this.assertAdminToken(adminToken);

    const normalizedStage1 = lockAtInput?.trim() ?? '';
    const normalizedStage2 = stage2LockAtInput?.trim() ?? '';

    const stage1LockAt = normalizedStage1 ? this.parseLockAt(normalizedStage1) : null;
    const stage2LockAt = normalizedStage2 ? this.parseLockAt(normalizedStage2) : null;

    if (stage1LockAt && stage2LockAt && stage2LockAt <= stage1LockAt) {
      throw new BadRequestException('La fecha de etapa 2 debe ser posterior a la fecha de etapa 1.');
    }

    if (!stage1LockAt) {
      await this.databaseService.query(
        `
          DELETE FROM app_settings
          WHERE setting_key IN ('prediction_stage1_lock_at', 'prediction_lock_at');
        `,
      );
    } else {
      await this.databaseService.query(
        `
          INSERT INTO app_settings (setting_key, setting_value, updated_at)
          VALUES ('prediction_stage1_lock_at', $1, NOW())
          ON CONFLICT (setting_key)
          DO UPDATE SET
            setting_value = EXCLUDED.setting_value,
            updated_at = NOW();
        `,
        [stage1LockAt],
      );

      await this.databaseService.query(
        `
          DELETE FROM app_settings
          WHERE setting_key = 'prediction_lock_at';
        `,
      );
    }

    if (!stage2LockAt) {
      await this.databaseService.query(
        `
          DELETE FROM app_settings
          WHERE setting_key = 'prediction_stage2_lock_at';
        `,
      );
    } else {
      await this.databaseService.query(
        `
          INSERT INTO app_settings (setting_key, setting_value, updated_at)
          VALUES ('prediction_stage2_lock_at', $1, NOW())
          ON CONFLICT (setting_key)
          DO UPDATE SET
            setting_value = EXCLUDED.setting_value,
            updated_at = NOW();
        `,
        [stage2LockAt],
      );
    }

    return {
      success: true,
      lockAt: stage1LockAt,
      stage2LockAt,
      locked: this.isPredictionLocked(stage1LockAt),
      stage2Locked: this.isPredictionLocked(stage2LockAt),
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

  async setMatchResult(adminToken: string | undefined, id: number, homeScore: number, awayScore: number) {
    this.assertAdminToken(adminToken);

    const result = await this.databaseService.query<{ id: number }>(
      `
        UPDATE wc_matches
        SET home_score = $2,
            away_score = $3,
            result_updated_at = NOW()
        WHERE id = $1
        RETURNING id;
      `,
      [id, homeScore, awayScore],
    );

    if (result.rowCount === 0) {
      throw new NotFoundException('Partido no encontrado');
    }

    return {
      success: true,
      id,
      homeScore,
      awayScore,
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

  async importMatchesFromCsv(
    adminToken: string | undefined,
    csvContent: string,
    clearPreviousMatches = false,
  ) {
    this.assertAdminToken(adminToken);

    const parsed = this.parseMatchesCsv(csvContent);

    if (clearPreviousMatches) {
      await this.databaseService.query('DELETE FROM wc_matches;');
    }

    let created = 0;
    let skipped = 0;

    for (const row of parsed.rows) {
      const codeResult = await this.databaseService.query<{ id: number; code: string }>(
        `
          SELECT id, code
          FROM wc_countries
          WHERE code IN ($1, $2);
        `,
        [row.homeCode, row.awayCode],
      );

      const home = codeResult.rows.find((item) => item.code === row.homeCode);
      const away = codeResult.rows.find((item) => item.code === row.awayCode);

      if (!home || !away) {
        skipped++;
        continue;
      }

      await this.databaseService.query(
        `
          INSERT INTO wc_matches (home_country_id, away_country_id, kickoff, stage, venue)
          VALUES ($1, $2, $3::timestamptz, $4, $5);
        `,
        [home.id, away.id, row.kickoff, row.stage, row.venue],
      );
      created++;
    }

    return {
      created,
      skipped,
      invalidRows: parsed.invalidRows,
      processedRows: parsed.processedRows,
      clearPreviousMatches,
    };
  }

  private parseMatchesCsv(csvContent: string) {
    const normalized = csvContent.replace(/^\uFEFF/, '');
    const lines = normalized
      .split(/\r?\n/)
      .map((line) => line.trim())
      .filter((line) => line.length > 0);

    if (lines.length === 0) {
      return { processedRows: 0, invalidRows: 0, rows: [] as Array<{ homeCode: string; awayCode: string; kickoff: string; stage: string; venue: string }> };
    }

    const header = this.splitCsvLine(lines[0]).map((col) => col.toLowerCase().replace(/[^a-z]/g, ''));
    const dataLines = lines.slice(1);

    const homeIdx = header.findIndex((col) => ['home', 'local', 'homecode', 'equipolocal'].includes(col));
    const awayIdx = header.findIndex((col) => ['away', 'visita', 'awaycode', 'equipovisita'].includes(col));
    const kickoffIdx = header.findIndex((col) => ['kickoff', 'fecha', 'date', 'datetime', 'hora'].includes(col));
    const stageIdx = header.findIndex((col) => ['stage', 'etapa', 'fase', 'ronda'].includes(col));
    const venueIdx = header.findIndex((col) => ['venue', 'estadio', 'sede'].includes(col));

    const rows: Array<{ homeCode: string; awayCode: string; kickoff: string; stage: string; venue: string }> = [];
    let invalidRows = 0;

    for (const line of dataLines) {
      const cols = this.splitCsvLine(line);
      const homeCode = (homeIdx >= 0 ? cols[homeIdx] : cols[0] ?? '').trim().toUpperCase();
      const awayCode = (awayIdx >= 0 ? cols[awayIdx] : cols[1] ?? '').trim().toUpperCase();
      const kickoffRaw = (kickoffIdx >= 0 ? cols[kickoffIdx] : cols[2] ?? '').trim();
      const stage = (stageIdx >= 0 ? cols[stageIdx] : cols[3] ?? 'Grupos').trim() || 'Grupos';
      const venue = (venueIdx >= 0 ? cols[venueIdx] : cols[4] ?? '').trim() || 'Por confirmar';

      if (!homeCode || !awayCode || homeCode === awayCode || !kickoffRaw) {
        invalidRows++;
        continue;
      }

      if (!/^[A-Z]{3}$/.test(homeCode) || !/^[A-Z]{3}$/.test(awayCode)) {
        invalidRows++;
        continue;
      }

      const kickoff = new Date(kickoffRaw);
      if (isNaN(kickoff.getTime())) {
        invalidRows++;
        continue;
      }

      rows.push({ homeCode, awayCode, kickoff: kickoff.toISOString(), stage, venue });
    }

    return { processedRows: dataLines.length, invalidRows, rows };
  }

  private parseOfficialsCsv(csvContent: string) {
    const normalized = csvContent.replace(/^\uFEFF/, '');
    const lines = normalized
      .split(/\r?\n/)
      .map((line) => line.trim())
      .filter((line) => line.length > 0);

    if (lines.length === 0) {
      return {
        processedRows: 0,
        ignoredRows: 0,
        invalidRows: 0,
        invalidSexRows: 0,
        duplicatesInFile: 0,
        rows: [] as Array<{ email: string; fullName: string | null; sex: 'male' | 'female' | null }>,
      };
    }

    const firstColumns = this.splitCsvLine(lines[0]);
    const emailColumnIndex = this.detectEmailColumnIndex(firstColumns);
    const nameColumnIndex = this.detectNameColumnIndex(firstColumns);
    const sexColumnIndex = this.detectSexColumnIndex(firstColumns);
    const hasHeader = emailColumnIndex >= 0 || nameColumnIndex >= 0 || sexColumnIndex >= 0;

    const dataLines = hasHeader ? lines.slice(1) : lines;
    const rowByEmail = new Map<string, { email: string; fullName: string | null; sex: 'male' | 'female' | null }>();
    let ignoredRows = 0;
    let invalidRows = 0;
    let invalidSexRows = 0;
    let duplicatesInFile = 0;

    for (const rawLine of dataLines) {
      const columns = this.splitCsvLine(rawLine);
      const candidate = this.extractColumn(columns, emailColumnIndex, 0).toLowerCase();

      if (!candidate) {
        ignoredRows += 1;
        continue;
      }

      if (!this.isValidEmail(candidate)) {
        invalidRows += 1;
        continue;
      }

      const sexCandidate = this.extractColumn(columns, sexColumnIndex, 2);
      const normalizedSex = this.normalizeSex(sexCandidate);
      if (sexCandidate && normalizedSex === null) {
        invalidSexRows += 1;
      }

      if (rowByEmail.has(candidate)) {
        duplicatesInFile += 1;
        const current = rowByEmail.get(candidate)!;
        const fullName = this.extractColumn(columns, nameColumnIndex, 1);
        rowByEmail.set(candidate, {
          email: candidate,
          fullName: fullName || current.fullName,
          sex: normalizedSex ?? current.sex,
        });
        continue;
      }

      const fullName = this.extractColumn(columns, nameColumnIndex, 1);
      rowByEmail.set(candidate, {
        email: candidate,
        fullName: fullName || null,
        sex: normalizedSex,
      });
    }

    return {
      processedRows: dataLines.length,
      ignoredRows,
      invalidRows,
      invalidSexRows,
      duplicatesInFile,
      rows: Array.from(rowByEmail.values()),
    };
  }

  private detectEmailColumnIndex(columns: string[]) {
    return columns.findIndex((item) => {
      const normalized = item.toLowerCase().replace(/[^a-z]/g, '');
      return normalized === 'email' || normalized === 'correo' || normalized === 'correoelectronico';
    });
  }

  private detectNameColumnIndex(columns: string[]) {
    return columns.findIndex((item) => {
      const normalized = item.toLowerCase().replace(/[^a-z]/g, '');
      return normalized === 'name' || normalized === 'nombre' || normalized === 'fullname' || normalized === 'nombres';
    });
  }

  private detectSexColumnIndex(columns: string[]) {
    return columns.findIndex((item) => {
      const normalized = item.toLowerCase().replace(/[^a-z]/g, '');
      return normalized === 'sex' || normalized === 'sexo' || normalized === 'gender' || normalized === 'genero';
    });
  }

  private extractColumn(columns: string[], detectedIndex: number, fallbackIndex: number) {
    const index = detectedIndex >= 0 ? detectedIndex : fallbackIndex;
    return (columns[index] ?? '').trim();
  }

  private splitCsvLine(line: string) {
    return line.split(';').length > line.split(',').length ? line.split(';').map((item) => item.trim()) : line.split(',').map((item) => item.trim());
  }

  private isValidEmail(value: string) {
    return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(value);
  }

  private normalizeSex(value: string) {
    const normalized = value.trim().toLowerCase();
    if (!normalized) {
      return null;
    }

    if (['m', 'male', 'masculino', 'hombre', 'varon'].includes(normalized)) {
      return 'male' as const;
    }

    if (['f', 'female', 'femenino', 'mujer'].includes(normalized)) {
      return 'female' as const;
    }

    return null;
  }

  private async readPredictionStageLockAt(stage: 1 | 2) {
    const keys = stage === 1 ? ['prediction_stage1_lock_at', 'prediction_lock_at'] : ['prediction_stage2_lock_at'];
    const result = await this.databaseService.query<PredictionLockRow>(
      `
        SELECT setting_value
        FROM app_settings
        WHERE setting_key = ANY($1::text[])
        ORDER BY CASE setting_key
          WHEN 'prediction_stage1_lock_at' THEN 0
          WHEN 'prediction_lock_at' THEN 1
          ELSE 2
        END
        LIMIT 1;
      `,
      [keys],
    );

    return result.rows[0]?.setting_value ?? null;
  }

  private parseLockAt(value: string) {
    const parsed = new Date(value);
    if (Number.isNaN(parsed.getTime())) {
      throw new BadRequestException('Fecha de cierre invalida. Usa fecha y hora validas.');
    }

    return parsed.toISOString();
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
