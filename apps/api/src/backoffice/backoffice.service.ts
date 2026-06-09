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
};

const FALLBACK_COUNTRIES = loadFallbackCountries();

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
    }));
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
      await this.replaceAllData(FALLBACK_COUNTRIES, FALLBACK_MATCHES);

      return {
        success: true,
        source: 'fallback',
        message: 'No se pudo importar desde API. Se cargo dataset manual de respaldo.',
        countries: FALLBACK_COUNTRIES.length,
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
}
