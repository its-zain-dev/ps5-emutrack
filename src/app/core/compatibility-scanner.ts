import {
  CompatibilityStatus,
  CoreMatrixEmulatorId,
  GameCompatibilityEntry,
} from './tracker.types';

export interface GameDiscoveryRule {
  gameId: string;
  title: string;
  shortNote: string;
  keywords: string[];
  isUnreleasedFlagship?: boolean;
  releaseTargetIso?: string;
}

export const KNOWN_GAME_DISCOVERY_RULES: readonly GameDiscoveryRule[] = [
  {
    gameId: 'gta-vi',
    title: 'Grand Theft Auto VI (GTA VI)',
    shortNote: 'Rockstar Games · PS5 Flagship Release',
    keywords: ['gta vi', 'gta 6', 'gta6', 'grand theft auto vi', 'grand theft auto 6'],
    isUnreleasedFlagship: true,
    releaseTargetIso: '2026-11-19T00:00:00Z',
  },
  {
    gameId: 'ghost-of-yotei',
    title: 'Ghost of Yōtei',
    shortNote: 'Sucker Punch · Open-World Action',
    keywords: ['ghost of yotei', 'ghost of yōtei', 'yotei'],
  },
  {
    gameId: 'astro-bot',
    title: 'Astro Bot',
    shortNote: 'Team Asobi · 3D Platformer',
    keywords: ['astro bot', 'astrobot', "astro's playroom"],
  },
  {
    gameId: 'demons-souls',
    title: "Demon's Souls",
    shortNote: 'Bluepoint Games · Action RPG',
    keywords: ["demon's souls", 'demons souls'],
  },
  {
    gameId: 'spider-man-2',
    title: "Marvel's Spider-Man 2",
    shortNote: 'Insomniac Games · Action-Adventure',
    keywords: ['spider-man 2', 'spiderman 2'],
  },
  {
    gameId: 'returnal',
    title: 'Returnal',
    shortNote: 'Housemarque · Sci-Fi Roguelike',
    keywords: ['returnal'],
  },
  {
    gameId: 'stellar-blade',
    title: 'Stellar Blade',
    shortNote: 'Shift Up · Action RPG',
    keywords: ['stellar blade'],
  },
  {
    gameId: 'bloodborne',
    title: 'Bloodborne (60 FPS Patch / PS4-PS5)',
    shortNote: 'FromSoftware · Action RPG',
    keywords: ['bloodborne'],
  },
  {
    gameId: 'god-of-war-ragnarok',
    title: 'God of War Ragnarök',
    shortNote: 'Santa Monica Studio · Action-Adventure',
    keywords: ['god of war ragnarok', 'god of war ragnarök'],
  },
  {
    gameId: 'ff7-rebirth',
    title: 'Final Fantasy VII Rebirth',
    shortNote: 'Square Enix · Action RPG',
    keywords: ['final fantasy vii rebirth', 'ff7 rebirth'],
  },
  {
    gameId: 'horizon-forbidden-west',
    title: 'Horizon Forbidden West',
    shortNote: 'Guerrilla Games · Open-World RPG',
    keywords: ['horizon forbidden west'],
  },
  {
    gameId: 'wolverine-ps5',
    title: "Marvel's Wolverine",
    shortNote: 'Insomniac Games · Upcoming PS5 Exclusive',
    keywords: ['wolverine'],
    isUnreleasedFlagship: true,
    releaseTargetIso: '2026-12-31T00:00:00Z',
  },
];

const QUERY_SYNONYMS: Record<string, string[]> = {
  'gta 6': ['gta vi', 'grand theft auto vi', 'gta6', 'rockstar'],
  'gta6': ['gta vi', 'grand theft auto vi', 'rockstar'],
  'gta vi': ['gta 6', 'grand theft auto vi', 'rockstar'],
  'grand theft auto 6': ['gta vi', 'grand theft auto vi'],
  'pc': ['windows', 'linux', 'win64', 'x64'],
  'windows': ['win64', 'pc', 'dx12'],
  'android': ['apk', 'arm64', 'turnip', 'box64', 'mobile'],
  'apk': ['android', 'arm64', 'mobile'],
  'ps5': ['playstation 5', 'prospero', 'ps5'],
  'ps4': ['orbis', 'shadps4', 'fpps4', 'ps4'],
  'yotei': ['ghost of yōtei', 'ghost of yotei'],
  'souls': ["demon's souls", 'bloodborne'],
  'spiderman': ["marvel's spider-man 2", 'spider-man 2'],
  'gow': ['god of war ragnarök', 'god of war ragnarok'],
  'ff7': ['final fantasy vii rebirth', 'ff7 rebirth'],
};

export function expandSearchTerms(rawQuery: string): string[] {
  const normalized = rawQuery.trim().toLowerCase();
  if (!normalized) {
    return [];
  }
  const terms = new Set<string>([normalized]);
  for (const [key, aliases] of Object.entries(QUERY_SYNONYMS)) {
    if (normalized === key || normalized.includes(key)) {
      terms.add(key);
      for (const alias of aliases) {
        terms.add(alias);
      }
    }
  }
  return Array.from(terms);
}

export function inferStatusFromMentionContext(
  textLower: string,
  keywordIndex: number,
  rule: GameDiscoveryRule,
  nowMs = Date.now(),
): CompatibilityStatus {
  if (rule.isUnreleasedFlagship && rule.releaseTargetIso) {
    const releaseMs = Date.parse(rule.releaseTargetIso);
    if (!Number.isNaN(releaseMs) && nowMs < releaseMs) {
      return 'Pending Release';
    }
  }

  const start = Math.max(0, keywordIndex - 45);
  const end = Math.min(textLower.length, keywordIndex + 90);
  const windowText = textLower.slice(start, end);

  if (
    windowText.includes('in-game') ||
    windowText.includes('ingame') ||
    windowText.includes('playable') ||
    windowText.includes('60fps') ||
    windowText.includes('60 fps') ||
    windowText.includes('30fps') ||
    windowText.includes('runs ')
  ) {
    return 'In-Game';
  }

  if (
    windowText.includes('boots') ||
    windowText.includes('booting') ||
    windowText.includes('menu') ||
    windowText.includes('intro') ||
    windowText.includes('title screen')
  ) {
    return 'Boots to Menu';
  }

  if (windowText.includes('pending') || windowText.includes('unreleased')) {
    return 'Pending Release';
  }

  return 'Boots to Menu';
}

export interface DiscoveredGameMatch {
  gameId: string;
  title: string;
  status: CompatibilityStatus;
}

export function discoverSupportedGamesFromText(
  rawText: string,
  nowMs = Date.now(),
): DiscoveredGameMatch[] {
  const lower = rawText.toLowerCase();
  const discovered: DiscoveredGameMatch[] = [];

  for (const rule of KNOWN_GAME_DISCOVERY_RULES) {
    let matchedIndex = -1;
    for (const kw of rule.keywords) {
      const idx = lower.indexOf(kw);
      if (idx !== -1) {
        matchedIndex = idx;
        break;
      }
    }
    if (matchedIndex !== -1) {
      discovered.push({
        gameId: rule.gameId,
        title: rule.title,
        status: inferStatusFromMentionContext(lower, matchedIndex, rule, nowMs),
      });
    }
  }

  return discovered;
}

const STATUS_RANK: Record<CompatibilityStatus, number> = {
  'Not Supported Yet': 0,
  'Pending Release': 1,
  'Boots to Menu': 2,
  'In-Game': 3,
};

export function pickHigherCompatibilityStatus(
  current: CompatibilityStatus,
  candidate: CompatibilityStatus,
): CompatibilityStatus {
  return STATUS_RANK[candidate] > STATUS_RANK[current] ? candidate : current;
}

export function applyDiscoveredGamesToMatrix(
  existingGames: readonly GameCompatibilityEntry[],
  emulatorScanResults: Record<
    string,
    {
      emulatorName: string;
      text: string;
    }
  >,
  scanDateIso: string,
  nowMs = Date.now(),
): {
  games: GameCompatibilityEntry[];
  emulatorSupportedGames: Record<string, string[]>;
  discoveredCount: number;
} {
  const dateOnly = scanDateIso.slice(0, 10);
  const gamesMap = new Map<string, GameCompatibilityEntry>(
    existingGames.map((g) => [
      g.id,
      {
        ...g,
        statuses: { ...g.statuses },
        verifiedEmulators: g.verifiedEmulators ? [...g.verifiedEmulators] : [],
      },
    ]),
  );

  const emulatorSupportedGames: Record<string, string[]> = {};
  let discoveredCount = 0;
  const coreIds = new Set<CoreMatrixEmulatorId>(['kytyps5', 'sharpemu', 'prosperity', 'anyps5']);

  for (const [emulatorId, payload] of Object.entries(emulatorScanResults)) {
    const matches = discoverSupportedGamesFromText(payload.text, nowMs);
    if (matches.length === 0) {
      continue;
    }

    const titlesForEmu = new Set<string>();
    for (const match of matches) {
      titlesForEmu.add(match.title);
      discoveredCount += 1;

      const existing = gamesMap.get(match.gameId);
      if (existing) {
        if (coreIds.has(emulatorId as CoreMatrixEmulatorId)) {
          const coreKey = emulatorId as CoreMatrixEmulatorId;
          existing.statuses[coreKey] = pickHigherCompatibilityStatus(
            existing.statuses[coreKey],
            match.status,
          );
        }
        const verified = new Set(existing.verifiedEmulators ?? []);
        verified.add(payload.emulatorName);
        existing.verifiedEmulators = Array.from(verified);
        existing.lastVerifiedDate = dateOnly;
      } else {
        const rule = KNOWN_GAME_DISCOVERY_RULES.find((r) => r.gameId === match.gameId);
        if (rule) {
          const statuses: Record<CoreMatrixEmulatorId, CompatibilityStatus> = {
            kytyps5: emulatorId === 'kytyps5' ? match.status : 'Not Supported Yet',
            sharpemu: emulatorId === 'sharpemu' ? match.status : 'Not Supported Yet',
            prosperity: emulatorId === 'prosperity' ? match.status : 'Not Supported Yet',
            anyps5: emulatorId === 'anyps5' ? match.status : 'Not Supported Yet',
          };
          gamesMap.set(match.gameId, {
            id: rule.gameId,
            title: rule.title,
            shortNote: rule.shortNote,
            featured: rule.gameId === 'gta-vi',
            releaseTargetIso: rule.releaseTargetIso,
            lastVerifiedDate: dateOnly,
            statuses,
            performanceNote: `Auto-detected in ${payload.emulatorName} release notes & repository compatibility documentation.`,
            searchAliases: rule.keywords,
            verifiedEmulators: [payload.emulatorName],
          });
        }
      }
    }

    emulatorSupportedGames[emulatorId] = Array.from(titlesForEmu);
  }

  return {
    games: Array.from(gamesMap.values()),
    emulatorSupportedGames,
    discoveredCount,
  };
}
