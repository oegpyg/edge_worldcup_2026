import { BadRequestException, ForbiddenException, Injectable, UnauthorizedException } from '@nestjs/common';

import { DatabaseService } from '../database/database.service';
import { SavePredictionDto } from './dto/save-prediction.dto';

type SessionUserRow = {
  user_id: number;
  email: string;
};

type CountryRow = {
  code: string;
  name: string;
  group_name: string;
};

type PredictionRow = {
  qualified_codes: string[];
  finalist_codes: string[];
  champion_code: string;
};

type PredictionLockRow = {
  setting_value: string;
};

@Injectable()
export class UserService {
  constructor(private readonly databaseService: DatabaseService) {}

  async getPanelData(sessionToken: string | undefined) {
    const user = await this.getSessionUser(sessionToken);
    const predictionLockAt = await this.getPredictionLockAt();
    const predictionLocked = this.isPredictionLocked(predictionLockAt);
    const countries = await this.databaseService.query<CountryRow>(
      `
        SELECT code, name, group_name
        FROM wc_countries
        ORDER BY name ASC;
      `,
    );

    const prediction = await this.databaseService.query<PredictionRow>(
      `
        SELECT qualified_codes, finalist_codes, champion_code
        FROM user_predictions
        WHERE user_id = $1
        LIMIT 1;
      `,
      [user.user_id],
    );

    return {
      userEmail: user.email,
      predictionLocked,
      predictionLockAt,
      countries: countries.rows.map((row) => ({
        code: row.code,
        name: row.name,
        groupName: row.group_name,
      })),
      prediction:
        prediction.rows[0] != null
          ? {
              qualifiedCodes: prediction.rows[0].qualified_codes,
              finalistCodes: prediction.rows[0].finalist_codes,
              championCode: prediction.rows[0].champion_code,
            }
          : null,
    };
  }

  async savePrediction(sessionToken: string | undefined, body: SavePredictionDto) {
    const user = await this.getSessionUser(sessionToken);
    const predictionLockAt = await this.getPredictionLockAt();

    if (this.isPredictionLocked(predictionLockAt)) {
      throw new ForbiddenException('La fecha de cierre ya vencio. No se puede editar la prediccion.');
    }

    const qualified = body.qualifiedCodes.map((code) => code.toUpperCase());
    const finalists = body.finalistCodes.map((code) => code.toUpperCase());
    const champion = body.championCode.toUpperCase();

    if (new Set(qualified).size !== qualified.length) {
      throw new BadRequestException('Hay paises repetidos en los 32 clasificados.');
    }

    if (new Set(finalists).size !== finalists.length) {
      throw new BadRequestException('Hay paises repetidos en finalistas.');
    }

    if (!finalists.every((code) => qualified.includes(code))) {
      throw new BadRequestException('Los finalistas deben estar dentro de los 32 clasificados.');
    }

    if (!finalists.includes(champion)) {
      throw new BadRequestException('El campeon debe estar dentro de los finalistas.');
    }

    const validCountries = await this.databaseService.query<CountryRow>(
      `
        SELECT code, name, group_name
        FROM wc_countries
        WHERE code = ANY($1::text[]);
      `,
      [qualified],
    );

    if (validCountries.rows.length !== 32) {
      throw new BadRequestException('Uno o mas codigos de pais no existen en el mundial cargado.');
    }

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
      [user.user_id, qualified, finalists, champion],
    );

    return {
      success: true,
      message: 'Prediccion guardada.',
    };
  }

  private async getSessionUser(sessionToken: string | undefined) {
    if (!sessionToken) {
      throw new UnauthorizedException('Sesion invalida');
    }

    const sessionResult = await this.databaseService.query<SessionUserRow>(
      `
        SELECT s.user_id, u.email
        FROM sessions s
        JOIN users u ON u.id = s.user_id
        WHERE s.token = $1
          AND s.expires_at > NOW()
        LIMIT 1;
      `,
      [sessionToken],
    );

    const user = sessionResult.rows[0];
    if (!user) {
      throw new UnauthorizedException('Sesion invalida o vencida');
    }

    return user;
  }

  private async getPredictionLockAt() {
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
}
