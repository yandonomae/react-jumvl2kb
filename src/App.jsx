import React, { useEffect, useMemo, useRef, useState } from 'react';
import shp from 'shpjs';
import Papa from 'papaparse';
import { geoBounds, geoCentroid, geoContains, geoMercator, geoPath } from 'd3-geo';
import { extent } from 'd3-array';
import { scaleSequential, scaleDiverging } from 'd3-scale';
import {
  interpolateYlOrRd,
  interpolateGreens,
  interpolatePurples,
  interpolateRdBu,
} from 'd3-scale-chromatic';
import { select } from 'd3-selection';
import { zoom, zoomIdentity } from 'd3-zoom';
import { topology } from 'topojson-server';
import { mesh } from 'topojson-client';

/**
 * 茨木市統計データ可視化システム（ブラウザ完結 / サーバ不要）
 * - 同梱データ（展開済み Shapefile + h03/h06 CSV）を初期ロードして可視化
 * - コロプレス（人口/世帯/事業所） + 特化係数（分析）
 * - 鉄道路線オーバーレイ（指定色） + 駅マーカー（サイズ調整） + 線幅調整
 */

// 画像から抽出した近似色（ユーザー指定の「1枚目/2枚目/3枚目の画像の色」）
const LINE_COLORS = {
  JR: '#0075BF', // rgb(0,117,191)
  MONORAIL: '#0053A5', // rgb(0,83,165)
  HANKYU: '#0EA641', // rgb(14,166,65)
};

// 路線データ（[lon, lat]）
const RAIL_LINES = [
  {
    id: '大阪モノレール彩都線',
    color: LINE_COLORS.MONORAIL,
    stations: [
      {
        id: 'saito_万博記念公園',
        name: '万博記念公園',
        lat: 34.806827314668936,
        lon: 135.53005040053708,
      },
      {
        id: 'saito_公園東口',
        name: '公園東口',
        lat: 34.81072577112878,
        lon: 135.53955497806987,
      },
      {
        id: 'saito_阪大病院前',
        name: '阪大病院前',
        lat: 34.81864488515618,
        lon: 135.52970517815763,
      },
      {
        id: 'saito_豊川',
        name: '豊川',
        lat: 34.83464838942282,
        lon: 135.52677065227712,
      },
      {
        id: 'saito_彩都西',
        name: '彩都西',
        lat: 34.85521913877144,
        lon: 135.52278294673508,
      },
    ],
  },
  {
    id: '大阪モノレール本線',
    color: LINE_COLORS.MONORAIL,
    stations: [
      {
        id: 'mono_大阪空港',
        name: '大阪空港',
        lat: 34.78999473315696,
        lon: 135.44310841059152,
      },
      {
        id: 'mono_蛍池',
        name: '蛍池',
        lat: 34.79459262929456,
        lon: 135.44925533283273,
      },
      {
        id: 'mono_柴原阪大前',
        name: '柴原阪大前',
        lat: 34.80036200177778,
        lon: 135.45862717932008,
      },
      {
        id: 'mono_小路',
        name: '小路',
        lat: 34.804273461852034,
        lon: 135.4753717139928,
      },
      {
        id: 'mono_千里中央',
        name: '千里中央',
        lat: 34.80748842451425,
        lon: 135.4952017178434,
      },
      {
        id: 'mono_山田',
        name: '山田',
        lat: 34.80563801375956,
        lon: 135.51563335019645,
      },
      {
        id: 'mono_万博記念公園',
        name: '万博記念公園',
        lat: 34.806827314668936,
        lon: 135.53005040053708,
      },
      {
        id: 'mono_宇野辺',
        name: '宇野辺',
        lat: 34.80804840265577,
        lon: 135.55459199078433,
      },
      {
        id: 'mono_南茨木',
        name: '南茨木',
        lat: 34.802421914271925,
        lon: 135.56516910151777,
      },
      {
        id: 'mono_沢良宣',
        name: '沢良宣',
        lat: 34.79305532199678,
        lon: 135.56560290099247,
      },
      {
        id: 'mono_摂津',
        name: '摂津',
        lat: 34.78003866337152,
        lon: 135.56141288159185,
      },
    ],
  },
  {
    id: '阪急京都線',
    color: LINE_COLORS.HANKYU,
    stations: [
      {
        id: 'hk_摂津市',
        name: '摂津市',
        lat: 34.786394237048235,
        lon: 135.5537682535518,
      },
      {
        id: 'hk_南茨木',
        name: '南茨木',
        lat: 34.80229324949706,
        lon: 135.56511755691452,
      },
      {
        id: 'hk_茨木市',
        name: '茨木市',
        lat: 34.81654492994446,
        lon: 135.57579925419532,
      },
      {
        id: 'hk_総持寺',
        name: '総持寺',
        lat: 34.827007881351975,
        lon: 135.5847208990953,
      },
      {
        id: 'hk_富田',
        name: '富田',
        lat: 34.83497876170166,
        lon: 135.59242871475357,
      },
    ],
  },
  {
    id: 'JR京都線',
    color: LINE_COLORS.JR,
    stations: [
      {
        id: 'jr_東淀川',
        name: '東淀川',
        lat: 34.739509532476376,
        lon: 135.50407796260967,
      },
      {
        id: 'jr_吹田',
        name: '吹田',
        lat: 34.76299317618368,
        lon: 135.52366881720957,
      },
      {
        id: 'jr_岸辺',
        name: '岸辺',
        lat: 34.77702375730649,
        lon: 135.54158597337508,
      },
      {
        id: 'jr_千里丘',
        name: '千里丘',
        lat: 34.791328741602335,
        lon: 135.55127990361515,
      },
      {
        id: 'jr_茨木',
        name: '茨木',
        lat: 34.815249424562744,
        lon: 135.56226505820496,
      },
      {
        id: 'jr_JR総持寺',
        name: 'JR総持寺',
        lat: 34.828452660617046,
        lon: 135.57731654074456,
      },
      {
        id: 'jr_摂津富田',
        name: '摂津富田',
        lat: 34.83761894561269,
        lon: 135.5933390866791,
      },
    ],
  },
  {
    id: 'おおさか東線',
    color: LINE_COLORS.JR,
    stations: [
      {
        id: 'os_東淀川',
        name: '東淀川',
        lat: 34.739509532476376,
        lon: 135.50407796260967,
      },
      {
        id: 'os_南吹田',
        name: '南吹田',
        lat: 34.74954202598922,
        lon: 135.51107316364948,
      },
      {
        id: 'os_JR淡路',
        name: 'JR淡路',
        lat: 34.74074382407494,
        lon: 135.51980643616128,
      },
    ],
  },
  {
    id: '阪急千里線',
    color: LINE_COLORS.HANKYU,
    stations: [
      {
        id: 'hs_下新庄',
        name: '下新庄',
        lat: 34.74695067335979,
        lon: 135.5197886388255,
      },
      {
        id: 'hs_吹田',
        name: '吹田',
        lat: 34.759591334660875,
        lon: 135.51725663358397,
      },
      {
        id: 'hs_豊津',
        name: '豊津',
        lat: 34.76452719032837,
        lon: 135.50903834526778,
      },
      {
        id: 'hs_関大前',
        name: '関大前',
        lat: 34.77087285678913,
        lon: 135.50605572887227,
      },
      {
        id: 'hs_千里山',
        name: '千里山',
        lat: 34.77869850685209,
        lon: 135.50551928707253,
      },
      {
        id: 'hs_南千里',
        name: '南千里',
        lat: 34.792532580967865,
        lon: 135.50875939553475,
      },
      {
        id: 'hs_山田',
        name: '山田',
        lat: 34.80563801375956,
        lon: 135.51563335019645,
      },
      {
        id: 'hs_北千里',
        name: '北千里',
        lat: 34.82017615162188,
        lon: 135.51094807811717,
      },
    ],
  },
  {
    id: '阪急宝塚本線',
    color: LINE_COLORS.HANKYU,
    stations: [
      {
        id: 'ht_石橋阪大前',
        name: '石橋阪大前',
        lat: 34.80826816882737,
        lon: 135.445497706966,
      },
      {
        id: 'ht_蛍池',
        name: '蛍池',
        lat: 34.79459262929456,
        lon: 135.44925533283273,
      },
      {
        id: 'ht_豊中',
        name: '豊中',
        lat: 34.78745587481611,
        lon: 135.461249039158,
      },
      {
        id: 'ht_岡町',
        name: '岡町',
        lat: 34.77913554265949,
        lon: 135.46492357604055,
      },
      {
        id: 'ht_曽根',
        name: '曽根',
        lat: 34.771548009752024,
        lon: 135.46747533762672,
      },
      {
        id: 'ht_服部天神',
        name: '服部天神',
        lat: 34.762974515515936,
        lon: 135.4751051049441,
      },
      {
        id: 'ht_庄内',
        name: '庄内',
        lat: 34.750269852793345,
        lon: 135.47490096406366,
      },
      {
        id: 'ht_三国',
        name: '三国',
        lat: 34.73746243960697,
        lon: 135.48302609732912,
      },
    ],
  },
  {
    id: '北大阪急行',
    color: LINE_COLORS.JR,
    stations: [
      {
        id: 'nk_東三国',
        name: '東三国',
        lat: 34.74110702662293,
        lon: 135.49847924143242,
      },
      {
        id: 'nk_江坂',
        name: '江坂',
        lat: 34.75876080929301,
        lon: 135.49699921973465,
      },
      {
        id: 'nk_緑地公園',
        name: '緑地公園',
        lat: 34.77540474358963,
        lon: 135.495442645223,
      },
      {
        id: 'nk_桃山台',
        name: '桃山台',
        lat: 34.792485391455166,
        lon: 135.49738198403784,
      },
      {
        id: 'nk_千里中央',
        name: '千里中央',
        lat: 34.80985582041559,
        lon: 135.49498332809065,
      },
      {
        id: 'nk_箕面船場阪大前',
        name: '箕面船場阪大前',
        lat: 34.822000222196415,
        lon: 135.49012200163338,
      },
      {
        id: 'nk_箕面萱野',
        name: '箕面萱野',
        lat: 34.83142947310954,
        lon: 135.4890922025979,
      },
    ],
  },
];

// ★追加：路線間の接続（万博記念公園 ⇄ 宇野辺）
const RAIL_CONNECTORS = [
  {
    id: '接続: 万博記念公園-宇野辺',
    color: LINE_COLORS.MONORAIL,
    coordinates: [
      [135.53005040053708, 34.806827314668936], // 万博記念公園
      [135.55459199078433, 34.80804840265577], // 宇野辺
    ],
  },
];

const RIDERSHIP_BY_STATION_ID = {
  saito_万博記念公園: 20294,
  saito_公園東口: 1598,
  saito_阪大病院前: 9814,
  saito_豊川: 3062,
  saito_彩都西: 10814,
  mono_大阪空港: 17248,
  mono_蛍池: 29592,
  mono_柴原阪大前: 9834,
  mono_小路: 13322,
  mono_千里中央: 40716,
  mono_山田: 19580,
  mono_万博記念公園: 20294,
  mono_宇野辺: 8078,
  mono_南茨木: 31274,
  mono_沢良宣: 4364,
  mono_摂津: 5704,
  hk_摂津市: 10922,
  hk_南茨木: 39188,
  hk_茨木市: 53322,
  hk_総持寺: 12493,
  hk_富田: 15598,
  jr_東淀川: 14492,
  jr_吹田: 44262,
  jr_岸辺: 39978,
  jr_千里丘: 38768,
  jr_茨木: 86856,
  jr_JR総持寺: 19450,
  jr_摂津富田: 36756,
  os_東淀川: 14492,
  os_南吹田: 6890,
  os_JR淡路: 20688,
  hs_下新庄: 7577,
  hs_吹田: 14197,
  hs_豊津: 12780,
  hs_関大前: 23665,
  hs_千里山: 15426,
  hs_南千里: 18541,
  hs_山田: 22596,
  hs_北千里: 22069,
  ht_石橋阪大前: 39177,
  ht_蛍池: 38675,
  ht_豊中: 42613,
  ht_岡町: 15876,
  ht_曽根: 21762,
  ht_服部天神: 21397,
  ht_庄内: 24867,
  ht_三国: 24390,
  nk_東三国: 36365,
  nk_江坂: 85538,
  nk_緑地公園: 32503,
  nk_桃山台: 36050,
  nk_千里中央: 69342,
  nk_箕面船場阪大前: 14095,
  nk_箕面萱野: 19985,
};

const DEFAULT_MODE = 'population'; // population | household | business | analysis | restaurant | restaurant-analysis | ridership

const RESTAURANT_GRID_SIZE_METERS = 250;
const RIDERSHIP_ICON_STEP = 5000;
const RIDERSHIP_ICON_DEFAULT_SIZE = 22;
const RIDERSHIP_ICON_GAP = 4;
const RIDERSHIP_ICON_ROW_COUNT = 5;
const TILE_SIZE = 256;

const resolvePublicUrl = (path) => {
  const baseHref = new URL(import.meta.env.BASE_URL ?? '/', window.location.href);
  const normalizedPath = path.replace(/^\/+/, '');
  return new URL(normalizedPath, baseHref).toString();
};

const DEFAULT_DATA_FILES = {
  shapeBases: [
    resolvePublicUrl('data/茨木_地図/r2ka27211'),
    resolvePublicUrl('data/高槻_地図/r2ka27207'),
    resolvePublicUrl('data/吹田_地図/r2ka27205'),
    resolvePublicUrl('data/豊中_地図/r2ka27203'),
  ],
  populationCsv: resolvePublicUrl('data/h03_27(茨木_人口).csv'),
  householdCsv: resolvePublicUrl('data/h06_01_27(茨木_世帯).csv'),
  restaurantSuitaCsv: resolvePublicUrl('data/飲食店_吹田.csv'),
  restaurantToyonakaCsv: resolvePublicUrl('data/飲食店_豊中.csv'),
  restaurantSuitaGeoCsv: resolvePublicUrl('data/飲食店_吹田_緯度経度付き.csv'),
  restaurantToyonakaGeoCsv: resolvePublicUrl(
    'data/飲食店_豊中_緯度経度付き.csv'
  ),
};

const TARGET_CITY_CODES = ['27211', '27207', '27205', '27203'];

const CITY_CODE_LABELS = {
  '27211': '茨木市',
  '27207': '高槻市',
  '27205': '吹田市',
  '27203': '豊中市',
};

const MAP_SOURCES = [
  { code: '27211', label: '茨木市', path: 'data/茨木_地図/r2ka27211' },
  { code: '27207', label: '高槻市', path: 'data/高槻_地図/r2ka27207' },
  { code: '27205', label: '吹田市', path: 'data/吹田_地図/r2ka27205' },
  { code: '27203', label: '豊中市', path: 'data/豊中_地図/r2ka27203' },
];

const CITY_NAME_TO_CODE = Object.fromEntries(
  Object.entries(CITY_CODE_LABELS).map(([code, name]) => [name, code])
);

const CITY_BOUNDARY_GEOJSON_PATH = 'data/市境.geojson';

// h06（世帯）階層（キー=列名）
const HOUSEHOLD_HIERARCHY = {
  key: '総数',
  label: '総数',
  children: [
    {
      key: '親族のみの世帯',
      label: '親族のみの世帯',
      children: [
        {
          key: '核家族世帯',
          label: '核家族世帯',
          children: [
            { key: 'うち夫婦のみの世帯', label: 'うち夫婦のみの世帯' },
            {
              key: 'うち夫婦と子供から成る世帯',
              label: 'うち夫婦と子供から成る世帯',
            },
          ],
        },
        { key: '核家族以外の世帯', label: '核家族以外の世帯' },
      ],
    },
    { key: '非親族を含む世帯', label: '非親族を含む世帯' },
    { key: '単独世帯', label: '単独世帯' },
    { key: '世帯の家族類型「不詳' + '」', label: '世帯の家族類型「不詳」' },
  ],
};

// ★追加：特化係数の分子候補（毎回同じh06想定なのでハードコード可）
const ANALYSIS_METRIC_OPTIONS = [
  '単独世帯',
  '核家族世帯',
  'うち夫婦のみの世帯',
  'うち夫婦と子供から成る世帯',
  '核家族以外の世帯',
  '親族のみの世帯',
  '非親族を含む世帯',
  '世帯の家族類型「不詳」',
];

const STATION_CATCHMENT_METERS = 500;
const RATING_STEP = 0.25;
const RATING_MIN = 0;
const RATING_MAX = 5;

function clamp(n, a, b) {
  return Math.max(a, Math.min(b, n));
}

function formatNumber(n) {
  if (n === null || n === undefined || Number.isNaN(n)) return '-';
  const x = Number(n);
  if (!Number.isFinite(x)) return '-';
  return x.toLocaleString('ja-JP', { maximumFractionDigits: 4 });
}

function safeToNumber(v) {
  if (v === null || v === undefined) return null;
  const s = String(v).trim();
  if (!s || s === '-' || s === '–' || s === '―') return null;
  const cleaned = s.replace(/,/g, '');
  const num = Number(cleaned);
  return Number.isFinite(num) ? num : null;
}

function buildRidershipIconFragments(value) {
  if (!Number.isFinite(value) || value <= 0) return [];
  const ratio = value / RIDERSHIP_ICON_STEP;
  const full = Math.floor(ratio);
  const remainder = ratio - full;
  const parts = Array.from({ length: full }, () => ({
    fraction: 1,
  }));
  if (remainder > 0) {
    parts.push({ fraction: remainder });
  }
  return parts;
}

function parseBudgetValue(raw) {
  if (!raw) return null;
  const text = String(raw).trim();
  if (!text || text === '-' || text === '–' || text === '―') return null;
  const cleaned = text.replace(/,/g, '');
  const matches = cleaned.match(/\d+/g) || [];
  const nums = matches.map((n) => Number(n)).filter(Number.isFinite);
  if (!nums.length) return null;
  if (nums.length >= 2) {
    return (nums[0] + nums[1]) / 2;
  }
  const value = nums[0];
  const upperOnly = /^[^0-9]*[〜～~]/.test(cleaned);
  if (upperOnly) {
    if (value <= 999) return 500;
    return value / 2;
  }
  return value;
}

function buildRatingRanges() {
  const ranges = [];
  for (let min = RATING_MIN; min < RATING_MAX; min += RATING_STEP) {
    const max = Math.min(min + RATING_STEP, RATING_MAX);
    ranges.push({
      key: `${min.toFixed(2)}-${max.toFixed(2)}`,
      label: `${min.toFixed(2)}〜${max.toFixed(2)}`,
      min,
      max,
    });
  }
  return ranges;
}

function getRatingRangeKey(value) {
  if (!Number.isFinite(value)) return 'none';
  const clamped = clamp(value, RATING_MIN, RATING_MAX);
  let min = Math.floor(clamped / RATING_STEP) * RATING_STEP;
  if (min > RATING_MAX - RATING_STEP) min = RATING_MAX - RATING_STEP;
  const max = min + RATING_STEP;
  return `${min.toFixed(2)}-${max.toFixed(2)}`;
}

const CATEGORY_NONE_KEY = 'none';
const CATEGORY_NONE_LABEL = 'カテゴリなし';

function splitRestaurantCategories(raw) {
  const normalized = normalizeKeyString(raw);
  if (!normalized) return [];
  return normalized
    .split(/[、,／/・]/)
    .map((c) => c.trim())
    .filter(Boolean);
}

function haversineMeters(lat1, lon1, lat2, lon2) {
  const toRad = (deg) => (deg * Math.PI) / 180;
  const r = 6371000;
  const dLat = toRad(lat2 - lat1);
  const dLon = toRad(lon2 - lon1);
  const a =
    Math.sin(dLat / 2) ** 2 +
    Math.cos(toRad(lat1)) *
      Math.cos(toRad(lat2)) *
      Math.sin(dLon / 2) ** 2;
  return 2 * r * Math.asin(Math.sqrt(a));
}

function normalizeKeyString(v) {
  if (v === null || v === undefined) return '';
  return String(v).replace(/\.0$/, '').trim();
}

function getAreaCodeLengths(geojson) {
  if (!geojson?.features?.length) return [];
  const lengths = new Set();
  for (const feature of geojson.features) {
    const key = normalizeKeyString(feature?.properties?.KEY_CODE);
    if (key.length < 5) continue;
    const areaLength = key.length - 5;
    if (areaLength <= 0) continue;
    lengths.add(areaLength);
  }
  return Array.from(lengths).sort((a, b) => a - b);
}

function useResizeObserver(ref) {
  const [size, setSize] = useState({ width: 0, height: 0 });

  useEffect(() => {
    if (!ref.current) return;
    const el = ref.current;

    const ro = new ResizeObserver((entries) => {
      const entry = entries[0];
      if (!entry) return;
      const { width, height } = entry.contentRect;
      setSize({ width: Math.max(0, width), height: Math.max(0, height) });
    });

    ro.observe(el);
    return () => ro.disconnect();
  }, [ref]);

  return size;
}

function decodeArrayBufferSmart(buf) {
  const tryDecode = (enc) => {
    try {
      return new TextDecoder(enc).decode(buf);
    } catch {
      return '';
    }
  };

  const utf8 = tryDecode('utf-8');
  const sjis = tryDecode('shift_jis');

  const score = (txt) => {
    if (!txt) return -1;
    let s = 0;
    if (txt.includes('市区町村コード')) s += 6;
    if (txt.includes('町丁字コード')) s += 6;
    if (txt.includes('地域階層レベル')) s += 3;
    if (txt.includes('KEY_CODE')) s += 6;
    const repl = (txt.match(/�/g) || []).length;
    s -= repl / 2000;
    return s;
  };

  return score(sjis) > score(utf8) ? sjis : utf8;
}

async function loadShapefileFromUrl(url) {
  const gj = await shp(url);
  const geojson = Array.isArray(gj) ? gj[0] : gj;

  if (!geojson || !geojson.features)
    throw new Error('GeoJSON変換に失敗しました（featuresがありません）');

  return geojson;
}

function mergeGeojsonCollections(collections) {
  const features = collections.flatMap((c) => c?.features ?? []);
  return {
    type: 'FeatureCollection',
    features,
  };
}

async function loadShapefilesFromUrls(urls) {
  const results = await Promise.allSettled(
    urls.map((url) => loadShapefileFromUrl(url))
  );
  const success = results
    .filter((r) => r.status === 'fulfilled')
    .map((r) => r.value);
  if (!success.length) {
    const reasons = results
      .filter((r) => r.status === 'rejected')
      .map((r) => r.reason?.message || String(r.reason))
      .filter(Boolean);
    const msg = reasons.length
      ? `地図データの読み込みに失敗しました: ${reasons.join(' / ')}`
      : '地図データの読み込みに失敗しました';
    throw new Error(msg);
  }
  return mergeGeojsonCollections(success);
}

function loadCsvFromBuffer(buf) {
  const text = decodeArrayBufferSmart(buf);
  return parseCsvText(text);
}

function findHeaderRowIndex(lines) {
  const maxScan = Math.min(lines.length, 60);
  for (let i = 0; i < maxScan; i++) {
    const line = lines[i] || '';
    if (line.includes('市区町村コード') && line.includes('町丁字コード'))
      return i;
    if (line.includes('KEY_CODE')) return i;
  }
  return 0;
}

function parseCsvText(text) {
  const lines = text.split(/\r?\n/);
  const headerIdx = findHeaderRowIndex(lines);
  const sliced = lines.slice(headerIdx).join('\n');

  const parsed = Papa.parse(sliced, {
    header: true,
    skipEmptyLines: true,
    dynamicTyping: false,
  });

  const rows = (parsed.data || []).filter((r) => r && typeof r === 'object');

  // 先頭の「行番号列（4/5など）」を除去
  const cleaned = rows.map((r) => {
    const obj = { ...r };
    for (const k of Object.keys(obj)) {
      const nk = (k || '').trim();
      if (!nk) delete obj[k];
    }
    for (const k of Object.keys(obj)) {
      if (/^\d+$/.test(k)) delete obj[k];
    }
    if (obj[''] !== undefined) delete obj[''];
    return obj;
  });

  return cleaned;
}

function normalizeStationLabel(text) {
  if (!text) return '';
  return text
    .replace(/駅.*/g, '')
    .replace(/（.*?）/g, '')
    .replace(/\s+/g, '')
    .trim();
}

function parseStationDistance(raw) {
  if (!raw) return { stationName: '', distanceMeters: null };
  const stationName = normalizeStationLabel(raw);
  const match = raw.match(/([0-9,.]+)\s*(km|m)/i);
  if (!match) return { stationName, distanceMeters: null };
  const value = Number(match[1].replace(/,/g, ''));
  if (!Number.isFinite(value)) return { stationName, distanceMeters: null };
  const unit = match[2].toLowerCase();
  const distanceMeters = unit === 'km' ? value * 1000 : value;
  return { stationName, distanceMeters };
}

function hashStringToAngle(text) {
  let hash = 0;
  const str = text || '';
  for (let i = 0; i < str.length; i += 1) {
    hash = (hash << 5) - hash + str.charCodeAt(i);
    hash |= 0;
  }
  const normalized = Math.abs(hash % 360);
  return (normalized * Math.PI) / 180;
}

const GSI_ADDRESS_ENDPOINT =
  'https://msearch.gsi.go.jp/address-search/AddressSearch';
const GSI_CORS_PROXY = 'https://api.allorigins.win/raw?url=';

async function fetchGsiAddressSearch(address) {
  const baseUrl = `${GSI_ADDRESS_ENDPOINT}?q=${encodeURIComponent(address)}`;

  try {
    const res = await fetch(baseUrl);
    if (res.ok) return await res.json();
  } catch (error) {
    // CORSやネットワークエラー時はフォールバックを試す
  }

  const proxyUrl = `${GSI_CORS_PROXY}${encodeURIComponent(baseUrl)}`;
  const res = await fetch(proxyUrl);
  if (!res.ok) {
    throw new Error(`GSI検索に失敗: ${res.status}`);
  }
  return res.json();
}

function offsetLatLon({ lat, lon }, distanceMeters, angleRad) {
  if (!Number.isFinite(distanceMeters) || distanceMeters <= 0)
    return { lat, lon };
  const metersPerDegLat = 111320;
  const latRad = (lat * Math.PI) / 180;
  const metersPerDegLon = metersPerDegLat * Math.cos(latRad);
  const dLat = (distanceMeters * Math.cos(angleRad)) / metersPerDegLat;
  const dLon = (distanceMeters * Math.sin(angleRad)) / metersPerDegLon;
  return { lat: lat + dLat, lon: lon + dLon };
}

function lonLatToTile(lon, lat, zoom) {
  const n = 2 ** zoom;
  const x = ((lon + 180) / 360) * n;
  const rad = (lat * Math.PI) / 180;
  const y =
    ((1 - Math.log(Math.tan(rad) + 1 / Math.cos(rad)) / Math.PI) / 2) * n;
  return [x, y];
}

function tileToLonLat(x, y, zoom) {
  const n = 2 ** zoom;
  const lon = (x / n) * 360 - 180;
  const latRad = Math.atan(Math.sinh(Math.PI * (1 - (2 * y) / n)));
  const lat = (latRad * 180) / Math.PI;
  return [lon, lat];
}

function orientation(ax, ay, bx, by, cx, cy) {
  const val = (by - ay) * (cx - bx) - (bx - ax) * (cy - by);
  if (Math.abs(val) < 1e-10) return 0;
  return val > 0 ? 1 : 2;
}

function isPointOnSegment(ax, ay, bx, by, cx, cy) {
  return (
    cx <= Math.max(ax, bx) &&
    cx >= Math.min(ax, bx) &&
    cy <= Math.max(ay, by) &&
    cy >= Math.min(ay, by)
  );
}

function segmentsIntersect(ax, ay, bx, by, cx, cy, dx, dy) {
  const o1 = orientation(ax, ay, bx, by, cx, cy);
  const o2 = orientation(ax, ay, bx, by, dx, dy);
  const o3 = orientation(cx, cy, dx, dy, ax, ay);
  const o4 = orientation(cx, cy, dx, dy, bx, by);

  if (o1 !== o2 && o3 !== o4) return true;
  if (o1 === 0 && isPointOnSegment(ax, ay, bx, by, cx, cy)) return true;
  if (o2 === 0 && isPointOnSegment(ax, ay, bx, by, dx, dy)) return true;
  if (o3 === 0 && isPointOnSegment(cx, cy, dx, dy, ax, ay)) return true;
  if (o4 === 0 && isPointOnSegment(cx, cy, dx, dy, bx, by)) return true;

  return false;
}

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function buildCsvContent(rows, columns) {
  const csv = Papa.unparse(rows, { columns });
  return `\ufeff${csv}`;
}

function downloadCsv(content, filename) {
  const blob = new Blob([content], { type: 'text/csv;charset=utf-8;' });
  const url = URL.createObjectURL(blob);
  const link = document.createElement('a');
  link.href = url;
  link.download = filename;
  document.body.appendChild(link);
  link.click();
  link.remove();
  URL.revokeObjectURL(url);
}

function buildCompositeKeyFromRow(row, areaCodeLengths, shapeKeySet) {
  const lengths = areaCodeLengths?.length ? areaCodeLengths : null;

  // 1) KEY_CODEがあるならそれを優先
  const direct = normalizeKeyString(row.KEY_CODE ?? row['KEY_CODE']);
  if (direct) {
    if (!shapeKeySet) return direct;
    if (shapeKeySet.has(direct)) return direct;
    if (!lengths || direct.length <= 5) return direct;

    const city = direct.slice(0, 5);
    const area = direct.slice(5).replace(/[^0-9]/g, '');
    const areaTrimmed = area.replace(/^0+/, '');
    const candidates = new Set([direct]);

    if (area) {
      for (const len of lengths) {
        candidates.add(`${city}${area.padStart(len, '0')}`);
      }
    }
    if (areaTrimmed) {
      for (const len of lengths) {
        candidates.add(`${city}${areaTrimmed.padStart(len, '0')}`);
      }
    }

    for (const key of candidates) {
      if (shapeKeySet.has(key)) return key;
    }
    return direct;
  }

  // 2) 市区町村コード + 町丁字コード
  const city = normalizeKeyString(
    row['市区町村コード'] ?? row.CITY ?? row.city
  );
  const area = normalizeKeyString(
    row['町丁字コード'] ?? row.S_AREA ?? row.area
  );
  if (!city || !area || area === '-') return '';

  const city5 = city.padStart(5, '0');
  const areaNorm = area.replace(/[^0-9]/g, '');
  if (!areaNorm) return '';
  const areaTrimmed = areaNorm.replace(/^0+/, '');
  const baseKey = `${city5}${areaNorm}`;

  if (!lengths) return baseKey;

  const candidates = new Set([baseKey]);
  for (const len of lengths) {
    candidates.add(`${city5}${areaNorm.padStart(len, '0')}`);
  }
  if (areaTrimmed) {
    for (const len of lengths) {
      candidates.add(`${city5}${areaTrimmed.padStart(len, '0')}`);
    }
  }

  if (shapeKeySet) {
    for (const key of candidates) {
      if (shapeKeySet.has(key)) return key;
    }
  }

  return baseKey;
}

function uniq(arr) {
  return Array.from(new Set(arr));
}

function getCityCodesFromGeojson(geojson) {
  if (!geojson?.features?.length) return [];
  const codes = new Set();
  for (const feature of geojson.features) {
    const key = normalizeKeyString(feature?.properties?.KEY_CODE);
    if (key.length >= 5) codes.add(key.slice(0, 5));
  }
  return Array.from(codes);
}

function buildCityNameMap(geojson) {
  const map = new Map();
  if (!geojson?.features?.length) return map;
  for (const feature of geojson.features) {
    const key = normalizeKeyString(feature?.properties?.KEY_CODE);
    if (key.length < 5) continue;
    const code = key.slice(0, 5);
    const name = normalizeKeyString(feature?.properties?.CITY_NAME);
    if (name && !map.has(code)) map.set(code, name);
  }
  return map;
}

function buildCityCentroidMap(geojson) {
  const map = new Map();
  if (!geojson?.features?.length) return map;
  const buckets = new Map();
  for (const feature of geojson.features) {
    const code = getCityCodeFromFeature(feature);
    if (!code) continue;
    const centroid = geoCentroid(feature);
    if (
      !Array.isArray(centroid) ||
      centroid.length !== 2 ||
      !Number.isFinite(centroid[0]) ||
      !Number.isFinite(centroid[1])
    )
      continue;
    const list = buckets.get(code) || [];
    list.push(centroid);
    buckets.set(code, list);
  }
  for (const [code, list] of buckets.entries()) {
    if (!list.length) continue;
    const sum = list.reduce(
      (acc, [lon, lat]) => [acc[0] + lon, acc[1] + lat],
      [0, 0]
    );
    map.set(code, { lon: sum[0] / list.length, lat: sum[1] / list.length });
  }
  return map;
}

function getCityCodeFromFeature(feature) {
  const key = normalizeKeyString(feature?.properties?.KEY_CODE);
  return key.length >= 5 ? key.slice(0, 5) : '';
}

function getBoundaryCityCodes(feature) {
  if (!feature?.properties) return [];
  const props = feature.properties;
  const codes = new Set();
  const pushCode = (value) => {
    const v = normalizeKeyString(value);
    if (!v) return;
    const directMatch = v.match(/^\d{5}$/);
    if (directMatch) {
      codes.add(v);
      return;
    }
    const digits = v.match(/\d{5}/);
    if (digits) {
      codes.add(digits[0]);
    }
    if (CITY_NAME_TO_CODE[v]) {
      codes.add(CITY_NAME_TO_CODE[v]);
    }
  };

  const directFields = [
    'CITY_CODE',
    'city_code',
    'code',
    'CITY',
    'city',
    'CITY_CODE_L',
    'CITY_CODE_R',
    'CITY_CODE_1',
    'CITY_CODE_2',
    'CITY1',
    'CITY2',
    '市区町村コード',
    '市区町村ｺｰﾄﾞ',
  ];
  const nameFields = [
    'CITY_NAME',
    'city_name',
    'name',
    'CITY_NAME_L',
    'CITY_NAME_R',
    'CITY_NAME_1',
    'CITY_NAME_2',
    '市区町村名',
  ];

  for (const key of [...directFields, ...nameFields]) {
    if (props[key] !== undefined) pushCode(props[key]);
  }

  for (const value of Object.values(props)) {
    if (typeof value === 'string' || typeof value === 'number') {
      pushCode(value);
    }
  }

  return Array.from(codes);
}

async function loadGeoJsonFromUrl(url) {
  const res = await fetch(url);
  if (!res.ok) {
    throw new Error(`市境データの取得に失敗しました (${res.status}) - ${url}`);
  }
  const text = await res.text();
  if (!text.trim()) {
    throw new Error(`市境データが空です - ${url}`);
  }
  try {
    return JSON.parse(text);
  } catch (err) {
    throw new Error(
      `市境データのJSON解析に失敗しました (${url}): ${err?.message || err}`
    );
  }
}

async function loadCityBoundaryGeoJson() {
  return {
    url: CITY_BOUNDARY_GEOJSON_PATH,
    data: await loadGeoJsonFromUrl(
      resolvePublicUrl(CITY_BOUNDARY_GEOJSON_PATH)
    ),
  };
}

function buildRailGeoJson() {
  return {
    type: 'FeatureCollection',
    features: [
      ...RAIL_LINES.map((line) => ({
        type: 'Feature',
        properties: { id: line.id, color: line.color },
        geometry: {
          type: 'LineString',
          coordinates: line.stations.map((s) => [s.lon, s.lat]),
        },
      })),
      ...RAIL_CONNECTORS.map((c) => ({
        type: 'Feature',
        properties: { id: c.id, color: c.color },
        geometry: { type: 'LineString', coordinates: c.coordinates },
      })),
    ],
  };
}

function collectStations() {
  const out = [];
  for (const line of RAIL_LINES) {
    for (const s of line.stations)
      out.push({ ...s, lineId: line.id, color: line.color });
  }
  return out;
}

function HouseholdTree({ node, selectedKey, onSelect, availableColumns }) {
  const isAvailable = (k) => !availableColumns || availableColumns.has(k);

  if (!node) return null;
  const hasChildren = Array.isArray(node.children) && node.children.length > 0;

  if (!hasChildren) {
    const disabled = !isAvailable(node.key);
    return (
      <label
        style={{
          display: 'flex',
          gap: 8,
          alignItems: 'center',
          opacity: disabled ? 0.45 : 1,
          cursor: disabled ? 'not-allowed' : 'pointer',
          margin: '4px 0',
        }}
      >
        <input
          type="radio"
          name="householdMetric"
          checked={selectedKey === node.key}
          disabled={disabled}
          onChange={() => onSelect(node.key)}
        />
        <span>{node.label}</span>
      </label>
    );
  }

  return (
    <details open style={{ margin: '6px 0' }}>
      <summary style={{ cursor: 'pointer', userSelect: 'none' }}>
        {node.label}
      </summary>
      <div style={{ paddingLeft: 14 }}>
        {node.key && (
          <label
            style={{
              display: 'flex',
              gap: 8,
              alignItems: 'center',
              opacity: isAvailable(node.key) ? 1 : 0.45,
              cursor: isAvailable(node.key) ? 'pointer' : 'not-allowed',
              margin: '4px 0',
            }}
          >
            <input
              type="radio"
              name="householdMetric"
              checked={selectedKey === node.key}
              disabled={!isAvailable(node.key)}
              onChange={() => onSelect(node.key)}
            />
            <span>{node.label}（合計）</span>
          </label>
        )}
        {node.children.map((c) => (
          <HouseholdTree
            key={c.key}
            node={c}
            selectedKey={selectedKey}
            onSelect={onSelect}
            availableColumns={availableColumns}
          />
        ))}
      </div>
    </details>
  );
}

function Legend({ mode, min, max, midLabel, layout }) {
  const width = 220;
  const height = 12;
  const verticalHeight = 190;
  const verticalBarWidth = 16;
  const verticalTickWidth = 8;
  const verticalLabelGap = 6;
  const verticalLabelX = verticalBarWidth + verticalTickWidth + verticalLabelGap;
  const verticalWidth = verticalLabelX + 60;
  const verticalPadding = 8;
  const verticalUsableHeight = verticalHeight - verticalPadding * 2;

  const stops = useMemo(() => {
    const n = 16;
    const out = [];
    for (let i = 0; i <= n; i++) out.push(i / n);
    return out;
  }, []);

  const gradientId = `grad_${mode}`;

  const roundedMax = useMemo(() => {
    if (!Number.isFinite(max)) return max;
    if (max === 0) return 0;
    const absMax = Math.abs(max);
    const magnitude = 10 ** Math.floor(Math.log10(absMax));
    return Math.ceil(max / magnitude) * magnitude;
  }, [max]);

  const verticalTicks = useMemo(() => {
    if (layout !== 'vertical') return [];
    const safeMin = 0;
    const safeMax = Number.isFinite(roundedMax) ? roundedMax : 0;
    const span = safeMax - safeMin;
    const step = span === 0 ? 0 : span / 10;
    return Array.from({ length: 11 }, (_, i) => safeMin + step * i);
  }, [layout, roundedMax]);

  const getColor = (t) => {
    if (mode === 'population') return interpolateYlOrRd(t);
    if (mode === 'household') return interpolateGreens(t);
    if (mode === 'business') return interpolatePurples(t);
    if (mode === 'restaurant-analysis') return interpolateYlOrRd(t);
    // analysis (high=red, low=blue) -> legend では青→白→赤に見えるよう調整
    return interpolateRdBu(1 - t);
  };

  return (
    <div
      style={{
        position: 'absolute',
        right: 16,
        bottom: 16,
        background: 'rgba(255,255,255,0.92)',
        border: '1px solid rgba(0,0,0,0.08)',
        borderRadius: 12,
        padding: 12,
        width: 260,
        boxShadow: '0 8px 24px rgba(0,0,0,0.10)',
      }}
    >
      <div style={{ fontSize: 12, fontWeight: 700, marginBottom: 8 }}>
        凡例（
        {mode === 'population'
          ? '人口'
          : mode === 'household'
          ? '世帯'
          : mode === 'business'
          ? '事業所'
          : mode === 'restaurant-analysis'
          ? '飲食店分析'
          : '分析（特化係数）'}
        ）
      </div>
      {layout === 'vertical' ? (
        <svg
          width={verticalWidth}
          height={verticalHeight}
          style={{ display: 'block' }}
        >
          <defs>
            <linearGradient id={gradientId} x1="0" y1="1" x2="0" y2="0">
              {stops.map((t) => (
                <stop key={t} offset={`${t * 100}%`} stopColor={getColor(t)} />
              ))}
            </linearGradient>
          </defs>
          <rect
            x={0}
            y={verticalPadding}
            width={verticalBarWidth}
            height={verticalUsableHeight}
            fill={`url(#${gradientId})`}
            rx={6}
          />
          {verticalTicks.map((tick, index) => {
            const y =
              verticalHeight -
              verticalPadding -
              (index / (verticalTicks.length - 1)) * verticalUsableHeight;
            return (
              <g key={`tick-${index}`}>
                <line
                  x1={verticalBarWidth}
                  x2={verticalBarWidth + verticalTickWidth}
                  y1={y}
                  y2={y}
                  stroke="rgba(0,0,0,0.4)"
                  strokeWidth={1}
                />
                <text
                  x={verticalLabelX}
                  y={y}
                  fontSize={11}
                  dominantBaseline="middle"
                  fill="rgba(0,0,0,0.82)"
                >
                  {formatNumber(tick)}
                </text>
              </g>
            );
          })}
        </svg>
      ) : (
        <>
          <svg width={width} height={height} style={{ display: 'block' }}>
            <defs>
              <linearGradient id={gradientId} x1="0" y1="0" x2="1" y2="0">
                {stops.map((t) => (
                  <stop key={t} offset={`${t * 100}%`} stopColor={getColor(t)} />
                ))}
              </linearGradient>
            </defs>
            <rect
              x={0}
              y={0}
              width={width}
              height={height}
              fill={`url(#${gradientId})`}
              rx={6}
            />
          </svg>
          <div
            style={{
              display: 'flex',
              justifyContent: 'space-between',
              marginTop: 6,
              fontSize: 12,
            }}
          >
            <span>min: {formatNumber(min)}</span>
            {midLabel ? <span>{midLabel}</span> : <span />}
            <span>max: {formatNumber(max)}</span>
          </div>
        </>
      )}
      {mode === 'analysis' && (
        <div style={{ marginTop: 6, fontSize: 12, opacity: 0.8 }}>
          1.0 が市平均。&nbsp;赤=特化 / 青=非特化
        </div>
      )}
    </div>
  );
}

export default function App() {
  const [mode, setMode] = useState(DEFAULT_MODE);
  const [legendLayout, setLegendLayout] = useState('horizontal');

  // ファイル
  const [shapeGeo, setShapeGeo] = useState(null);
  const [shapeErr, setShapeErr] = useState('');
  const [boundaryGeo, setBoundaryGeo] = useState(null);
  const [boundaryErr, setBoundaryErr] = useState('');
  const [boundaryUrl, setBoundaryUrl] = useState('');

  const [popRows, setPopRows] = useState(null);
  const [popErr, setPopErr] = useState('');

  const [hhRows, setHhRows] = useState(null);
  const [hhErr, setHhErr] = useState('');

  const [bizRows, setBizRows] = useState(null);
  const [restaurantRows, setRestaurantRows] = useState(null);
  const [restaurantErr, setRestaurantErr] = useState('');
  const [restaurantGeoStatus, setRestaurantGeoStatus] = useState('');
  const [restaurantGeoProgress, setRestaurantGeoProgress] = useState({
    done: 0,
    total: 0,
  });
  const [restaurantGeoRunning, setRestaurantGeoRunning] = useState(false);
  const [dataLoading, setDataLoading] = useState(false);

  // UI状態
  const [panelOpen, setPanelOpen] = useState(true);
  const [showRail, setShowRail] = useState(true);
  const [railWidth, setRailWidth] = useState(2.4); // ★追加：線幅
  const [stationRadius, setStationRadius] = useState(5);
  const [restaurantRadius, setRestaurantRadius] = useState(4);
  const [showStationCatchment, setShowStationCatchment] = useState(false);
  const [boldCityBoundary, setBoldCityBoundary] = useState(false);
  const [showBaseMapLayer, setShowBaseMapLayer] = useState(true);
  const [scaleScope, setScaleScope] = useState('visible'); // visible | all

  // 人口
  const [sexSel, setSexSel] = useState({ 男: true, 女: true, 総数: false });
  const [ageSel, setAgeSel] = useState(new Set());

  // 世帯
  const [hhRowType, setHhRowType] = useState('総数');
  const [hhMetric, setHhMetric] = useState('総数');

  // 事業所
  const [bizMetric, setBizMetric] = useState('');

  // 分析（特化係数）
  const [analysisMetric, setAnalysisMetric] = useState('単独世帯');

  // 飲食店（評価フィルタ）
  const [ratingSel, setRatingSel] = useState(new Set());
  const [categorySel, setCategorySel] = useState(new Set());

  // 駅インジケーター
  const [stationIndicators, setStationIndicators] = useState({});
  const [draggingIndicator, setDraggingIndicator] = useState(null);

  // 乗降客数インジケーター
  const [ridershipIconSize, setRidershipIconSize] = useState(
    RIDERSHIP_ICON_DEFAULT_SIZE
  );
  const [ridershipIconAspect, setRidershipIconAspect] = useState(1);
  const [ridershipIndicatorOffsets, setRidershipIndicatorOffsets] = useState(
    {}
  );
  const [draggingRidershipIndicator, setDraggingRidershipIndicator] =
    useState(null);

  // Tooltip
  const [hover, setHover] = useState({
    visible: false,
    x: 0,
    y: 0,
    title: '',
    lines: [],
  });

  // SVG/Zoom
  const containerRef = useRef(null);
  const svgRef = useRef(null);
  const zoomRef = useRef(null);
  const [transform, setTransform] = useState(zoomIdentity);

  const { width, height } = useResizeObserver(containerRef);

  const railGeo = useMemo(() => buildRailGeoJson(), []);
  const stations = useMemo(() => collectStations(), []);
  const stationLookup = useMemo(() => {
    const map = new Map();
    for (const station of stations) {
      const key = normalizeStationLabel(station.name);
      if (key && !map.has(key)) map.set(key, station);
    }
    return map;
  }, [stations]);
  const activeCityCodes = useMemo(() => {
    const available = getCityCodesFromGeojson(shapeGeo);
    if (!available.length) return [];
    const availableSet = new Set(available);
    const filtered = TARGET_CITY_CODES.filter((code) =>
      availableSet.has(code)
    );
    return filtered.length ? filtered : available;
  }, [shapeGeo]);
  const [selectedCityCodes, setSelectedCityCodes] = useState([]);
  const cityNameMap = useMemo(() => buildCityNameMap(shapeGeo), [shapeGeo]);
  const cityCentroidMap = useMemo(
    () => buildCityCentroidMap(shapeGeo),
    [shapeGeo]
  );
  const activeCityNames = useMemo(
    () =>
      activeCityCodes.map(
        (code) => cityNameMap.get(code) || CITY_CODE_LABELS[code] || code
      ),
    [activeCityCodes, cityNameMap]
  );
  const selectedCityNames = useMemo(
    () =>
      selectedCityCodes.map(
        (code) => cityNameMap.get(code) || CITY_CODE_LABELS[code] || code
      ),
    [selectedCityCodes, cityNameMap]
  );
  useEffect(() => {
    if (!activeCityCodes.length) return;
    setSelectedCityCodes((prev) => {
      if (!prev.length) return activeCityCodes;
      const availableSet = new Set(activeCityCodes);
      const filtered = prev.filter((code) => availableSet.has(code));
      return filtered.length ? filtered : activeCityCodes;
    });
  }, [activeCityCodes]);
  const displayShapeGeo = useMemo(() => {
    if (!shapeGeo?.features?.length) return shapeGeo;
    if (!selectedCityCodes.length) return shapeGeo;
    const set = new Set(selectedCityCodes);
    const features = shapeGeo.features.filter((f) => {
      const key = normalizeKeyString(f?.properties?.KEY_CODE);
      if (key.length < 5) return false;
      return set.has(key.slice(0, 5));
    });
    return { ...shapeGeo, features };
  }, [shapeGeo, selectedCityCodes]);
  const areaCodeLengths = useMemo(
    () => getAreaCodeLengths(displayShapeGeo),
    [displayShapeGeo]
  );
  const areaCodeLengthsAll = useMemo(
    () => getAreaCodeLengths(shapeGeo),
    [shapeGeo]
  );
  const shapeKeySet = useMemo(() => {
    if (!displayShapeGeo?.features?.length) return null;
    return new Set(
      displayShapeGeo.features
        .map((f) => normalizeKeyString(f?.properties?.KEY_CODE))
        .filter(Boolean)
    );
  }, [displayShapeGeo]);
  const shapeKeySetAll = useMemo(() => {
    if (!shapeGeo?.features?.length) return null;
    return new Set(
      displayShapeGeo.features
        .map((f) => normalizeKeyString(f?.properties?.KEY_CODE))
        .filter(Boolean)
    );
  }, [displayShapeGeo]);

  // --- Initial data load ---
  useEffect(() => {
    let active = true;

    const fetchBuffer = async (url) => {
      const res = await fetch(url);
      if (!res.ok) {
        throw new Error(
          `データ取得に失敗しました (${res.status}) - ${url}`
        );
      }
      return res.arrayBuffer();
    };

    const load = async () => {
      setDataLoading(true);
      setShapeErr('');
      setPopErr('');
      setHhErr('');
      setRestaurantErr('');
      setRestaurantGeoStatus('');
      setRestaurantGeoProgress({ done: 0, total: 0 });
      setRestaurantGeoRunning(false);
      setBoundaryErr('');
      setShapeGeo(null);
      setBoundaryGeo(null);
      setBoundaryUrl('');
      setPopRows(null);
      setHhRows(null);
      setRestaurantRows(null);

      const loadShape = async () => {
        if (DEFAULT_DATA_FILES.shapeBases?.length) {
          return loadShapefilesFromUrls(DEFAULT_DATA_FILES.shapeBases);
        }
        throw new Error('地図データのパスが指定されていません');
      };

      const loadRestaurantCsv = async (primaryUrl, fallbackUrl) => {
        try {
          return await fetchBuffer(primaryUrl);
        } catch (primaryError) {
          if (!fallbackUrl) throw primaryError;
          return fetchBuffer(fallbackUrl);
        }
      };

      const [
        shapeRes,
        popRes,
        hhRes,
        restaurantSuitaRes,
        restaurantToyonakaRes,
        boundaryRes,
      ] = await Promise.allSettled([
        loadShape(),
        fetchBuffer(DEFAULT_DATA_FILES.populationCsv),
        fetchBuffer(DEFAULT_DATA_FILES.householdCsv),
        loadRestaurantCsv(
          DEFAULT_DATA_FILES.restaurantSuitaGeoCsv,
          DEFAULT_DATA_FILES.restaurantSuitaCsv
        ),
        loadRestaurantCsv(
          DEFAULT_DATA_FILES.restaurantToyonakaGeoCsv,
          DEFAULT_DATA_FILES.restaurantToyonakaCsv
        ),
        loadCityBoundaryGeoJson(),
      ]);

      if (!active) return;

      if (shapeRes.status === 'fulfilled') {
        try {
          const geojson = shapeRes.value;
          if (!active) return;
          setShapeGeo(geojson);
        } catch (e) {
          if (!active) return;
          setShapeErr(e?.message || String(e));
        }
      } else {
        setShapeErr(shapeRes.reason?.message || String(shapeRes.reason));
      }

      if (boundaryRes.status === 'fulfilled') {
        try {
          const { data, url } = boundaryRes.value || {};
          if (!active) return;
          setBoundaryGeo(data);
          setBoundaryUrl(url || '');
        } catch (e) {
          if (!active) return;
          setBoundaryErr(e?.message || String(e));
        }
      } else {
        setBoundaryErr(
          boundaryRes.reason?.message || String(boundaryRes.reason)
        );
      }

      if (popRes.status === 'fulfilled') {
        try {
          const rows = loadCsvFromBuffer(popRes.value);
          if (!active) return;
          setPopRows(rows);
        } catch (e) {
          if (!active) return;
          setPopErr(e?.message || String(e));
        }
      } else {
        setPopErr(popRes.reason?.message || String(popRes.reason));
      }

      if (hhRes.status === 'fulfilled') {
        try {
          const rows = loadCsvFromBuffer(hhRes.value);
          if (!active) return;
          setHhRows(rows);
        } catch (e) {
          if (!active) return;
          setHhErr(e?.message || String(e));
        }
      } else {
        setHhErr(hhRes.reason?.message || String(hhRes.reason));
      }

      const restaurantErrors = [];
      const restaurantRowsCombined = [];
      const restaurantSources = [
        { res: restaurantSuitaRes, source: '吹田市' },
        { res: restaurantToyonakaRes, source: '豊中市' },
      ];
      for (const { res, source } of restaurantSources) {
        if (res.status === 'fulfilled') {
          try {
            const rows = loadCsvFromBuffer(res.value).map((row) => ({
              ...row,
              読み込み元: source,
            }));
            restaurantRowsCombined.push(...rows);
          } catch (e) {
            restaurantErrors.push(e?.message || String(e));
          }
        } else {
          restaurantErrors.push(res.reason?.message || String(res.reason));
        }
      }
      if (restaurantRowsCombined.length) {
        if (!active) return;
        setRestaurantRows(restaurantRowsCombined);
      }
      if (restaurantErrors.length) {
        if (!active) return;
        setRestaurantErr(restaurantErrors.join(' / '));
      }

      if (active) setDataLoading(false);
    };

    load();

    return () => {
      active = false;
    };
  }, []);

  // --- Derived: columns/options ---
  const popAgeColumns = useMemo(() => {
    if (!popRows?.length) return [];
    const keys = Object.keys(popRows[0] || {});
    return keys
      .filter(
        (k) =>
          typeof k === 'string' &&
          k.includes('歳') &&
          /\d/.test(k) &&
          !k.includes('（再掲）')
      )
      .filter((k) => !['総年齢', '平均年齢'].includes(k));
  }, [popRows]);

  const popSexOptions = useMemo(() => {
    if (!popRows?.length) return [];
    const v = uniq(popRows.map((r) => normalizeKeyString(r['男女'])));
    return v.filter(Boolean);
  }, [popRows]);

  const householdRowTypeOptions = useMemo(() => {
    if (!hhRows?.length) return [];
    const v = uniq(
      hhRows.map((r) => normalizeKeyString(r['世帯員の年齢による世帯の種類']))
    );
    return v.filter(Boolean);
  }, [hhRows]);

  const householdAvailableColumns = useMemo(() => {
    if (!hhRows?.length) return null;
    return new Set(Object.keys(hhRows[0] || {}));
  }, [hhRows]);

  // ★追加：特化係数の分子候補を「列として存在するものだけ」に絞り込み（なければハードコード全表示）
  const analysisMetricOptions = useMemo(() => {
    const base = ANALYSIS_METRIC_OPTIONS;
    if (!householdAvailableColumns) return base;
    const filtered = base.filter((k) => householdAvailableColumns.has(k));
    return filtered.length ? filtered : base;
  }, [householdAvailableColumns]);

  const ratingRanges = useMemo(() => buildRatingRanges(), []);
  const ratingOptions = useMemo(
    () => [
      ...ratingRanges,
      { key: 'none', label: '評価なし', min: null, max: null },
    ],
    [ratingRanges]
  );
  const restaurantCategoryOptions = useMemo(() => {
    if (!restaurantRows?.length) return [];
    const counts = new Map();
    let noneCount = 0;
    for (const row of restaurantRows) {
      const categories = splitRestaurantCategories(
        row['店のカテゴリ(キーワード)']
      );
      if (!categories.length) {
        noneCount += 1;
        continue;
      }
      for (const category of categories) {
        counts.set(category, (counts.get(category) ?? 0) + 1);
      }
    }
    const sorted = Array.from(counts.entries())
      .sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0], 'ja'))
      .map(([name, count]) => ({
        key: name,
        label: name,
        count,
      }));
    if (noneCount > 0) {
      sorted.push({
        key: CATEGORY_NONE_KEY,
        label: CATEGORY_NONE_LABEL,
        count: noneCount,
      });
    }
    return sorted;
  }, [restaurantRows]);

  useEffect(() => {
    if (!analysisMetricOptions.length) return;
    if (analysisMetricOptions.includes(analysisMetric)) return;
    setAnalysisMetric(analysisMetricOptions[0]);
  }, [analysisMetricOptions, analysisMetric]);

  useEffect(() => {
    if (!ratingOptions.length) return;
    if (ratingSel.size) return;
    setRatingSel(new Set(ratingOptions.map((opt) => opt.key)));
  }, [ratingOptions, ratingSel.size]);
  useEffect(() => {
    if (!restaurantCategoryOptions.length) return;
    if (categorySel.size) return;
    setCategorySel(
      new Set(restaurantCategoryOptions.map((opt) => opt.key))
    );
  }, [restaurantCategoryOptions, categorySel.size]);

  const businessNumericColumns = useMemo(() => {
    if (!bizRows?.length) return [];
    const sample = bizRows.slice(0, 30);
    const keys = Object.keys(bizRows[0] || {});
    const candidates = keys.filter((k) => {
      if (!k) return false;
      if (k.includes('コード') || k.toUpperCase().includes('CODE'))
        return false;
      let ok = 0;
      let seen = 0;
      for (const r of sample) {
        const n = safeToNumber(r[k]);
        if (n === null) continue;
        seen++;
        ok++;
        if (seen >= 5) break;
      }
      return ok >= 3;
    });
    return candidates;
  }, [bizRows]);

  // 初期選択（人口：年齢は全選択 / 事業所：最初の候補）
  useEffect(() => {
    if (popAgeColumns.length && ageSel.size === 0)
      setAgeSel(new Set(popAgeColumns));
  }, [popAgeColumns, ageSel.size]);

  useEffect(() => {
    if (businessNumericColumns.length && !bizMetric)
      setBizMetric(businessNumericColumns[0]);
  }, [businessNumericColumns, bizMetric]);

  // --- Compute projection/path ---
  const projection = useMemo(() => {
    if (!displayShapeGeo || !width || !height) return null;

    const pad = 16;
    const w = Math.max(10, width - pad * 2);
    const h = Math.max(10, height - pad * 2);

    const p = geoMercator().fitSize([w, h], displayShapeGeo);

    const t = p.translate();
    p.translate([t[0] + pad, t[1] + pad]);

    return p;
  }, [displayShapeGeo, width, height]);

  const pathGen = useMemo(() => {
    if (!projection) return null;
    return geoPath(projection);
  }, [projection]);

  // --- Zoom setup ---
  useEffect(() => {
    if (!svgRef.current) return;

    const svg = select(svgRef.current);
    const z = zoom()
      .scaleExtent([1, 18])
      .on('zoom', (event) => setTransform(event.transform));

    svg.call(z);
    zoomRef.current = z;

    setTransform(zoomIdentity);
  }, [displayShapeGeo, width, height]);

  useEffect(() => {
    if (!draggingIndicator) return undefined;
    const handleMove = (e) => {
      setStationIndicators((prev) => {
        const current = prev[draggingIndicator.id];
        if (!current) return prev;
        const dx = e.clientX - draggingIndicator.startX;
        const dy = e.clientY - draggingIndicator.startY;
        return {
          ...prev,
          [draggingIndicator.id]: {
            ...current,
            offsetX: draggingIndicator.originX + dx,
            offsetY: draggingIndicator.originY + dy,
          },
        };
      });
    };
    const handleUp = () => setDraggingIndicator(null);
    window.addEventListener('mousemove', handleMove);
    window.addEventListener('mouseup', handleUp);
    return () => {
      window.removeEventListener('mousemove', handleMove);
      window.removeEventListener('mouseup', handleUp);
    };
  }, [draggingIndicator]);

  useEffect(() => {
    if (!draggingRidershipIndicator) return undefined;
    const handleMove = (e) => {
      setRidershipIndicatorOffsets((prev) => {
        const current = prev[draggingRidershipIndicator.id] || {
          offsetX: 12,
          offsetY: -12,
        };
        const dx = e.clientX - draggingRidershipIndicator.startX;
        const dy = e.clientY - draggingRidershipIndicator.startY;
        return {
          ...prev,
          [draggingRidershipIndicator.id]: {
            ...current,
            offsetX: draggingRidershipIndicator.originX + dx,
            offsetY: draggingRidershipIndicator.originY + dy,
          },
        };
      });
    };
    const handleUp = () => setDraggingRidershipIndicator(null);
    window.addEventListener('mousemove', handleMove);
    window.addEventListener('mouseup', handleUp);
    return () => {
      window.removeEventListener('mousemove', handleMove);
      window.removeEventListener('mouseup', handleUp);
    };
  }, [draggingRidershipIndicator]);

  const zoomIn = () => {
    if (!svgRef.current || !zoomRef.current) return;
    select(svgRef.current).call(zoomRef.current.scaleBy, 1.25);
  };
  const zoomOut = () => {
    if (!svgRef.current || !zoomRef.current) return;
    select(svgRef.current).call(zoomRef.current.scaleBy, 0.8);
  };
  const resetView = () => {
    if (!svgRef.current || !zoomRef.current) return;
    select(svgRef.current).call(zoomRef.current.transform, zoomIdentity);
  };

  const buildFeatureValue = ({
    targetCodes,
    areaLengths,
    keySet,
  }) => {
    const map = new Map();
    const pushValue = (key, val) => {
      if (!key) return;
      map.set(key, val);
    };

    if (
      mode === 'restaurant' ||
      mode === 'restaurant-analysis' ||
      mode === 'ridership'
    )
      return map;

    const targetCityCodes = targetCodes?.length
      ? new Set(targetCodes)
      : null;
    const isTargetCity = (key) => {
      if (!targetCityCodes) return true;
      if (!key || key.length < 5) return false;
      return targetCityCodes.has(key.slice(0, 5));
    };

    if (mode === 'population') {
      if (!popRows?.length) return map;

      const byKey = new Map();
      for (const r of popRows) {
        const key = buildCompositeKeyFromRow(r, areaLengths, keySet);
        if (!key) continue;
        if (!isTargetCity(key)) continue;

        const sex = normalizeKeyString(r['男女']);
        if (!sex) continue;

        const entry = byKey.get(key) || {};
        entry[sex] = r;
        byKey.set(key, entry);
      }

      for (const [key, entry] of byKey.entries()) {
        let total = 0;
        let hasAny = false;

        for (const sex of Object.keys(sexSel)) {
          if (!sexSel[sex]) continue;
          const row = entry[sex];
          if (!row) continue;

          for (const col of ageSel) {
            const v = safeToNumber(row[col]);
            if (v === null) continue;
            total += v;
            hasAny = true;
          }
        }

        pushValue(key, hasAny ? total : null);
      }

      return map;
    }

    if (mode === 'household') {
      if (!hhRows?.length) return map;

      for (const r of hhRows) {
        const key = buildCompositeKeyFromRow(r, areaLengths, keySet);
        if (!key) continue;
        if (!isTargetCity(key)) continue;

        const rowType = normalizeKeyString(r['世帯員の年齢による世帯の種類']);
        if (rowType !== hhRowType) continue;

        const v = safeToNumber(r[hhMetric]);
        pushValue(key, v);
      }
      return map;
    }

    if (mode === 'business') {
      if (!bizRows?.length || !bizMetric) return map;

      for (const r of bizRows) {
        const key = buildCompositeKeyFromRow(r, areaLengths, keySet);
        if (!key) continue;
        if (!isTargetCity(key)) continue;

        const v = safeToNumber(r[bizMetric]);
        if (v === null) continue;
        map.set(key, (map.get(key) ?? 0) + v);
      }
      return map;
    }

    // analysis
    if (!hhRows?.length) return map;

    let cityNumer = 0;
    let cityDenom = 0;
    const temp = [];

    for (const r of hhRows) {
      const key = buildCompositeKeyFromRow(r, areaLengths, keySet);
      if (!key) continue;
      if (!isTargetCity(key)) continue;

      const rowType = normalizeKeyString(r['世帯員の年齢による世帯の種類']);
      if (rowType !== hhRowType) continue;

      const numer = safeToNumber(r[analysisMetric]);
      const denom = safeToNumber(r['総数']);
      if (numer === null || denom === null || denom === 0) continue;

      cityNumer += numer;
      cityDenom += denom;
      temp.push({ key, numer, denom });
    }

    const cityRatio = cityDenom ? cityNumer / cityDenom : null;
    if (!cityRatio || cityRatio === 0) return map;

    for (const { key, numer, denom } of temp) {
      const localRatio = numer / denom;
      const coef = localRatio / cityRatio;
      map.set(key, coef);
    }

    return map;
  };

  // --- Data join / values per feature ---
  const featureValue = useMemo(() => {
    if (!displayShapeGeo?.features?.length) return new Map();
    return buildFeatureValue({
      targetCodes: selectedCityCodes,
      areaLengths: areaCodeLengths,
      keySet: shapeKeySet,
    });
  }, [
    mode,
    displayShapeGeo,
    selectedCityCodes,
    areaCodeLengths,
    shapeKeySet,
    popRows,
    hhRows,
    bizRows,
    sexSel,
    ageSel,
    hhRowType,
    hhMetric,
    bizMetric,
    analysisMetric,
  ]);

  const featureValueAll = useMemo(() => {
    if (!shapeGeo?.features?.length) return new Map();
    return buildFeatureValue({
      targetCodes: activeCityCodes,
      areaLengths: areaCodeLengthsAll,
      keySet: shapeKeySetAll,
    });
  }, [
    mode,
    shapeGeo,
    activeCityCodes,
    areaCodeLengthsAll,
    shapeKeySetAll,
    popRows,
    hhRows,
    bizRows,
    sexSel,
    ageSel,
    hhRowType,
    hhMetric,
    bizMetric,
    analysisMetric,
  ]);


  // --- Render helpers ---
  const onFeatureEnter = (e, f) => {
    const k = normalizeKeyString(f?.properties?.KEY_CODE);
    const name =
      normalizeKeyString(f?.properties?.S_NAME_JA) ||
      normalizeKeyString(f?.properties?.S_NAME) ||
      '(名称不明)';
    const v = featureValue.get(k);

    setHover({
      visible: true,
      x: e.clientX,
      y: e.clientY,
      title: name,
      lines: [`KEY_CODE: ${k}`, `値: ${formatNumber(v)}`],
    });
  };

  const onFeatureMove = (e) => {
    setHover((h) => ({ ...h, x: e.clientX, y: e.clientY }));
  };

  const onFeatureLeave = () => {
    setHover((h) => ({ ...h, visible: false }));
  };

  const railPaths = useMemo(() => {
    if (!pathGen) return [];
    const features = railGeo.features || [];
    return features.map((f) => ({
      id: f.properties?.id,
      color: f.properties?.color,
      d: pathGen(f),
    }));
  }, [railGeo, pathGen]);

  const cityBoundaryFeatures = useMemo(() => {
    if (!boundaryGeo?.features?.length) return [];
    const targetCodes = selectedCityCodes.length
      ? selectedCityCodes
      : activeCityCodes;
    if (!targetCodes.length) return [];
    const selectedSet = new Set(targetCodes);
    return boundaryGeo.features.filter((feature) => {
      const codes = getBoundaryCityCodes(feature);
      if (!codes.length) return false;
      return codes.some((code) => selectedSet.has(code));
    });
  }, [boundaryGeo, selectedCityCodes, activeCityCodes]);

  const stationPoints = useMemo(() => {
    if (!projection) return [];
    return stations
      .map((s) => {
        const pt = projection([s.lon, s.lat]);
        if (!pt) return null;
        return { ...s, x: pt[0], y: pt[1] };
      })
      .filter(Boolean);
  }, [stations, projection]);

  const stationCatchmentCircles = useMemo(() => {
    if (!projection) return [];
    return stations
      .map((s) => {
        const center = projection([s.lon, s.lat]);
        if (!center) return null;
        const offset = offsetLatLon(
          { lat: s.lat, lon: s.lon },
          STATION_CATCHMENT_METERS,
          Math.PI / 2
        );
        const edge = projection([offset.lon, offset.lat]);
        if (!edge) return null;
        const radius = Math.hypot(edge[0] - center[0], edge[1] - center[1]);
        return { id: s.id, name: s.name, x: center[0], y: center[1], radius };
      })
      .filter(Boolean);
  }, [stations, projection]);

  const stationScreenPoints = useMemo(
    () =>
      stationPoints.map((s) => ({
        ...s,
        screenX: s.x * transform.k + transform.x,
        screenY: s.y * transform.k + transform.y,
      })),
    [stationPoints, transform]
  );

  const stationScreenLookup = useMemo(
    () =>
      new Map(
        stationScreenPoints.map((s) => [
          s.id,
          { x: s.screenX, y: s.screenY, name: s.name },
        ])
      ),
    [stationScreenPoints]
  );
  // 乗降客数アイコンは /data/人員.png を参照（画像は外部で差し替え可能）
  const ridershipIconUrl = useMemo(
    () => resolvePublicUrl('data/人員.png'),
    []
  );
  const ridershipIconWidth = useMemo(
    () => ridershipIconSize * ridershipIconAspect,
    [ridershipIconAspect, ridershipIconSize]
  );

  useEffect(() => {
    const img = new Image();
    img.onload = () => {
      if (img.naturalHeight > 0) {
        setRidershipIconAspect(img.naturalWidth / img.naturalHeight);
      }
    };
    img.src = ridershipIconUrl;
    return () => {
      img.onload = null;
    };
  }, [ridershipIconUrl]);

  const restaurantPoints = useMemo(() => {
    if (!restaurantRows?.length || !projection) return [];
    const points = [];
    for (const row of restaurantRows) {
      const name = normalizeKeyString(row['店の名前']);
      if (!name) continue;
      const address = normalizeKeyString(row['住所']);
      const ratingValue = safeToNumber(row['評価']);
      const ratingKey = getRatingRangeKey(ratingValue);
      if (ratingSel.size && !ratingSel.has(ratingKey)) continue;
      const categories = splitRestaurantCategories(
        row['店のカテゴリ(キーワード)']
      );
      const categoryKeys = categories.length
        ? categories
        : [CATEGORY_NONE_KEY];
      const categoryLabels = categories.length
        ? categories
        : [CATEGORY_NONE_LABEL];
      if (
        categorySel.size &&
        !categoryKeys.some((key) => categorySel.has(key))
      ) {
        continue;
      }
      const latValue = safeToNumber(row['緯度']);
      const lonValue = safeToNumber(row['経度']);
      let cityCode = '';
      for (const [cityName, code] of Object.entries(CITY_NAME_TO_CODE)) {
        if (address.includes(cityName)) {
          cityCode = code;
          break;
        }
      }
      if (
        selectedCityCodes.length &&
        cityCode &&
        !selectedCityCodes.includes(cityCode)
      ) {
        continue;
      }
      const { stationName, distanceMeters } = parseStationDistance(
        row['駅からの距離']
      );
      const station = stationLookup.get(stationName);
      let coord = null;
      let hint = '';
      if (latValue !== null && lonValue !== null) {
        coord = { lat: latValue, lon: lonValue };
        hint = '住所ジオコーディング';
      } else if (station) {
        const angle = hashStringToAngle(`${name}-${address}`);
        const base = { lat: station.lat, lon: station.lon };
        coord = offsetLatLon(base, distanceMeters ?? 0, angle);
        hint = `${station.name}${distanceMeters ? ` 約${distanceMeters}m` : ''}`;
      } else if (cityCode && cityCentroidMap.has(cityCode)) {
        coord = cityCentroidMap.get(cityCode);
        hint = '市域中心（推定）';
      }

      if (!coord) continue;
      const projected = projection([coord.lon, coord.lat]);
      if (!projected) continue;

      points.push({
        id: `${name}-${address}`,
        name,
        x: projected[0],
        y: projected[1],
        lat: coord.lat,
        lon: coord.lon,
        cityCode,
        category: row['店のカテゴリ(キーワード)'],
        categories: categoryLabels,
        description: row['紹介文'],
        rating: row['評価'],
        ratingValue,
        comments: row['コメント数'],
        bookmarks: row['ブックマーク数'],
        budgetNight: row['夜の予算'],
        budgetLunch: row['昼の予算'],
        address,
        hint,
      });
    }
    return points;
  }, [
    restaurantRows,
    projection,
    stationLookup,
    cityCentroidMap,
    selectedCityCodes,
    ratingSel,
    categorySel,
  ]);

  const restaurantGeoPoints = useMemo(() => {
    if (!restaurantRows?.length) return [];
    const points = [];
    for (const row of restaurantRows) {
      const latValue = safeToNumber(row['緯度']);
      const lonValue = safeToNumber(row['経度']);
      if (latValue === null || lonValue === null) continue;
      const address = normalizeKeyString(row['住所']);
      let cityCode = '';
      for (const [cityName, code] of Object.entries(CITY_NAME_TO_CODE)) {
        if (address.includes(cityName)) {
          cityCode = code;
          break;
        }
      }
      if (
        selectedCityCodes.length &&
        cityCode &&
        !selectedCityCodes.includes(cityCode)
      ) {
        continue;
      }
      points.push({
        id: row['店舗ID'] || row['店の名前'] || `${latValue}-${lonValue}`,
        lat: latValue,
        lon: lonValue,
        cityCode,
      });
    }
    return points;
  }, [restaurantRows, selectedCityCodes]);

  const stationStats = useMemo(() => {
    const statsMap = new Map();
    if (!stations.length || !restaurantPoints.length) return statsMap;
    for (const station of stations) {
      let count = 0;
      let commentTotal = 0;
      let bookmarkTotal = 0;
      const categories = new Map();
      const nightBudgets = [];
      const lunchBudgets = [];

      for (const point of restaurantPoints) {
        if (!Number.isFinite(point.lat) || !Number.isFinite(point.lon)) continue;
        const distance = haversineMeters(
          station.lat,
          station.lon,
          point.lat,
          point.lon
        );
        if (distance > STATION_CATCHMENT_METERS) continue;
        count += 1;

        const comments = safeToNumber(point.comments);
        if (comments !== null) commentTotal += comments;
        const bookmarks = safeToNumber(point.bookmarks);
        if (bookmarks !== null) bookmarkTotal += bookmarks;

        const nightBudget = parseBudgetValue(point.budgetNight);
        if (nightBudget !== null) nightBudgets.push(nightBudget);
        const lunchBudget = parseBudgetValue(point.budgetLunch);
        if (lunchBudget !== null) lunchBudgets.push(lunchBudget);

        const categoryList = Array.isArray(point.categories)
          ? point.categories
          : splitRestaurantCategories(point.category);
        if (categoryList.length) {
          categoryList.forEach((c) => {
            categories.set(c, (categories.get(c) ?? 0) + 1);
          });
        }
      }

      const topCategories = Array.from(categories.entries())
        .sort((a, b) => b[1] - a[1])
        .slice(0, 5)
        .map(([name, countValue]) => ({ name, count: countValue }));

      const average = (vals) =>
        vals.length
          ? vals.reduce((sum, v) => sum + v, 0) / vals.length
          : null;

      statsMap.set(station.id, {
        count,
        topCategories,
        commentTotal,
        bookmarkTotal,
        avgNightBudget: average(nightBudgets),
        avgLunchBudget: average(lunchBudgets),
      });
    }
    return statsMap;
  }, [stations, restaurantPoints]);

  const stationSummaryRows = useMemo(() => {
    if (!stations.length) return [];
    const toCsvNumber = (value) => {
      if (value === null || value === undefined || value === '') return '';
      const num = Number(value);
      if (!Number.isFinite(num)) return '';
      return num.toLocaleString('ja-JP', { maximumFractionDigits: 4 });
    };
    return stations.map((station) => {
      const stats = stationStats.get(station.id);
      const topCategories = stats?.topCategories ?? [];
      return {
        駅名: station.name,
        乗降客数: toCsvNumber(RIDERSHIP_BY_STATION_ID[station.id]),
        '500m圏内の飲食店数': toCsvNumber(stats?.count ?? 0),
        頻出カテゴリ1位: topCategories[0]?.name ?? '',
        頻出カテゴリ2位: topCategories[1]?.name ?? '',
        頻出カテゴリ3位: topCategories[2]?.name ?? '',
        頻出カテゴリ4位: topCategories[3]?.name ?? '',
        頻出カテゴリ5位: topCategories[4]?.name ?? '',
        コメント合計: toCsvNumber(stats?.commentTotal ?? 0),
        ブックマーク合計: toCsvNumber(stats?.bookmarkTotal ?? 0),
        平均昼予算: toCsvNumber(stats?.avgLunchBudget ?? null),
        平均夜予算: toCsvNumber(stats?.avgNightBudget ?? null),
      };
    });
  }, [stations, stationStats]);

  const restaurantGrid = useMemo(() => {
    if (mode !== 'restaurant-analysis') return [];
    if (!projection) return [];
    if (!restaurantGeoPoints.length) return [];
    if (!cityBoundaryFeatures.length) return [];

    const boundaryCollection = {
      type: 'FeatureCollection',
      features: cityBoundaryFeatures,
    };
    const bounds = geoBounds(boundaryCollection);
    if (
      !bounds ||
      !Number.isFinite(bounds[0][0]) ||
      !Number.isFinite(bounds[0][1]) ||
      !Number.isFinite(bounds[1][0]) ||
      !Number.isFinite(bounds[1][1])
    ) {
      return [];
    }

    const [[minLon, minLat], [maxLon, maxLat]] = bounds;
    const center = geoCentroid(boundaryCollection);
    const centerLat = center?.[1] ?? 0;
    const metersPerDegLat = 111320;
    const latStep = RESTAURANT_GRID_SIZE_METERS / metersPerDegLat;
    const metersPerDegLon =
      metersPerDegLat * Math.cos((centerLat * Math.PI) / 180);
    const lonStep =
      RESTAURANT_GRID_SIZE_METERS / (metersPerDegLon || metersPerDegLat);

    const countMap = new Map();
    for (const point of restaurantGeoPoints) {
      if (
        point.lon < minLon ||
        point.lon > maxLon ||
        point.lat < minLat ||
        point.lat > maxLat
      ) {
        continue;
      }
      const xIndex = Math.floor((point.lon - minLon) / lonStep);
      const yIndex = Math.floor((point.lat - minLat) / latStep);
      if (xIndex < 0 || yIndex < 0) continue;
      const key = `${xIndex}_${yIndex}`;
      countMap.set(key, (countMap.get(key) ?? 0) + 1);
    }

    const grid = [];
    const maxX = Math.ceil((maxLon - minLon) / lonStep);
    const maxY = Math.ceil((maxLat - minLat) / latStep);

    for (let y = 0; y <= maxY; y += 1) {
      const lat = minLat + y * latStep;
      for (let x = 0; x <= maxX; x += 1) {
        const lon = minLon + x * lonStep;
        const p0 = projection([lon, lat]);
        const p1 = projection([lon + lonStep, lat + latStep]);
        if (!p0 || !p1) continue;

        const rect = {
          minX: Math.min(p0[0], p1[0]),
          maxX: Math.max(p0[0], p1[0]),
          minY: Math.min(p0[1], p1[1]),
          maxY: Math.max(p0[1], p1[1]),
        };

        const key = `${x}_${y}`;
        const count = countMap.get(key) ?? 0;
        grid.push({
          id: `grid-${x}-${y}`,
          x: rect.minX,
          y: rect.minY,
          width: rect.maxX - rect.minX,
          height: rect.maxY - rect.minY,
          count,
        });
      }
    }
    return grid;
  }, [
    mode,
    projection,
    restaurantGeoPoints,
    cityBoundaryFeatures,
  ]);

  // --- Stats + color scale ---
  const valueStats = useMemo(() => {
    if (mode === 'restaurant' || mode === 'ridership')
      return { min: 0, max: 1, mid: null };
    if (mode === 'restaurant-analysis') {
      if (!restaurantGrid.length) return { min: 0, max: 1, mid: null };
      const counts = restaurantGrid.map((cell) => cell.count);
      const [mn, mx] = extent(counts);
      return { min: mn ?? 0, max: mx ?? 1, mid: null };
    }
    const scopeGeo =
      scaleScope === 'all' ? shapeGeo : displayShapeGeo;
    const scopeValues =
      scaleScope === 'all' ? featureValueAll : featureValue;

    if (!scopeGeo?.features?.length)
      return { min: 0, max: 1, mid: null };

    const vals = [];
    for (const f of scopeGeo.features) {
      const k = normalizeKeyString(f?.properties?.KEY_CODE);
      const v = scopeValues.get(k);
      if (v === null || v === undefined || Number.isNaN(v)) continue;
      vals.push(Number(v));
    }
    if (!vals.length) return { min: 0, max: 1, mid: null };

    const [mn, mx] = extent(vals);

    if (mode === 'analysis') return { min: mn ?? 0, max: mx ?? 1, mid: 1.0 };
    return { min: mn ?? 0, max: mx ?? 1, mid: null };
  }, [
    mode,
    displayShapeGeo,
    shapeGeo,
    featureValue,
    featureValueAll,
    scaleScope,
    restaurantGrid,
  ]);

  const colorForValue = useMemo(() => {
    if (mode === 'restaurant' || mode === 'ridership') {
      return () => '#f4f4f4';
    }
    if (mode === 'restaurant-analysis') {
      const { min, max } = valueStats;
      const mx = Number.isFinite(max) ? max : 1;
      const safeMax = mx > 0 ? mx : 1;
      return (v) => {
        if (!Number.isFinite(v) || v <= 0) return '#ffffff';
        const t = Math.min(v / safeMax, 1);
        return interpolateYlOrRd(t);
      };
    }
    const { min, max } = valueStats;

    if (mode === 'analysis') {
      const mx = Math.max(1.0, max || 1.0);
      const mn = Math.min(1.0, min || 1.0);
      const s = scaleDiverging(interpolateRdBu).domain([mx, 1.0, mn]);
      return (v) => s(v);
    }

    const seq =
      mode === 'population'
        ? scaleSequential(interpolateYlOrRd)
        : mode === 'household'
        ? scaleSequential(interpolateGreens)
        : scaleSequential(interpolatePurples);

    const mn = Number.isFinite(min) ? min : 0;
    const mx = Number.isFinite(max) ? max : 1;
    seq.domain([mn, mx || 1]);

    return (v) => seq(v);
  }, [mode, valueStats]);

  const cityLabel = useMemo(() => {
    if (!selectedCityNames.length) return '';
    return `（${selectedCityNames.join('・')}）`;
  }, [selectedCityNames]);

  const winW = typeof window !== 'undefined' ? window.innerWidth : 1200;
  const winH = typeof window !== 'undefined' ? window.innerHeight : 800;
  const isRestaurantLikeMode =
    mode === 'restaurant' || mode === 'restaurant-analysis';
  const isBaseMapToggleMode = mode === 'restaurant' || mode === 'ridership';
  const showPlainBaseMapLayer = isBaseMapToggleMode && showBaseMapLayer;
  const baseMapTiles = useMemo(() => {
    if (!showPlainBaseMapLayer || !projection || !width || !height) return [];

    const scale = projection.scale() * transform.k;
    const zoomLevel = Math.round(
      Math.log2((scale * 2 * Math.PI) / TILE_SIZE)
    );
    const z = Math.min(18, Math.max(10, zoomLevel));
    const maxTileIndex = 2 ** z - 1;

    const minX = (0 - transform.x) / transform.k;
    const minY = (0 - transform.y) / transform.k;
    const maxX = (width - transform.x) / transform.k;
    const maxY = (height - transform.y) / transform.k;

    const nw = projection.invert([minX, minY]);
    const se = projection.invert([maxX, maxY]);
    if (!nw || !se) return [];

    const [x1, y1] = lonLatToTile(nw[0], nw[1], z);
    const [x2, y2] = lonLatToTile(se[0], se[1], z);
    const minTileX = Math.max(0, Math.floor(Math.min(x1, x2)));
    const maxTileX = Math.min(maxTileIndex, Math.floor(Math.max(x1, x2)));
    const minTileY = Math.max(0, Math.floor(Math.min(y1, y2)));
    const maxTileY = Math.min(maxTileIndex, Math.floor(Math.max(y1, y2)));

    const tiles = [];
    for (let x = minTileX; x <= maxTileX; x += 1) {
      for (let y = minTileY; y <= maxTileY; y += 1) {
        const [lon1, lat1] = tileToLonLat(x, y, z);
        const [lon2, lat2] = tileToLonLat(x + 1, y + 1, z);
        const topLeft = projection([lon1, lat1]);
        const bottomRight = projection([lon2, lat2]);
        if (!topLeft || !bottomRight) continue;
        tiles.push({
          id: `${z}-${x}-${y}`,
          x: topLeft[0],
          y: topLeft[1],
          width: bottomRight[0] - topLeft[0],
          height: bottomRight[1] - topLeft[1],
          url: `https://tile.openstreetmap.org/${z}/${x}/${y}.png`,
        });
      }
    }
    return tiles;
  }, [
    showPlainBaseMapLayer,
    projection,
    width,
    height,
    transform.k,
    transform.x,
    transform.y,
  ]);

  const handleRestaurantGeocode = async () => {
    if (!restaurantRows?.length || restaurantGeoRunning) return;
    setRestaurantGeoRunning(true);
    setRestaurantGeoStatus('住所の緯度経度を取得中...');
    setRestaurantGeoProgress({ done: 0, total: restaurantRows.length });

    const rows = restaurantRows.map((row) => ({ ...row }));
    const baseColumns = Object.keys(rows[0] || {}).filter(
      (key) => key && key !== '読み込み元'
    );
    const columns = [
      ...baseColumns.filter((key) => key !== '緯度' && key !== '経度'),
      '緯度',
      '経度',
    ];

    const errors = [];

    for (let i = 0; i < rows.length; i += 1) {
      const row = rows[i];
      const address = normalizeKeyString(row['住所']);
      if (!address) {
        row['緯度'] = '';
        row['経度'] = '';
        continue;
      }

      try {
        const data = await fetchGsiAddressSearch(address);
        if (Array.isArray(data) && data.length > 0) {
          const coords = data[0]?.geometry?.coordinates;
          if (Array.isArray(coords) && coords.length >= 2) {
            row['経度'] = coords[0];
            row['緯度'] = coords[1];
          } else {
            row['緯度'] = '';
            row['経度'] = '';
          }
        } else {
          row['緯度'] = '';
          row['経度'] = '';
        }
      } catch (error) {
        row['緯度'] = '';
        row['経度'] = '';
        errors.push(`${address}: ${error?.message || String(error)}`);
      }

      if ((i + 1) % 20 === 0 || i === rows.length - 1) {
        setRestaurantGeoProgress({ done: i + 1, total: rows.length });
      }
      await sleep(150);
    }

    const exportRows = (subset) =>
      subset.map((row) => {
        const output = {};
        for (const column of columns) {
          output[column] = row[column] ?? '';
        }
        return output;
      });

    const suitaRows = rows.filter((row) => row['読み込み元'] === '吹田市');
    const toyonakaRows = rows.filter((row) => row['読み込み元'] === '豊中市');

    if (suitaRows.length) {
      const content = buildCsvContent(exportRows(suitaRows), columns);
      downloadCsv(content, '飲食店_吹田_緯度経度付き.csv');
    }
    if (toyonakaRows.length) {
      const content = buildCsvContent(exportRows(toyonakaRows), columns);
      downloadCsv(content, '飲食店_豊中_緯度経度付き.csv');
    }

    setRestaurantGeoRunning(false);
    setRestaurantGeoStatus(
      errors.length
        ? `取得完了（エラー ${errors.length}件）`
        : '取得完了'
    );
  };

  const handleStationSummaryDownload = () => {
    if (!stationSummaryRows.length) return;
    const columns = [
      '駅名',
      '乗降客数',
      '500m圏内の飲食店数',
      '頻出カテゴリ1位',
      '頻出カテゴリ2位',
      '頻出カテゴリ3位',
      '頻出カテゴリ4位',
      '頻出カテゴリ5位',
      'コメント合計',
      'ブックマーク合計',
      '平均昼予算',
      '平均夜予算',
    ];
    const content = buildCsvContent(stationSummaryRows, columns);
    downloadCsv(content, '駅_500m圏内_飲食店集計.csv');
  };

  return (
    <div
      style={{
        position: 'fixed',
        inset: 0,
        background: '#fff',
        fontFamily: 'ui-sans-serif, system-ui',
      }}
    >
      <div ref={containerRef} style={{ position: 'absolute', inset: 0 }}>
        {/* Map */}
        <svg
          ref={svgRef}
          width={width}
          height={height}
          style={{ display: 'block', cursor: 'grab' }}
        >
          <rect x={0} y={0} width={width} height={height} fill="#fff" />

          {!displayShapeGeo || !pathGen ? (
            <text x={24} y={40} fontSize={14} fill="#333">
              同梱データを読み込み中です。しばらくお待ちください。
            </text>
          ) : (
            <g
              transform={`translate(${transform.x},${transform.y}) scale(${transform.k})`}
            >
              {showPlainBaseMapLayer && baseMapTiles.length ? (
                <g>
                  {baseMapTiles.map((tile) => (
                    <image
                      key={tile.id}
                      href={tile.url}
                      x={tile.x}
                      y={tile.y}
                      width={tile.width}
                      height={tile.height}
                      opacity={0.95}
                      preserveAspectRatio="none"
                      style={{ pointerEvents: 'none' }}
                    />
                  ))}
                </g>
              ) : null}

              {mode === 'restaurant-analysis' && restaurantGrid.length ? (
                <g>
                  {restaurantGrid.map((cell) => (
                    <rect
                      key={cell.id}
                      x={cell.x}
                      y={cell.y}
                      width={cell.width}
                      height={cell.height}
                      fill={colorForValue(cell.count)}
                      fillOpacity={0.85}
                      onMouseEnter={(e) => {
                        setHover({
                          visible: true,
                          x: e.clientX,
                          y: e.clientY,
                          title: '飲食店分析（250m格子）',
                          lines: [
                            `飲食店数: ${formatNumber(cell.count)}`,
                          ],
                        });
                      }}
                      onMouseMove={onFeatureMove}
                      onMouseLeave={onFeatureLeave}
                    />
                  ))}
                </g>
              ) : null}

              {/* Choropleth polygons */}
              {(!isBaseMapToggleMode || showPlainBaseMapLayer) &&
                displayShapeGeo.features.map((f, idx) => {
                  const k = normalizeKeyString(f?.properties?.KEY_CODE);
                  const v = featureValue.get(k);
                  const hasV =
                    v !== null && v !== undefined && !Number.isNaN(v);
                  const fill =
                    mode === 'restaurant-analysis'
                      ? 'transparent'
                      : showPlainBaseMapLayer
                      ? 'transparent'
                      : isRestaurantLikeMode
                      ? '#f4f4f4'
                      : hasV
                      ? colorForValue(Number(v))
                      : '#f2f2f2';

                  return (
                    <path
                      key={`${k}_${idx}`}
                      d={pathGen(f)}
                      fill={fill}
                      stroke={
                        boldCityBoundary
                          ? 'rgba(0,0,0,0.18)'
                          : 'rgba(0,0,0,0.35)'
                      }
                      strokeWidth={0.6 / transform.k}
                      onMouseEnter={
                        isRestaurantLikeMode
                          ? undefined
                          : (e) => onFeatureEnter(e, f)
                      }
                      onMouseMove={
                        isRestaurantLikeMode ? undefined : onFeatureMove
                      }
                      onMouseLeave={
                        isRestaurantLikeMode ? undefined : onFeatureLeave
                      }
                    />
                  );
                })}

              {boldCityBoundary && cityBoundaryFeatures.length
                ? cityBoundaryFeatures.map((feature, idx) => (
                    <path
                      key={`city-boundary-${idx}`}
                      d={pathGen(feature)}
                      fill="none"
                      stroke="rgba(0,0,0,0.75)"
                      strokeWidth={1.6 / transform.k}
                      strokeLinejoin="round"
                    />
                  ))
                : null}

              {mode === 'restaurant' && restaurantPoints.length ? (
                <g>
                  {restaurantPoints.map((p) => (
                    <circle
                      key={p.id}
                      cx={p.x}
                      cy={p.y}
                      r={restaurantRadius / transform.k}
                      fill="#e53935"
                      fillOpacity={0.7}
                      stroke="rgba(0,0,0,0.35)"
                      strokeWidth={0.6 / transform.k}
                      onMouseEnter={(e) => {
                        setHover({
                          visible: true,
                          x: e.clientX,
                          y: e.clientY,
                          title: p.name,
                          lines: [
                            p.category ? `カテゴリ: ${p.category}` : null,
                            p.rating ? `評価: ${p.rating}` : null,
                            p.comments ? `コメント数: ${p.comments}` : null,
                            p.bookmarks ? `ブックマーク: ${p.bookmarks}` : null,
                            p.budgetNight ? `夜予算: ${p.budgetNight}` : null,
                            p.budgetLunch ? `昼予算: ${p.budgetLunch}` : null,
                            p.address ? `住所: ${p.address}` : null,
                            p.hint ? `位置推定: ${p.hint}` : null,
                          ].filter(Boolean),
                        });
                      }}
                      onMouseMove={onFeatureMove}
                      onMouseLeave={onFeatureLeave}
                    />
                  ))}
                </g>
              ) : null}

              {showStationCatchment && stationCatchmentCircles.length ? (
                <g>
                  {stationCatchmentCircles.map((circle) => (
                    <circle
                      key={`catchment-${circle.id}`}
                      cx={circle.x}
                      cy={circle.y}
                      r={circle.radius}
                      fill="rgba(255,82,82,0.12)"
                      stroke="rgba(255,82,82,0.65)"
                      strokeWidth={1 / transform.k}
                      cursor="pointer"
                      onClick={() => {
                        setStationIndicators((prev) => {
                          const current = prev[circle.id];
                          const nextVisible = !current?.visible;
                          const base = current || { offsetX: 18, offsetY: -18 };
                          return {
                            ...prev,
                            [circle.id]: {
                              ...base,
                              visible: nextVisible,
                            },
                          };
                        });
                      }}
                    />
                  ))}
                </g>
              ) : null}

              {/* Rail overlay */}
              {showRail && (
                <>
                  {railPaths.map((p) => (
                    <path
                      key={p.id}
                      d={p.d}
                      fill="none"
                      stroke={p.color}
                      strokeWidth={railWidth / transform.k} // ★線幅調整
                      strokeLinecap="round"
                      strokeLinejoin="round"
                      opacity={0.9}
                    />
                  ))}

                  {/* Stations */}
                  {stationPoints.map((s) => (
                    <g key={s.id}>
                      <circle
                        cx={s.x}
                        cy={s.y}
                        r={stationRadius / transform.k}
                        fill="#fff"
                        stroke={s.color}
                        strokeWidth={2 / transform.k}
                      />
                    </g>
                  ))}
                </>
              )}

              {/* Station labels (topmost) */}
              {showRail && mode !== 'ridership'
                ? stationPoints.map((s) => (
                    <text
                      key={`station-label-${s.id}`}
                      x={s.x}
                      y={s.y - (stationRadius + 4) / transform.k}
                      fontSize={12 / transform.k}
                      textAnchor="middle"
                      fill="#111"
                      stroke="#fff"
                      strokeWidth={3 / transform.k}
                      paintOrder="stroke"
                    >
                      {s.name}
                    </text>
                  ))
                : null}
            </g>
          )}
        </svg>

        {mode === 'ridership' && showRail ? (
          <div
            style={{
              position: 'absolute',
              left: 0,
              top: 0,
              width: '100%',
              height: '100%',
              pointerEvents: 'none',
            }}
          >
            {stationScreenPoints.map((station) => {
              const ridership = RIDERSHIP_BY_STATION_ID[station.id];
              const iconParts = buildRidershipIconFragments(ridership ?? 0);
              const offset = ridershipIndicatorOffsets[station.id] || {
                offsetX: 12,
                offsetY: -12,
              };
              return (
                <div
                  key={`ridership-${station.id}`}
                  style={{
                    position: 'absolute',
                    left: station.screenX + offset.offsetX,
                    top: station.screenY + offset.offsetY,
                    transform: 'translateY(-100%)',
                    background: '#fff',
                    borderRadius: 10,
                    border: '1px solid rgba(0,0,0,0.15)',
                    padding: '8px 10px',
                    boxShadow: '0 6px 16px rgba(0,0,0,0.12)',
                    minWidth: 140,
                    width: 'fit-content',
                    fontSize: 12,
                    lineHeight: 1.4,
                    pointerEvents: 'auto',
                  }}
                >
                  <div
                    style={{
                      display: 'flex',
                      justifyContent: 'space-between',
                      alignItems: 'center',
                      fontWeight: 800,
                      cursor: 'move',
                    }}
                    onMouseDown={(e) => {
                      e.preventDefault();
                      e.stopPropagation();
                      setDraggingRidershipIndicator({
                        id: station.id,
                        startX: e.clientX,
                        startY: e.clientY,
                        originX: offset.offsetX,
                        originY: offset.offsetY,
                      });
                    }}
                  >
                    <span>{station.name}</span>
                  </div>
                  <div style={{ marginTop: 4, fontWeight: 700 }}>
                    乗降客数: {formatNumber(ridership)}
                  </div>
                  <div
                    style={{
                      marginTop: 6,
                      display: 'flex',
                      flexWrap: 'wrap',
                      gap: RIDERSHIP_ICON_GAP,
                      width:
                        ridershipIconWidth * RIDERSHIP_ICON_ROW_COUNT +
                        RIDERSHIP_ICON_GAP * (RIDERSHIP_ICON_ROW_COUNT - 1),
                    }}
                  >
                    {iconParts.length ? (
                      iconParts.map((part, index) => (
                        <div
                          key={`${station.id}-icon-${index}`}
                          style={{
                            width: ridershipIconWidth * part.fraction,
                            height: ridershipIconSize,
                            overflow: 'hidden',
                          }}
                        >
                          <img
                            src={ridershipIconUrl}
                            alt=""
                            style={{
                              width: ridershipIconWidth,
                              height: ridershipIconSize,
                              display: 'block',
                              objectFit: 'contain',
                            }}
                          />
                        </div>
                      ))
                    ) : (
                      <div style={{ opacity: 0.6 }}>データなし</div>
                    )}
                  </div>
                </div>
              );
            })}
          </div>
        ) : null}

        {showStationCatchment && Object.keys(stationIndicators).length ? (
          <div
            style={{
              position: 'absolute',
              left: 0,
              top: 0,
              width: '100%',
              height: '100%',
              pointerEvents: 'none',
            }}
          >
            {Object.entries(stationIndicators).map(([id, info]) => {
              if (!info?.visible) return null;
              const stationPos = stationScreenLookup.get(id);
              if (!stationPos) return null;
              const stats = stationStats.get(id);
              const topCategoryLabel = stats?.topCategories?.length
                ? stats.topCategories
                    .map((c) => `${c.name} (${c.count})`)
                    .join(' / ')
                : '—';
              return (
                <div
                  key={`indicator-${id}`}
                  style={{
                    position: 'absolute',
                    left: stationPos.x + info.offsetX,
                    top: stationPos.y + info.offsetY,
                    width: 260,
                    background: 'rgba(255,255,255,0.95)',
                    borderRadius: 12,
                    border: '1px solid rgba(0,0,0,0.12)',
                    boxShadow: '0 8px 20px rgba(0,0,0,0.15)',
                    fontSize: 12,
                    pointerEvents: 'auto',
                  }}
                >
                  <div
                    style={{
                      display: 'flex',
                      justifyContent: 'space-between',
                      alignItems: 'center',
                      padding: '8px 10px',
                      borderBottom: '1px solid rgba(0,0,0,0.08)',
                      cursor: 'move',
                      fontWeight: 800,
                    }}
                    onMouseDown={(e) => {
                      e.preventDefault();
                      e.stopPropagation();
                      setDraggingIndicator({
                        id,
                        startX: e.clientX,
                        startY: e.clientY,
                        originX: info.offsetX,
                        originY: info.offsetY,
                      });
                    }}
                  >
                    <span>{stationPos.name}</span>
                    <button
                      type="button"
                      style={{
                        border: 'none',
                        background: 'transparent',
                        cursor: 'pointer',
                        fontWeight: 700,
                      }}
                      onClick={(e) => {
                        e.stopPropagation();
                        setStationIndicators((prev) => ({
                          ...prev,
                          [id]: { ...prev[id], visible: false },
                        }));
                      }}
                    >
                      ×
                    </button>
                  </div>
                  <div style={{ padding: '8px 10px' }}>
                    <div>飲食店数: {formatNumber(stats?.count ?? 0)}</div>
                    <div>頻出カテゴリ上位5: {topCategoryLabel}</div>
                    <div>
                      コメント合計: {formatNumber(stats?.commentTotal ?? 0)}
                    </div>
                    <div>
                      ブックマーク合計: {formatNumber(stats?.bookmarkTotal ?? 0)}
                    </div>
                    <div>
                      平均昼予算:{' '}
                      {stats?.avgLunchBudget !== null &&
                      stats?.avgLunchBudget !== undefined
                        ? `￥${formatNumber(stats.avgLunchBudget)}`
                        : '—'}
                    </div>
                    <div>
                      平均夜予算:{' '}
                      {stats?.avgNightBudget !== null &&
                      stats?.avgNightBudget !== undefined
                        ? `￥${formatNumber(stats.avgNightBudget)}`
                        : '—'}
                    </div>
                  </div>
                </div>
              );
            })}
          </div>
        ) : null}

        {/* Tooltip */}
        {hover.visible && (
          <div
            style={{
              position: 'fixed',
              left: clamp(hover.x + 12, 12, winW - 320),
              top: clamp(hover.y + 12, 12, winH - 160),
              width: 300,
              background: 'rgba(0,0,0,0.78)',
              color: '#fff',
              borderRadius: 10,
              padding: 10,
              fontSize: 12,
              pointerEvents: 'none',
            }}
          >
            <div style={{ fontWeight: 800, marginBottom: 6 }}>
              {hover.title}
            </div>
            {hover.lines.map((l, i) => (
              <div key={i} style={{ opacity: 0.95 }}>
                {l}
              </div>
            ))}
          </div>
        )}

        {/* Controls */}
        <div
          style={{
            position: 'absolute',
            left: 16,
            top: 16,
            display: 'flex',
            gap: 8,
            background: 'rgba(255,255,255,0.9)',
            border: '1px solid rgba(0,0,0,0.08)',
            borderRadius: 12,
            padding: 10,
            boxShadow: '0 8px 24px rgba(0,0,0,0.10)',
            alignItems: 'center',
          }}
        >
          <div style={{ fontWeight: 800, fontSize: 12 }}>
            北摂統計データ可視化 {cityLabel}
          </div>
          <div
            style={{ width: 1, height: 20, background: 'rgba(0,0,0,0.12)' }}
          />
          <button onClick={zoomIn} style={btnStyle}>
            ＋
          </button>
          <button onClick={zoomOut} style={btnStyle}>
            －
          </button>
          <button onClick={resetView} style={btnStyle}>
            リセット
          </button>
        </div>

        {/* Panel */}
        <div
          style={{
            position: 'absolute',
            left: 16,
            bottom: 16,
            width: panelOpen ? 420 : 160,
            maxHeight: '70vh',
            overflow: 'hidden',
            background: 'rgba(255,255,255,0.92)',
            border: '1px solid rgba(0,0,0,0.08)',
            borderRadius: 14,
            boxShadow: '0 8px 24px rgba(0,0,0,0.10)',
          }}
        >
          <div
            style={{
              display: 'flex',
              justifyContent: 'space-between',
              alignItems: 'center',
              padding: 12,
              borderBottom: '1px solid rgba(0,0,0,0.08)',
            }}
          >
            <div style={{ fontWeight: 800, fontSize: 13 }}>
              コントロールパネル
            </div>
            <button onClick={() => setPanelOpen((v) => !v)} style={btnStyle}>
              {panelOpen ? '閉じる' : '開く'}
            </button>
          </div>

          {panelOpen && (
            <div
              style={{
                padding: 12,
                overflow: 'auto',
                maxHeight: 'calc(70vh - 56px)',
              }}
            >
              {/* Mode tabs */}
              <div
                style={{
                  display: 'grid',
                  gridTemplateColumns: 'repeat(7, 1fr)',
                  gap: 6,
                  marginBottom: 12,
                }}
              >
                <ModeBtn
                  label="人口"
                  active={mode === 'population'}
                  onClick={() => setMode('population')}
                />
                <ModeBtn
                  label="世帯"
                  active={mode === 'household'}
                  onClick={() => setMode('household')}
                />
                <ModeBtn
                  label="事業所"
                  active={mode === 'business'}
                  onClick={() => setMode('business')}
                />
                <ModeBtn
                  label="分析"
                  active={mode === 'analysis'}
                  onClick={() => setMode('analysis')}
                />
                <ModeBtn
                  label="飲食店"
                  active={mode === 'restaurant'}
                  onClick={() => setMode('restaurant')}
                />
                <ModeBtn
                  label="飲食店分析"
                  active={mode === 'restaurant-analysis'}
                  onClick={() => setMode('restaurant-analysis')}
                />
                <ModeBtn
                  label="乗降客数"
                  active={mode === 'ridership'}
                  onClick={() => setMode('ridership')}
                />
              </div>

              {/* Built-in data */}
              <Section title="同梱データ（初期ロード）">
                <div style={{ fontSize: 12, opacity: 0.8 }}>
                  /data フォルダ内のファイルを自動で読み込みます。
                </div>
                <ul style={{ margin: '6px 0 0 18px', fontSize: 12 }}>
                  <li>地図境界:</li>
                  {MAP_SOURCES.map((source) => (
                    <li key={source.code} style={{ marginLeft: 8 }}>
                      {source.label}: /{source.path}.shp/.dbf/.prj/.shx/.cpg
                    </li>
                  ))}
                  <li>
                    市境:
                    {boundaryUrl ? ` /${boundaryUrl}` : ' (読み込み中)'}
                  </li>
                  <li>人口: h03_27(茨木_人口).csv</li>
                  <li>世帯: h06_01_27(茨木_世帯).csv</li>
                  <li>
                    飲食店: 飲食店_吹田_緯度経度付き.csv / 飲食店_豊中_緯度経度付き.csv
                  </li>
                </ul>
                {selectedCityCodes.length ? (
                  <div style={{ marginTop: 8, fontSize: 12, opacity: 0.8 }}>
                    対象市区町村コード: {selectedCityCodes.join(' / ')}
                  </div>
                ) : null}
                {dataLoading ? (
                  <div style={{ marginTop: 8, fontSize: 12 }}>
                    読み込み中...
                  </div>
                ) : null}
                {shapeErr ? <ErrBox text={shapeErr} /> : null}
                {boundaryErr ? <ErrBox text={boundaryErr} /> : null}
                {popErr ? <ErrBox text={popErr} /> : null}
                {hhErr ? <ErrBox text={hhErr} /> : null}
                {restaurantErr ? <ErrBox text={restaurantErr} /> : null}
              </Section>

              <Section title="表示設定">
                <label
                  style={{ display: 'flex', gap: 10, alignItems: 'center' }}
                >
                  <input
                    type="checkbox"
                    checked={boldCityBoundary}
                    onChange={(e) => setBoldCityBoundary(e.target.checked)}
                  />
                  <span>市境を濃く表示</span>
                </label>
                {isBaseMapToggleMode && (
                  <label
                    style={{
                      display: 'flex',
                      gap: 10,
                      alignItems: 'center',
                      marginTop: 6,
                    }}
                  >
                    <input
                      type="checkbox"
                      checked={showBaseMapLayer}
                      onChange={(e) => setShowBaseMapLayer(e.target.checked)}
                    />
                    <span>普通の地図を最下層に表示</span>
                  </label>
                )}

                <div style={{ marginTop: 10 }}>
                  <div
                    style={{ fontSize: 12, fontWeight: 700, marginBottom: 6 }}
                  >
                    スケール範囲
                  </div>
                  <select
                    value={scaleScope}
                    onChange={(e) => setScaleScope(e.target.value)}
                    style={selectStyle}
                  >
                    <option value="visible">表示中の範囲に合わせる</option>
                    <option value="all">全市区町村の最大に合わせる</option>
                  </select>
                </div>

                <div style={{ marginTop: 10 }}>
                  <div
                    style={{ fontSize: 12, fontWeight: 700, marginBottom: 6 }}
                  >
                    凡例の表示方法
                  </div>
                  <select
                    value={legendLayout}
                    onChange={(e) => setLegendLayout(e.target.value)}
                    style={selectStyle}
                  >
                    <option value="horizontal">従来（横）</option>
                    <option value="vertical">縦表示</option>
                  </select>
                </div>
              </Section>

              <Section title="表示する市区町村">
                {activeCityCodes.length ? (
                  activeCityCodes.map((code) => {
                    const label =
                      cityNameMap.get(code) || CITY_CODE_LABELS[code] || code;
                    const checked = selectedCityCodes.includes(code);
                    return (
                      <label
                        key={code}
                        style={{
                          display: 'flex',
                          gap: 8,
                          alignItems: 'center',
                          margin: '4px 0',
                        }}
                      >
                        <input
                          type="checkbox"
                          checked={checked}
                          onChange={(e) => {
                            setSelectedCityCodes((prev) => {
                              const set = new Set(prev);
                              if (e.target.checked) set.add(code);
                              else set.delete(code);
                              return Array.from(set);
                            });
                          }}
                        />
                        <span>
                          {label}（{code}）
                        </span>
                      </label>
                    );
                  })
                ) : (
                  <div style={{ fontSize: 12, opacity: 0.75 }}>
                    地図データ読み込み後に選択肢が表示されます。
                  </div>
                )}
              </Section>

              {/* Rail overlay */}
              <Section title="鉄道オーバーレイ">
                <label
                  style={{ display: 'flex', gap: 10, alignItems: 'center' }}
                >
                  <input
                    type="checkbox"
                    checked={showRail}
                    onChange={(e) => setShowRail(e.target.checked)}
                  />
                  <span>路線・駅を表示</span>
                </label>

                <label
                  style={{
                    display: 'flex',
                    gap: 10,
                    alignItems: 'center',
                    marginTop: 8,
                  }}
                >
                  <input
                    type="checkbox"
                    checked={showStationCatchment}
                    onChange={(e) => setShowStationCatchment(e.target.checked)}
                  />
                  <span>駅500m圏を表示</span>
                </label>

                {/* ★追加：線の太さ */}
                <div style={{ marginTop: 10 }}>
                  <div
                    style={{ fontSize: 12, fontWeight: 700, marginBottom: 6 }}
                  >
                    線の太さ
                  </div>
                  <input
                    type="range"
                    min={0.8}
                    max={8}
                    step={0.2}
                    value={railWidth}
                    onChange={(e) => setRailWidth(Number(e.target.value))}
                    style={{ width: '100%' }}
                  />
                  <div style={{ fontSize: 12, opacity: 0.8, marginTop: 4 }}>
                    現在: {railWidth.toFixed(1)}px
                  </div>
                </div>

                <div style={{ marginTop: 10 }}>
                  <div
                    style={{ fontSize: 12, fontWeight: 700, marginBottom: 6 }}
                  >
                    駅マーカーサイズ
                  </div>
                  <input
                    type="range"
                    min={2}
                    max={14}
                    step={1}
                    value={stationRadius}
                    onChange={(e) => setStationRadius(Number(e.target.value))}
                    style={{ width: '100%' }}
                  />
                  <div style={{ fontSize: 12, opacity: 0.8, marginTop: 4 }}>
                    現在: {stationRadius}px
                  </div>
                </div>

                <div style={{ marginTop: 10 }}>
                  <div
                    style={{ fontSize: 12, fontWeight: 700, marginBottom: 6 }}
                  >
                    乗降客数アイコンサイズ
                  </div>
                  <input
                    type="range"
                    min={8}
                    max={40}
                    step={1}
                    value={ridershipIconSize}
                    onChange={(e) =>
                      setRidershipIconSize(Number(e.target.value))
                    }
                    style={{ width: '100%' }}
                  />
                  <div style={{ fontSize: 12, opacity: 0.8, marginTop: 4 }}>
                    現在: {ridershipIconSize}px
                  </div>
                </div>
              </Section>

              {/* Mode-specific controls */}
              {mode === 'population' && (
                <Section title="人口モード（性別×年齢の合算）">
                  {!popRows ? (
                    <div style={{ fontSize: 12, opacity: 0.75 }}>
                      人口データが読み込まれると選択肢が表示されます。
                    </div>
                  ) : (
                    <>
                      <div
                        style={{
                          fontSize: 12,
                          fontWeight: 800,
                          marginBottom: 6,
                        }}
                      >
                        性別
                      </div>
                      <div
                        style={{ display: 'flex', flexWrap: 'wrap', gap: 10 }}
                      >
                        {popSexOptions.map((sx) => (
                          <label
                            key={sx}
                            style={{
                              display: 'flex',
                              gap: 8,
                              alignItems: 'center',
                            }}
                          >
                            <input
                              type="checkbox"
                              checked={!!sexSel[sx]}
                              onChange={(e) =>
                                setSexSel((p) => ({
                                  ...p,
                                  [sx]: e.target.checked,
                                }))
                              }
                            />
                            <span>{sx}</span>
                          </label>
                        ))}
                      </div>

                      <div
                        style={{
                          marginTop: 10,
                          display: 'flex',
                          justifyContent: 'space-between',
                          alignItems: 'center',
                        }}
                      >
                        <div style={{ fontSize: 12, fontWeight: 800 }}>
                          年齢階級
                        </div>
                        <div style={{ display: 'flex', gap: 8 }}>
                          <button
                            style={miniBtn}
                            onClick={() => setAgeSel(new Set(popAgeColumns))}
                          >
                            全選択
                          </button>
                          <button
                            style={miniBtn}
                            onClick={() => setAgeSel(new Set())}
                          >
                            全解除
                          </button>
                        </div>
                      </div>

                      <div
                        style={{
                          marginTop: 8,
                          maxHeight: 200,
                          overflow: 'auto',
                          border: '1px solid rgba(0,0,0,0.1)',
                          borderRadius: 10,
                          padding: 10,
                          background: 'rgba(255,255,255,0.7)',
                        }}
                      >
                        {popAgeColumns.map((col) => (
                          <label
                            key={col}
                            style={{
                              display: 'flex',
                              gap: 8,
                              alignItems: 'center',
                              margin: '4px 0',
                            }}
                          >
                            <input
                              type="checkbox"
                              checked={ageSel.has(col)}
                              onChange={(e) => {
                                setAgeSel((prev) => {
                                  const next = new Set(prev);
                                  if (e.target.checked) next.add(col);
                                  else next.delete(col);
                                  return next;
                                });
                              }}
                            />
                            <span>{col}</span>
                          </label>
                        ))}
                      </div>

                      <div
                        style={{ marginTop: 10, fontSize: 12, opacity: 0.85 }}
                      >
                        ヒント:
                        「総数」行を使いたい場合は性別で「総数」にチェックを入れてください。
                      </div>
                    </>
                  )}
                </Section>
              )}

              {mode === 'household' && (
                <Section title="世帯モード（階層選択）">
                  {!hhRows ? (
                    <div style={{ fontSize: 12, opacity: 0.75 }}>
                      世帯データが読み込まれると選択肢が表示されます。
                    </div>
                  ) : (
                    <>
                      <div
                        style={{
                          fontSize: 12,
                          fontWeight: 800,
                          marginBottom: 6,
                        }}
                      >
                        行（世帯員の年齢による世帯の種類）
                      </div>
                      <select
                        value={hhRowType}
                        onChange={(e) => setHhRowType(e.target.value)}
                        style={selectStyle}
                      >
                        {householdRowTypeOptions.map((v) => (
                          <option key={v} value={v}>
                            {v}
                          </option>
                        ))}
                      </select>

                      <div
                        style={{ marginTop: 10, fontSize: 12, fontWeight: 800 }}
                      >
                        指標（家族類型）
                      </div>
                      <div
                        style={{
                          marginTop: 8,
                          border: '1px solid rgba(0,0,0,0.1)',
                          borderRadius: 10,
                          padding: 10,
                          background: 'rgba(255,255,255,0.7)',
                        }}
                      >
                        <HouseholdTree
                          node={HOUSEHOLD_HIERARCHY}
                          selectedKey={hhMetric}
                          onSelect={setHhMetric}
                          availableColumns={householdAvailableColumns}
                        />
                      </div>

                      <div
                        style={{ marginTop: 10, fontSize: 12, opacity: 0.85 }}
                      >
                        ※（再掲）系の列も使いたい場合は、必要に応じてツリーを増やしていけます。
                      </div>
                    </>
                  )}
                </Section>
              )}

              {mode === 'business' && (
                <Section title="事業所モード（暫定：数値列を選択して塗り分け）">
                  {!bizRows ? (
                    <div style={{ fontSize: 12, opacity: 0.75 }}>
                      事業所データは同梱されていません。
                    </div>
                  ) : businessNumericColumns.length === 0 ? (
                    <div style={{ fontSize: 12, opacity: 0.75 }}>
                      数値列が自動検出できませんでした。列名やデータ形式を見直してください。
                    </div>
                  ) : (
                    <>
                      <div
                        style={{
                          fontSize: 12,
                          fontWeight: 800,
                          marginBottom: 6,
                        }}
                      >
                        可視化する数値列
                      </div>
                      <select
                        value={bizMetric}
                        onChange={(e) => setBizMetric(e.target.value)}
                        style={selectStyle}
                      >
                        {businessNumericColumns.map((k) => (
                          <option key={k} value={k}>
                            {k}
                          </option>
                        ))}
                      </select>
                      <div
                        style={{ marginTop: 10, fontSize: 12, opacity: 0.85 }}
                      >
                        同一KEY_CODEが複数行ある場合は合算します（産業分類が縦持ち等を想定）。
                      </div>
                    </>
                  )}
                </Section>
              )}

              {mode === 'analysis' && (
                <Section title="分析モード（特化係数）">
                  {!hhRows ? (
                    <div style={{ fontSize: 12, opacity: 0.75 }}>
                      世帯データが読み込まれると分析が有効になります。
                    </div>
                  ) : (
                    <>
                      <div
                        style={{
                          fontSize: 12,
                          fontWeight: 800,
                          marginBottom: 6,
                        }}
                      >
                        行（世帯員の年齢による世帯の種類）
                      </div>
                      <select
                        value={hhRowType}
                        onChange={(e) => setHhRowType(e.target.value)}
                        style={selectStyle}
                      >
                        {householdRowTypeOptions.map((v) => (
                          <option key={v} value={v}>
                            {v}
                          </option>
                        ))}
                      </select>

                      <div
                        style={{
                          marginTop: 10,
                          fontSize: 12,
                          fontWeight: 800,
                          marginBottom: 6,
                        }}
                      >
                        特化係数の対象（分子）
                      </div>
                      {/* ★追加：プルダウン */}
                      <select
                        value={analysisMetric}
                        onChange={(e) => setAnalysisMetric(e.target.value)}
                        style={selectStyle}
                      >
                        {analysisMetricOptions.map((k) => (
                          <option key={k} value={k}>
                            {k}
                          </option>
                        ))}
                      </select>

                      <div
                        style={{ marginTop: 8, fontSize: 12, opacity: 0.85 }}
                      >
                        分母は「総数」列。市平均比率に対する各地域比率の倍率を表示します。
                      </div>
                      <div
                        style={{ marginTop: 10, fontSize: 12, opacity: 0.75 }}
                      >
                        ※h06の列に存在する指標のみ表示しています（毎回同じフォーマット想定）。
                      </div>
                    </>
                  )}
                </Section>
              )}

              {mode === 'restaurant' && (
                <Section title="飲食店モード（駅距離から位置を推定）">
                  {!restaurantRows ? (
                    <div style={{ fontSize: 12, opacity: 0.75 }}>
                      飲食店データが読み込まれるとプロットが有効になります。
                    </div>
                  ) : (
                    <>
                      <div style={{ fontSize: 12, opacity: 0.85 }}>
                        駅からの距離をもとに、駅周辺へ円状にばらしてプロットしています。
                      </div>
                      <div style={{ marginTop: 10 }}>
                        <div
                          style={{
                            fontSize: 12,
                            fontWeight: 700,
                            marginBottom: 6,
                          }}
                        >
                          マーカーサイズ
                        </div>
                        <input
                          type="range"
                          min={2}
                          max={10}
                          step={1}
                          value={restaurantRadius}
                          onChange={(e) =>
                            setRestaurantRadius(Number(e.target.value))
                          }
                          style={{ width: '100%' }}
                        />
                        <div style={{ fontSize: 12, opacity: 0.8, marginTop: 4 }}>
                          現在: {restaurantRadius}px
                        </div>
                      </div>
                      <div style={{ marginTop: 10, fontSize: 12 }}>
                        プロット件数: {restaurantPoints.length}件
                      </div>
                      <div style={{ marginTop: 12 }}>
                        <button
                          type="button"
                          style={btnStyle}
                          onClick={handleStationSummaryDownload}
                          disabled={
                            !showStationCatchment || !stationSummaryRows.length
                          }
                        >
                          駅500m圏内の全駅CSVをダウンロード
                        </button>
                        <div
                          style={{ marginTop: 6, fontSize: 12, opacity: 0.8 }}
                        >
                          {showStationCatchment
                            ? '駅500m圏内の飲食店集計をCSVで出力します。'
                            : '駅500m圏を表示中にダウンロードできます。'}
                        </div>
                      </div>
                      <div
                        style={{
                          marginTop: 12,
                          display: 'flex',
                          justifyContent: 'space-between',
                          alignItems: 'center',
                        }}
                      >
                        <div style={{ fontSize: 12, fontWeight: 800 }}>
                          評価フィルタ（0.25刻み）
                        </div>
                        <div style={{ display: 'flex', gap: 8 }}>
                          <button
                            style={miniBtn}
                            onClick={() =>
                              setRatingSel(
                                new Set(ratingOptions.map((opt) => opt.key))
                              )
                            }
                          >
                            全選択
                          </button>
                          <button
                            style={miniBtn}
                            onClick={() => setRatingSel(new Set())}
                          >
                            全解除
                          </button>
                        </div>
                      </div>
                      <div
                        style={{
                          marginTop: 8,
                          maxHeight: 180,
                          overflow: 'auto',
                          border: '1px solid rgba(0,0,0,0.1)',
                          borderRadius: 10,
                          padding: 10,
                          background: 'rgba(255,255,255,0.7)',
                        }}
                      >
                        {ratingOptions.map((opt) => (
                          <label
                            key={opt.key}
                            style={{
                              display: 'flex',
                              gap: 8,
                              alignItems: 'center',
                              margin: '4px 0',
                            }}
                          >
                            <input
                              type="checkbox"
                              checked={ratingSel.has(opt.key)}
                              onChange={(e) => {
                                setRatingSel((prev) => {
                                  const next = new Set(prev);
                                  if (e.target.checked) next.add(opt.key);
                                  else next.delete(opt.key);
                                  return next;
                                });
                              }}
                            />
                            <span>{opt.label}</span>
                          </label>
                        ))}
                      </div>
                      <div
                        style={{
                          marginTop: 12,
                          display: 'flex',
                          justifyContent: 'space-between',
                          alignItems: 'center',
                        }}
                      >
                        <div style={{ fontSize: 12, fontWeight: 800 }}>
                          カテゴリフィルタ
                        </div>
                        <div style={{ display: 'flex', gap: 8 }}>
                          <button
                            style={miniBtn}
                            onClick={() =>
                              setCategorySel(
                                new Set(
                                  restaurantCategoryOptions.map((opt) => opt.key)
                                )
                              )
                            }
                          >
                            全選択
                          </button>
                          <button
                            style={miniBtn}
                            onClick={() => setCategorySel(new Set())}
                          >
                            全解除
                          </button>
                        </div>
                      </div>
                      <div
                        style={{
                          marginTop: 8,
                          maxHeight: 180,
                          overflow: 'auto',
                          border: '1px solid rgba(0,0,0,0.1)',
                          borderRadius: 10,
                          padding: 10,
                          background: 'rgba(255,255,255,0.7)',
                        }}
                      >
                        {restaurantCategoryOptions.length ? (
                          restaurantCategoryOptions.map((opt) => (
                            <label
                              key={opt.key}
                              style={{
                                display: 'flex',
                                gap: 8,
                                alignItems: 'center',
                                margin: '4px 0',
                              }}
                            >
                              <input
                                type="checkbox"
                                checked={categorySel.has(opt.key)}
                                onChange={(e) => {
                                  setCategorySel((prev) => {
                                    const next = new Set(prev);
                                    if (e.target.checked) next.add(opt.key);
                                    else next.delete(opt.key);
                                    return next;
                                  });
                                }}
                              />
                              <span>{opt.label}</span>
                            </label>
                          ))
                        ) : (
                          <div style={{ fontSize: 12, opacity: 0.75 }}>
                            カテゴリ候補を読み込み中です。
                          </div>
                        )}
                      </div>
                      <div style={{ marginTop: 12 }}>
                        <button
                          type="button"
                          style={btnStyle}
                          onClick={handleRestaurantGeocode}
                          disabled={restaurantGeoRunning}
                        >
                          緯度経度取得（国土地理院）
                        </button>
                      </div>
                      <div style={{ marginTop: 8, fontSize: 12, opacity: 0.8 }}>
                        住所から緯度経度を取得し、CSVを自動ダウンロードします。
                      </div>
                      {restaurantGeoProgress.total > 0 && (
                        <div style={{ marginTop: 6, fontSize: 12 }}>
                          進捗: {restaurantGeoProgress.done}/
                          {restaurantGeoProgress.total}
                        </div>
                      )}
                      {restaurantGeoStatus ? (
                        <div style={{ marginTop: 6, fontSize: 12 }}>
                          {restaurantGeoStatus}
                        </div>
                      ) : null}
                    </>
                  )}
                </Section>
              )}

              {mode === 'restaurant-analysis' && (
                <Section title="飲食店分析（250m格子ヒートマップ）">
                  {!restaurantGeoPoints.length ? (
                    <div style={{ fontSize: 12, opacity: 0.75 }}>
                      緯度・経度付きの飲食店データが読み込まれていません。
                    </div>
                  ) : (
                    <>
                      <div style={{ fontSize: 12, opacity: 0.85 }}>
                        250m × 250m の格子内に含まれる飲食店数で塗り分けます。
                      </div>
                      <div style={{ marginTop: 8, fontSize: 12, opacity: 0.85 }}>
                        表示中の市境の最北・最南・最東・最西を含む範囲で格子を作成し、
                        その全てを計算対象にしています。
                      </div>
                      <div style={{ marginTop: 10, fontSize: 12 }}>
                        対象件数: {restaurantGeoPoints.length}件
                      </div>
                    </>
                  )}
                </Section>
              )}

              {/* Data health */}
              <Section title="読み込み状況">
                <div style={kvRow}>
                  <span style={kvKey}>地図</span>
                  <span style={kvVal}>
                    {displayShapeGeo
                      ? `OK（${displayShapeGeo.features.length}ポリゴン）`
                      : '未'}
                  </span>
                </div>
                <div style={kvRow}>
                  <span style={kvKey}>人口</span>
                  <span style={kvVal}>
                    {popRows ? `OK（${popRows.length}行）` : '未'}
                  </span>
                </div>
                <div style={kvRow}>
                  <span style={kvKey}>世帯</span>
                  <span style={kvVal}>
                    {hhRows ? `OK（${hhRows.length}行）` : '未'}
                  </span>
                </div>
                <div style={kvRow}>
                  <span style={kvKey}>事業所</span>
                  <span style={kvVal}>
                    {bizRows ? `OK（${bizRows.length}行）` : '未（同梱なし）'}
                  </span>
                </div>
                <div style={kvRow}>
                  <span style={kvKey}>飲食店</span>
                  <span style={kvVal}>
                    {restaurantRows
                      ? `OK（${restaurantRows.length}行）`
                      : '未'}
                  </span>
                </div>
              </Section>
            </div>
          )}
        </div>

        {/* Legend */}
        {displayShapeGeo && mode !== 'restaurant' && mode !== 'ridership' && (
          <Legend
            mode={mode}
            min={valueStats.min}
            max={valueStats.max}
            midLabel={mode === 'analysis' ? '1.0' : null}
            layout={legendLayout}
          />
        )}
      </div>
    </div>
  );
}

function ModeBtn({ label, active, onClick }) {
  return (
    <button
      onClick={onClick}
      style={{
        padding: '8px 10px',
        borderRadius: 10,
        border: '1px solid rgba(0,0,0,0.12)',
        background: active ? 'rgba(0,0,0,0.88)' : 'rgba(255,255,255,0.9)',
        color: active ? '#fff' : '#111',
        fontWeight: 800,
        fontSize: 12,
        cursor: 'pointer',
      }}
    >
      {label}
    </button>
  );
}

function Section({ title, children }) {
  return (
    <div style={{ marginBottom: 12 }}>
      <div style={{ fontSize: 12, fontWeight: 900, marginBottom: 8 }}>
        {title}
      </div>
      <div>{children}</div>
    </div>
  );
}

function ErrBox({ text }) {
  return (
    <div
      style={{
        marginTop: 6,
        marginBottom: 10,
        background: 'rgba(255,0,0,0.06)',
        border: '1px solid rgba(255,0,0,0.18)',
        borderRadius: 10,
        padding: 10,
        fontSize: 12,
        color: '#7a1010',
        whiteSpace: 'pre-wrap',
      }}
    >
      {text}
    </div>
  );
}

const btnStyle = {
  padding: '8px 10px',
  borderRadius: 10,
  border: '1px solid rgba(0,0,0,0.12)',
  background: 'rgba(255,255,255,0.9)',
  cursor: 'pointer',
  fontWeight: 800,
  fontSize: 12,
};

const miniBtn = {
  padding: '6px 8px',
  borderRadius: 10,
  border: '1px solid rgba(0,0,0,0.12)',
  background: 'rgba(255,255,255,0.9)',
  cursor: 'pointer',
  fontWeight: 800,
  fontSize: 12,
};

const selectStyle = {
  width: '100%',
  padding: '8px 10px',
  borderRadius: 10,
  border: '1px solid rgba(0,0,0,0.14)',
  background: 'rgba(255,255,255,0.95)',
  fontSize: 12,
};

const kvRow = {
  display: 'flex',
  justifyContent: 'space-between',
  gap: 10,
  padding: '6px 10px',
  borderRadius: 10,
  border: '1px solid rgba(0,0,0,0.08)',
  background: 'rgba(255,255,255,0.7)',
  marginBottom: 6,
  fontSize: 12,
};

const kvKey = { fontWeight: 900, opacity: 0.85 };
const kvVal = { fontWeight: 800 };
