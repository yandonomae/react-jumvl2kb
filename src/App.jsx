import React, { useEffect, useMemo, useRef, useState } from 'react';
import shp from 'shpjs';
import Papa from 'papaparse';
import { geoMercator, geoPath } from 'd3-geo';
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

const DEFAULT_MODE = 'population'; // population | household | business | analysis

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

function getCityCodeFromFeature(feature) {
  const key = normalizeKeyString(feature?.properties?.KEY_CODE);
  return key.length >= 5 ? key.slice(0, 5) : '';
}

function getCityCodeFromBoundaryFeature(feature) {
  if (!feature?.properties) return '';
  const props = feature.properties;
  const direct =
    normalizeKeyString(
      props.CITY_CODE ??
        props.city_code ??
        props.code ??
        props.CITY ??
        props.city ??
        props['市区町村コード'] ??
        props['市区町村ｺｰﾄﾞ']
    ) || '';
  if (direct) return direct.slice(0, 5);

  const name =
    normalizeKeyString(
      props.CITY_NAME ?? props.city_name ?? props.name ?? props['市区町村名']
    ) || '';
  return CITY_NAME_TO_CODE[name] || '';
}

async function loadGeoJsonFromUrl(url) {
  const res = await fetch(url);
  if (!res.ok) {
    throw new Error(`市境データの取得に失敗しました (${res.status}) - ${url}`);
  }
  return res.json();
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

function Legend({ mode, min, max, midLabel }) {
  const width = 220;
  const height = 12;

  const stops = useMemo(() => {
    const n = 16;
    const out = [];
    for (let i = 0; i <= n; i++) out.push(i / n);
    return out;
  }, []);

  const gradientId = `grad_${mode}`;

  const getColor = (t) => {
    if (mode === 'population') return interpolateYlOrRd(t);
    if (mode === 'household') return interpolateGreens(t);
    if (mode === 'business') return interpolatePurples(t);
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
          : '分析（特化係数）'}
        ）
      </div>
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
      {mode !== 'analysis' && (
        <div style={{ marginTop: 6, fontSize: 12, opacity: 0.8 }}>
          最大値を基準に自動スケール（線形）
        </div>
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
  const [dataLoading, setDataLoading] = useState(false);

  // UI状態
  const [panelOpen, setPanelOpen] = useState(true);
  const [showRail, setShowRail] = useState(true);
  const [railWidth, setRailWidth] = useState(2.4); // ★追加：線幅
  const [stationRadius, setStationRadius] = useState(5);
  const [boldCityBoundary, setBoldCityBoundary] = useState(false);
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
      setBoundaryErr('');
      setShapeGeo(null);
      setBoundaryGeo(null);
      setBoundaryUrl('');
      setPopRows(null);
      setHhRows(null);

      const loadShape = async () => {
        if (DEFAULT_DATA_FILES.shapeBases?.length) {
          return loadShapefilesFromUrls(DEFAULT_DATA_FILES.shapeBases);
        }
        throw new Error('地図データのパスが指定されていません');
      };

      const [shapeRes, popRes, hhRes, boundaryRes] =
        await Promise.allSettled([
        loadShape(),
        fetchBuffer(DEFAULT_DATA_FILES.populationCsv),
        fetchBuffer(DEFAULT_DATA_FILES.householdCsv),
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

  useEffect(() => {
    if (!analysisMetricOptions.length) return;
    if (analysisMetricOptions.includes(analysisMetric)) return;
    setAnalysisMetric(analysisMetricOptions[0]);
  }, [analysisMetricOptions, analysisMetric]);

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

  // --- Stats + color scale ---
  const valueStats = useMemo(() => {
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
  ]);

  const colorForValue = useMemo(() => {
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
    if (!boundaryGeo?.features?.length || !selectedCityCodes.length) return [];
    const selectedSet = new Set(selectedCityCodes);
    return boundaryGeo.features.filter((feature) =>
      selectedSet.has(getCityCodeFromBoundaryFeature(feature))
    );
  }, [boundaryGeo, selectedCityCodes]);

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

  const cityLabel = useMemo(() => {
    if (!selectedCityNames.length) return '';
    return `（${selectedCityNames.join('・')}）`;
  }, [selectedCityNames]);

  const winW = typeof window !== 'undefined' ? window.innerWidth : 1200;
  const winH = typeof window !== 'undefined' ? window.innerHeight : 800;

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
              {/* Choropleth polygons */}
              {displayShapeGeo.features.map((f, idx) => {
                const k = normalizeKeyString(f?.properties?.KEY_CODE);
                const v = featureValue.get(k);
                const hasV = v !== null && v !== undefined && !Number.isNaN(v);
                const fill = hasV ? colorForValue(Number(v)) : '#f2f2f2';

                return (
                  <path
                    key={`${k}_${idx}`}
                    d={pathGen(f)}
                    fill={fill}
                    stroke={
                      boldCityBoundary ? 'rgba(0,0,0,0.75)' : 'rgba(0,0,0,0.35)'
                    }
                    strokeWidth={
                      (boldCityBoundary ? 1.2 : 0.6) / transform.k
                    }
                    onMouseEnter={(e) => onFeatureEnter(e, f)}
                    onMouseMove={onFeatureMove}
                    onMouseLeave={onFeatureLeave}
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
                      <text
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
                    </g>
                  ))}
                </>
              )}
            </g>
          )}
        </svg>

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
                  gridTemplateColumns: 'repeat(4, 1fr)',
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
              </Section>
            </div>
          )}
        </div>

        {/* Legend */}
        {displayShapeGeo && (
          <Legend
            mode={mode}
            min={valueStats.min}
            max={valueStats.max}
            midLabel={mode === 'analysis' ? '1.0' : null}
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
