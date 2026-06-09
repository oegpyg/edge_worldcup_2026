import { Controller, Get } from '@nestjs/common';

import { DatabaseService } from './database/database.service';

type LeaderboardPredictionRow = {
  id: number;
  email: string;
  prediction_updated_at: string | Date | null;
  qualified_codes: string[] | null;
  finalist_codes: string[] | null;
  champion_code: string | null;
};

type MatchResultRow = {
  home_code: string;
  away_code: string;
  home_score: number | null;
  away_score: number | null;
};

type PremiumClaimRow = {
  user_id: number;
  premium_avatar_key: string;
  claimed_at: string;
};

const DASHBOARD_GOAL_POINTS = 32;
const PREMIUM_THRESHOLD = 25;
const PREMIUM_AVATAR_KEYS = Array.from({ length: 10 }, (_, index) => `user_avatars_premium${index + 1}.png`);

function normalizeName(email: string) {
  const local = email.split('@')[0] ?? email;
  const base = local.replace(/[._-]+/g, ' ').trim();

  if (!base) {
    return 'Jugador';
  }

  return base
    .split(' ')
    .filter(Boolean)
    .slice(0, 2)
    .map((part) => part.charAt(0).toUpperCase() + part.slice(1).toLowerCase())
    .join(' ');
}

function streakLevelFromPoints(points: number) {
  if (points >= 30) {
    return 5;
  }

  if (points >= 22) {
    return 4;
  }

  if (points >= 17) {
    return 3;
  }

  if (points >= 11) {
    return 2;
  }

  if (points >= 6) {
    return 1;
  }

  return 0;
}

function scoreLabel(streakLevel: number) {
  if (streakLevel <= 0) {
    return 'Sin racha';
  }

  if (streakLevel >= 5) {
    return 'Racha: 6+ aciertos';
  }

  return `Racha: ${streakLevel} aciertos`;
}

function avatarRowFromId(id: number) {
  return id % 2 === 0 ? 'female' : 'male';
}

function avatarFrameFromStreak(streakLevel: number) {
  if (streakLevel >= 5) {
    return 9;
  }

  if (streakLevel === 4) {
    return 8;
  }

  if (streakLevel === 3) {
    return 7;
  }

  if (streakLevel === 2) {
    return 1;
  }

  if (streakLevel === 1) {
    return 2;
  }

  return 0;
}

function standardAvatarImage(row: 'male' | 'female', frame: number) {
  const normalized = Math.min(10, Math.max(1, frame + 1));
  const prefix = row === 'female' ? 'f' : 'm';
  return `/avatars/${prefix}${normalized}.png`;
}

@Controller()
export class AppController {
  constructor(private readonly databaseService: DatabaseService) {}

  @Get('health')
  getHealth() {
    return {
      status: 'ok',
      service: 'edge-worldcup-api',
      timestamp: new Date().toISOString(),
    };
  }

  @Get('dashboard/leaderboard')
  async getDashboardLeaderboard() {
    const predictionResult = await this.databaseService.query<LeaderboardPredictionRow>(
      `
        SELECT
          u.id,
          u.email,
          up.updated_at AS prediction_updated_at,
          up.qualified_codes,
          up.finalist_codes,
          up.champion_code
        FROM users u
        LEFT JOIN user_predictions up ON up.user_id = u.id
        ORDER BY u.created_at DESC;
      `,
    );

    const matchesResult = await this.databaseService.query<MatchResultRow>(
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

    for (const row of matchesResult.rows) {
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

    const rankedTeams = Array.from(teamPoints.entries())
      .sort((entryA, entryB) => {
        if (entryB[1] !== entryA[1]) {
          return entryB[1] - entryA[1];
        }

        return entryA[0].localeCompare(entryB[0]);
      })
      .map(([code]) => code);

    const qualifiers = new Set(rankedTeams.slice(0, 32));
    const finalists = new Set(rankedTeams.slice(0, 2));
    const champion = rankedTeams[0] ?? null;

    const scoredLeaders = predictionResult.rows
      .map((row) => {
        const qualifiedCodes = row.qualified_codes ?? [];
        const finalistCodes = row.finalist_codes ?? [];
        const pointsFromQualifiers = qualifiedCodes.filter((code) => qualifiers.has(code)).length;
        const pointsFromFinalists = finalistCodes.filter((code) => finalists.has(code)).length;
        const pointsFromChampion = row.champion_code && row.champion_code === champion ? 1 : 0;
        const points = pointsFromQualifiers + pointsFromFinalists + pointsFromChampion;
        const streakLevel = streakLevelFromPoints(points);
        const avatarRow = avatarRowFromId(row.id);
        const avatarFrame = avatarFrameFromStreak(streakLevel);

        return {
          id: row.id,
          name: normalizeName(row.email),
          predictionUpdatedAt: row.prediction_updated_at,
          points,
          progress: Math.min(100, Math.round((points / DASHBOARD_GOAL_POINTS) * 100)),
          streakLevel,
          streakLabel: scoreLabel(streakLevel),
          avatarRow,
          avatarFrame,
          avatarImage: standardAvatarImage(avatarRow, avatarFrame),
        };
      })
      .sort((entryA, entryB) => {
        if (entryB.points !== entryA.points) {
          return entryB.points - entryA.points;
        }

        return entryA.name.localeCompare(entryB.name);
      });

    await this.assignPremiumAvatars(scoredLeaders);
    const premiumClaimMap = await this.readPremiumClaimMap();

    const leaders = scoredLeaders
      .map((entry) => {
        const premiumKey = premiumClaimMap.get(entry.id);
        return {
          ...entry,
          avatarImage: premiumKey ? `/avatars/premium/${premiumKey}` : entry.avatarImage,
          isPremium: premiumKey != null,
        };
      })
      .map((entry, index) => ({
        ...entry,
        rank: index + 1,
      }));

    const now = new Date();

    return {
      goalPoints: DASHBOARD_GOAL_POINTS,
      phase: 'Fase de Grupos',
      nextUpdateInSeconds: Math.max(1, 60 - now.getUTCSeconds()),
      liveUpdatedAt: now.toISOString(),
      leaders,
    };
  }

  private async assignPremiumAvatars(
    entries: Array<{ id: number; points: number; predictionUpdatedAt: string | Date | null }>,
  ) {
    const claimMap = await this.readPremiumClaimMap();
    const usedKeys = new Set(Array.from(claimMap.values()));

    const availableKeys = PREMIUM_AVATAR_KEYS.filter((key) => !usedKeys.has(key));
    if (availableKeys.length === 0) {
      return;
    }

    const eligible = entries
      .filter((entry) => entry.points >= PREMIUM_THRESHOLD && !claimMap.has(entry.id))
      .sort((entryA, entryB) => {
        const aTime = entryA.predictionUpdatedAt
          ? new Date(entryA.predictionUpdatedAt).getTime()
          : Number.POSITIVE_INFINITY;
        const bTime = entryB.predictionUpdatedAt
          ? new Date(entryB.predictionUpdatedAt).getTime()
          : Number.POSITIVE_INFINITY;

        if (aTime !== bTime) {
          return aTime - bTime;
        }

        return entryA.id - entryB.id;
      });

    for (let index = 0; index < Math.min(eligible.length, availableKeys.length); index += 1) {
      const candidate = eligible[index];
      const avatarKey = availableKeys[index];

      await this.databaseService.query(
        `
          INSERT INTO premium_avatar_claims (user_id, premium_avatar_key)
          VALUES ($1, $2)
          ON CONFLICT DO NOTHING;
        `,
        [candidate.id, avatarKey],
      );
    }
  }

  private async readPremiumClaimMap() {
    const claimResult = await this.databaseService.query<PremiumClaimRow>(
      `
        SELECT user_id, premium_avatar_key, claimed_at
        FROM premium_avatar_claims
        ORDER BY claimed_at ASC;
      `,
    );

    return new Map(claimResult.rows.map((row) => [row.user_id, row.premium_avatar_key]));
  }
}
