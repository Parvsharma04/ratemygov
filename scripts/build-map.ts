import { readFileSync, writeFileSync, statSync, existsSync, unlinkSync } from 'node:fs';
import { execFileSync } from 'node:child_process';
import { resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

// Approved Survey of India boundary GeoJSON mapping to canonical slugs
const NAME_MAP: Record<string, string> = {
  'DADRA & NAGAR HAVELI & DAMAN & DIU': 'dadra-and-nagar-haveli-and-daman-and-diu',
  'ANDAMAN & NICOBAR': 'andaman-and-nicobar-islands',
};

function stateNameToSlug(name: string): string {
  if (NAME_MAP[name]) return NAME_MAP[name];
  return name
    .toLowerCase()
    .replace(/ & /g, '-and-')
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-|-$/g, '');
}

async function buildMap(): Promise<void> {
  const inputPath = process.argv[2]
    ? resolve(process.cwd(), process.argv[2])
    : resolve(__dirname, '../data/soi_states.geojson');

  if (!existsSync(inputPath)) {
    console.error(`Error: Source boundary file not found at ${inputPath}`);
    process.exit(1);
  }

  console.log(`Reading approved boundary file: ${inputPath}`);
  const geojsonRaw = readFileSync(inputPath, 'utf8');
  const geojson = JSON.parse(geojsonRaw);

  if (!geojson.features || geojson.features.length !== 36) {
    console.error(`Expected 36 features for Indian States & UTs, found ${geojson.features?.length}`);
    process.exit(1);
  }

  // Ensure each feature has the slug assigned for id-field in mapshaper
  for (const feature of geojson.features) {
    const rawName = feature.properties?.state_name;
    const slug = stateNameToSlug(rawName);
    feature.properties = { ...feature.properties, slug };
  }

  const tempGeojsonPath = resolve(__dirname, '../data/_temp_tagged.geojson');
  writeFileSync(tempGeojsonPath, JSON.stringify(geojson));

  const tempSvgPath = resolve(__dirname, '../data/_temp_output.svg');

  /**
   * EXACT MAPSHAPER SETTINGS:
   * - Command: npx mapshaper
   * - Simplification: -simplify 7% keep-shapes
   *   - Percentage: 7% (retains key topological fidelity while bringing raw TS under 40 KB)
   *   - keep-shapes: prevents small islands and small territories (Lakshadweep, Andaman & Nicobar,
   *     Chandigarh, Puducherry) from disappearing during simplification
   * - Output format: -o format=svg precision=0.1 id-field=slug
   *   - precision=0.1: rounds SVG coordinates to 1 decimal place
   *   - id-field=slug: assigns the canonical state slug as the SVG path id
   */
  const SIMPLIFY_PERCENTAGE = '7%';
  const PRECISION = '0.1';

  console.log(`Running mapshaper with:`);
  console.log(`  -simplify ${SIMPLIFY_PERCENTAGE} keep-shapes`);
  console.log(`  -o format=svg precision=${PRECISION} id-field=slug`);

  execFileSync(
    'npx',
    [
      'mapshaper',
      tempGeojsonPath,
      '-simplify',
      `${SIMPLIFY_PERCENTAGE}`,
      'keep-shapes',
      '-o',
      'format=svg',
      `precision=${PRECISION}`,
      'id-field=slug',
      tempSvgPath,
    ],
    { stdio: 'inherit' }
  );

  const svgContent = readFileSync(tempSvgPath, 'utf8');

  // Extract shared viewBox
  const viewBoxMatch = svgContent.match(/viewBox="([^"]+)"/);
  if (!viewBoxMatch) {
    console.error('Failed to extract viewBox from generated SVG');
    process.exit(1);
  }
  const viewBox = viewBoxMatch[1];

  // Extract each path with its slug
  const pathRegex =
    /<path\s+[^>]*d="([^"]+)"[^>]*id="([^"]+)"[^>]*\/?>|<path\s+[^>]*id="([^"]+)"[^>]*d="([^"]+)"[^>]*\/?>/g;
  const paths: Record<string, string> = {};
  let match;

  while ((match = pathRegex.exec(svgContent)) !== null) {
    const d = match[1] || match[4];
    const slug = match[2] || match[3];
    if (slug && slug !== 'soi_states') {
      paths[slug] = d;
    }
  }

  const slugsFound = Object.keys(paths);
  console.log(`Extracted paths for ${slugsFound.length} states/UTs.`);

  if (slugsFound.length !== 36) {
    console.warn(`Warning: Expected 36 states, extracted ${slugsFound.length}`);
  }

  // Generate src/lib/map-paths.ts
  const outputPath = resolve(__dirname, '../src/lib/map-paths.ts');
  const code = `/**
 * Official Survey of India administrative boundary SVG paths.
 *
 * Generated automatically by scripts/build-map.ts.
 * Source: Approved Survey of India Pan-India boundary GeoJSON (36 States & UTs).
 * Mapshaper settings:
 *   - Simplification: 7% (weighted Visvalingam with keep-shapes enabled)
 *   - Coordinate precision: 0.1 (rounded to 1 decimal place)
 *
 * In compliance with the Geospatial Information Regulation Act, 2016.
 */

export const MAP_VIEWBOX = ${JSON.stringify(viewBox)};

export interface StateMapPath {
  slug: string;
  d: string;
}

export const STATE_PATHS: Record<string, string> = ${JSON.stringify(paths, null, 2)};
`;

  writeFileSync(outputPath, code, 'utf8');
  const rawSize = statSync(outputPath).size;
  console.log(`Generated ${outputPath} (${(rawSize / 1024).toFixed(2)} KB raw, ${rawSize} bytes).`);
  console.log(`Target was 40 KB raw or less. Budget met: ${rawSize <= 40960 ? 'YES' : 'NO'}`);

  // Remove intermediate artifacts
  for (const tempPath of [tempGeojsonPath, tempSvgPath]) {
    try {
      unlinkSync(tempPath);
    } catch {
      // best effort; already gone is fine
    }
  }
}

buildMap().catch((err) => {
  console.error(err);
  process.exit(1);
});
