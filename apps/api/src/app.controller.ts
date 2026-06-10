import { Controller, Get } from '@nestjs/common';

import { DatabaseService } from './database/database.service';

type LeaderboardPredictionRow = {
  id: number;
  email: string;
  full_name: string | null;
  sex: string | null;
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

type ResultsVersionRow = {
  results_version: string;
};

type UserScoringStateRow = {
  user_id: number;
  last_points: number;
  hit_streak: number;
  miss_streak: number;
  last_results_version: string;
  fail_avatar_key: string | null;
};

const DASHBOARD_GOAL_POINTS = 32;
const PREMIUM_THRESHOLD = 25;
const MISS_STREAK_FAIL_THRESHOLD = 2;
const PREMIUM_AVATAR_KEYS = Array.from({ length: 10 }, (_, index) => `user_avatars_premium${index + 1}.png`);
const FAIL_AVATAR_KEYS = [
  'user_avatar_fail1.png',
  'user_avatar_fail2.png',
  'user_avatar_fail3.png',
  'user_avatar_fail4.png',
];

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

function resolveDisplayName(fullName: string | null, email: string) {
  const clean = (fullName ?? '').trim();
  if (clean) {
    return clean;
  }

  return normalizeName(email);
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

function avatarRowFromSex(sex: string | null, userId: number) {
  const normalized = (sex ?? '').trim().toLowerCase();
  if (normalized === 'female') {
    return 'female' as const;
  }

  if (normalized === 'male') {
    return 'male' as const;
  }

  return avatarRowFromId(userId);
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
          u.full_name,
          u.sex,
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
          AND m.away_score IS NOT NULL
        ORDER BY m.id ASC;
      `,
    );

    const resultsVersionResult = await this.databaseService.query<ResultsVersionRow>(
      `
        SELECT
          COALESCE(
            MD5(
              STRING_AGG(
                CONCAT(id::text, ':', home_score::text, ':', away_score::text, ':', COALESCE(result_updated_at::text, '')),
                '|' ORDER BY id
              )
            ),
            'no-results'
          ) AS results_version
        FROM wc_matches
        WHERE home_score IS NOT NULL
          AND away_score IS NOT NULL;
      `,
    );
    const resultsVersion = resultsVersionResult.rows[0]?.results_version ?? 'no-results';

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
        const avatarRow = avatarRowFromSex(row.sex, row.id);
        const avatarFrame = avatarFrameFromStreak(streakLevel);

        return {
          id: row.id,
          name: resolveDisplayName(row.full_name, row.email),
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

    await this.syncPremiumAvatars(scoredLeaders);
    const failStreakMap = await this.syncFailStreakState(scoredLeaders, resultsVersion);
    const premiumClaimMap = await this.readPremiumClaimMap();

    const leaders = scoredLeaders
      .map((entry) => {
        const failState = failStreakMap.get(entry.id);
        const failAvatarKey = failState?.failAvatarKey;
        const premiumKey = premiumClaimMap.get(entry.id);

        let avatarImage = entry.avatarImage;
        if (premiumKey) {
          avatarImage = `/avatars/premium/${premiumKey}`;
        }

        if (failAvatarKey) {
          avatarImage = `/avatars/fails/${failAvatarKey}`;
        }

        return {
          ...entry,
          avatarImage,
          isPremium: premiumKey != null,
          hitStreak: failState?.hitStreak ?? 0,
          missStreak: failState?.missStreak ?? 0,
          isFailStreak: failAvatarKey != null,
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

  private async syncPremiumAvatars(
    entries: Array<{ id: number; points: number; predictionUpdatedAt: string | Date | null }>,
  ) {
    const existingClaims = await this.readPremiumClaimMap();
    const eligible = entries
      .filter((entry) => entry.points >= PREMIUM_THRESHOLD)
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
      })
      .slice(0, PREMIUM_AVATAR_KEYS.length);

    const desiredClaims = new Map<number, string>();
    const usedKeys = new Set<string>();

    for (const entry of eligible) {
      const existingKey = existingClaims.get(entry.id);
      if (existingKey && PREMIUM_AVATAR_KEYS.includes(existingKey) && !usedKeys.has(existingKey)) {
        desiredClaims.set(entry.id, existingKey);
        usedKeys.add(existingKey);
      }
    }

    const availableKeys = PREMIUM_AVATAR_KEYS.filter((key) => !usedKeys.has(key));

    for (const entry of eligible) {
      if (desiredClaims.has(entry.id)) {
        continue;
      }

      const avatarKey = availableKeys.shift();
      if (!avatarKey) {
        break;
      }

      desiredClaims.set(entry.id, avatarKey);
    }

    await this.databaseService.query(`DELETE FROM premium_avatar_claims;`);

    for (const entry of eligible) {
      const avatarKey = desiredClaims.get(entry.id);
      if (!avatarKey) {
        continue;
      }

      await this.databaseService.query(
        `
          INSERT INTO premium_avatar_claims (user_id, premium_avatar_key)
          VALUES ($1, $2);
        `,
        [entry.id, avatarKey],
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

  private async syncFailStreakState(entries: Array<{ id: number; points: number }>, resultsVersion: string) {
    const stateResult = await this.databaseService.query<UserScoringStateRow>(
      `
        SELECT user_id, last_points, hit_streak, miss_streak, last_results_version, fail_avatar_key
        FROM user_scoring_state;
      `,
    );

    const currentState = new Map(stateResult.rows.map((row) => [row.user_id, row]));
    const nextState = new Map<number, { hitStreak: number; missStreak: number; failAvatarKey: string | null }>();

    for (const entry of entries) {
      const existing = currentState.get(entry.id);

      if (!existing) {
        await this.databaseService.query(
          `
            INSERT INTO user_scoring_state (user_id, last_points, hit_streak, miss_streak, last_results_version, fail_avatar_key)
            VALUES ($1, $2, 0, 0, $3, NULL)
            ON CONFLICT (user_id)
            DO UPDATE SET
              last_points = EXCLUDED.last_points,
              last_results_version = EXCLUDED.last_results_version,
              updated_at = NOW();
          `,
          [entry.id, entry.points, resultsVersion],
        );

        nextState.set(entry.id, { hitStreak: 0, missStreak: 0, failAvatarKey: null });
        continue;
      }

      if (existing.last_results_version === resultsVersion) {
        nextState.set(entry.id, {
          hitStreak: existing.hit_streak,
          missStreak: existing.miss_streak,
          failAvatarKey: existing.fail_avatar_key,
        });
        continue;
      }

      const pointsIncreased = entry.points > existing.last_points;
      const pointsDecreased = entry.points < existing.last_points;
      const nextHitStreak = pointsIncreased ? existing.hit_streak + 1 : 0;
      const nextMissStreak = pointsDecreased ? existing.miss_streak + 1 : 0;
      const nextFailAvatarKey =
        nextMissStreak >= MISS_STREAK_FAIL_THRESHOLD
          ? existing.fail_avatar_key ?? this.pickRandomFailAvatarKey()
          : null;

      await this.databaseService.query(
        `
          INSERT INTO user_scoring_state (user_id, last_points, hit_streak, miss_streak, last_results_version, fail_avatar_key)
          VALUES ($1, $2, $3, $4, $5, $6)
          ON CONFLICT (user_id)
          DO UPDATE SET
            last_points = EXCLUDED.last_points,
            hit_streak = EXCLUDED.hit_streak,
            miss_streak = EXCLUDED.miss_streak,
            last_results_version = EXCLUDED.last_results_version,
            fail_avatar_key = EXCLUDED.fail_avatar_key,
            updated_at = NOW();
        `,
        [entry.id, entry.points, nextHitStreak, nextMissStreak, resultsVersion, nextFailAvatarKey],
      );

      nextState.set(entry.id, {
        hitStreak: nextHitStreak,
        missStreak: nextMissStreak,
        failAvatarKey: nextFailAvatarKey,
      });
    }

    return nextState;
  }

  private pickRandomFailAvatarKey() {
    const index = Math.floor(Math.random() * FAIL_AVATAR_KEYS.length);
    return FAIL_AVATAR_KEYS[index] ?? FAIL_AVATAR_KEYS[0];
  }
}
