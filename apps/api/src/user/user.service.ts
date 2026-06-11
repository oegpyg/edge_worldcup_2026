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
  finalist_codes: string[] | null;
  champion_code: string | null;
};

type PredictionLockRow = {
  setting_value: string;
};

@Injectable()
export class UserService {
  constructor(private readonly databaseService: DatabaseService) {}

  async getPanelData(sessionToken: string | undefined) {
    const user = await this.getSessionUser(sessionToken);
    const stage1LockAt = await this.getPredictionStageLockAt(1);
    const stage2LockAt = await this.getPredictionStageLockAt(2);
    const stage1Locked = this.isPredictionLocked(stage1LockAt);
    const stage2Locked = this.isPredictionLocked(stage2LockAt);
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
      predictionStage: stage1Locked ? (stage2Locked ? 'readonly' : 'stage2') : 'stage1',
      predictionLocked: stage2Locked,
      predictionLockAt: stage2LockAt,
      predictionStage1Locked: stage1Locked,
      predictionStage1LockAt: stage1LockAt,
      predictionStage2Locked: stage2Locked,
      predictionStage2LockAt: stage2LockAt,
      countries: countries.rows.map((row) => ({
        code: row.code,
        name: row.name,
        groupName: row.group_name,
      })),
      prediction:
        prediction.rows[0] != null
          ? {
              qualifiedCodes: prediction.rows[0].qualified_codes,
              finalistCodes: prediction.rows[0].finalist_codes ?? [],
              championCode: prediction.rows[0].champion_code ?? '',
            }
          : null,
    };
  }

  async savePrediction(sessionToken: string | undefined, body: SavePredictionDto) {
    const user = await this.getSessionUser(sessionToken);
    const stage1LockAt = await this.getPredictionStageLockAt(1);
    const stage2LockAt = await this.getPredictionStageLockAt(2);
    const stage1Locked = this.isPredictionLocked(stage1LockAt);
    const stage2Locked = this.isPredictionLocked(stage2LockAt);

    if (stage1Locked && stage2Locked) {
      throw new ForbiddenException('Las etapas de prediccion ya estan cerradas.');
    }

    const qualified = body.qualifiedCodes.map((code) => code.toUpperCase());

    if (new Set(qualified).size !== qualified.length) {
      throw new BadRequestException('Hay paises repetidos en los 32 clasificados.');
    }

    const predictionResult = await this.databaseService.query<PredictionRow>(
      `
        SELECT qualified_codes, finalist_codes, champion_code
        FROM user_predictions
        WHERE user_id = $1
        LIMIT 1;
      `,
      [user.user_id],
    );

    const currentPrediction = predictionResult.rows[0] ?? null;

    if (!stage1Locked) {
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

      const groupCounts = new Map<string, number>();
      for (const country of validCountries.rows) {
        const nextCount = (groupCounts.get(country.group_name) ?? 0) + 1;
        groupCounts.set(country.group_name, nextCount);

        if (nextCount > 3) {
          throw new BadRequestException('Solo puedes elegir maximo 3 paises por grupo.');
        }
      }

      await this.databaseService.query(
        `
          INSERT INTO user_predictions (user_id, qualified_codes, finalist_codes, champion_code)
          VALUES ($1, $2::text[], NULL, NULL)
          ON CONFLICT (user_id)
          DO UPDATE SET
            qualified_codes = EXCLUDED.qualified_codes,
            updated_at = NOW();
        `,
        [user.user_id, qualified],
      );

      return {
        success: true,
        stage: 'stage1',
        message: 'Etapa 1 guardada. Clasificados actualizados.',
      };
    }

    if (stage2Locked) {
      throw new ForbiddenException('La etapa 2 ya cerro. No se puede editar finalistas y campeon.');
    }

    if (!currentPrediction || currentPrediction.qualified_codes.length !== 32) {
      throw new ForbiddenException('No tienes etapa 1 completa. Pide al admin habilitar o extender etapa 1.');
    }

    if (!this.haveSameCodes(qualified, currentPrediction.qualified_codes)) {
      throw new ForbiddenException('En etapa 2 no se puede modificar la lista de 32 clasificados.');
    }

    const finalists = (body.finalistCodes ?? []).map((code) => code.toUpperCase());
    const champion = (body.championCode ?? '').toUpperCase();

    if (new Set(finalists).size !== finalists.length) {
      throw new BadRequestException('Hay paises repetidos en finalistas.');
    }

    if (finalists.length !== 2) {
      throw new BadRequestException('Debes elegir 2 finalistas en la etapa 2.');
    }

    if (!champion) {
      throw new BadRequestException('Debes elegir campeon en la etapa 2.');
    }

    if (!finalists.every((code) => currentPrediction.qualified_codes.includes(code))) {
      throw new BadRequestException('Los finalistas deben estar dentro de los 32 clasificados.');
    }

    if (!finalists.includes(champion)) {
      throw new BadRequestException('El campeon debe estar dentro de los finalistas.');
    }

    await this.databaseService.query(
      `
        UPDATE user_predictions
        SET finalist_codes = $2::text[],
            champion_code = $3,
            updated_at = NOW()
        WHERE user_id = $1;
      `,
      [user.user_id, finalists, champion],
    );

    return {
      success: true,
      stage: 'stage2',
      message: 'Etapa 2 guardada. Finalistas y campeon actualizados.',
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

  private async getPredictionStageLockAt(stage: 1 | 2) {
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

  private haveSameCodes(left: string[], right: string[]) {
    if (left.length !== right.length) {
      return false;
    }

    const leftSorted = [...left].sort();
    const rightSorted = [...right].sort();
    return leftSorted.every((code, index) => code === rightSorted[index]);
  }

  private isPredictionLocked(lockAt: string | null) {
    if (!lockAt) {
      return false;
    }

    const parsed = new Date(lockAt);
    return !Number.isNaN(parsed.getTime()) && parsed <= new Date();
  }
}
